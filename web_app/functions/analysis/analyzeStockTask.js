/**
 * 종목 분석 큐 함수 — 전체 파이프라인 오케스트레이션
 *
 * 분석 1건에 1~2분이 걸리므로 Next.js 라우트에서 직접 처리할 수 없다.
 * Cloud Tasks 큐 함수로 분리해 요청은 즉시 응답하고 작업은 백그라운드로 돌린다.
 *
 * 리전을 asia-northeast3(서울)로 둔 이유는 두 가지다.
 *  1. Firestore가 asia-northeast3에 있어 us-central1에서는 쓰기가 느리다
 *     (실측: 종목마스터 3,981건 적재에 4분 29초)
 *  2. ECOS(한국은행)가 해외 IP에서 접속되지 않을 가능성이 있다
 */

import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { collectStockData, loadPortfolioContext } from "./pipeline.js";
import { computeMetrics } from "./metrics.js";
import { runAnalysis } from "./analyzer.js";
import { fetchMacroContext } from "./clients/ecos.js";

const dartApiKey = defineSecret("DART_API_KEY");
const kisAppKey = defineSecret("KIS_APP_KEY");
const kisAppSecret = defineSecret("KIS_APP_SECRET");
const naverClientId = defineSecret("NAVER_CLIENT_ID");
const naverClientSecret = defineSecret("NAVER_CLIENT_SECRET");
const ecosApiKey = defineSecret("ECOS_API_KEY");
const claudeApiKey = defineSecret("CLAUDE_API_KEY");

const REGION = "asia-northeast3";

// KST 기준 오늘 날짜 — 리포트 문서 ID로 쓴다
function todayKST() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export const analyzeStock = onTaskDispatched(
    {
        region: REGION,
        secrets: [dartApiKey, kisAppKey, kisAppSecret, naverClientId, naverClientSecret, ecosApiKey, claudeApiKey],
        memory: "1GiB",
        timeoutSeconds: 540,
        retryConfig: {
            // 분석 1건에 LLM 비용이 발생하므로 재시도를 최소화한다.
            // 중복 과금은 아래 '이미 완료됨' 가드로 막는다.
            maxAttempts: 2,
            minBackoffSeconds: 30,
        },
        rateLimits: {
            // 동시에 여러 건을 돌리면 KIS 유량 제한에 함께 걸린다. 직렬 처리한다.
            maxConcurrentDispatches: 1,
        },
    },
    async (request) => {
        const { requestId, uid, ticker } = request.data;
        const db = admin.firestore();
        const requestRef = db.collection("users").doc(uid).collection("analysis_requests").doc(requestId);

        // 재시도로 다시 들어왔는데 이미 끝난 작업이면 LLM을 다시 호출하지 않는다
        const existing = await requestRef.get();
        if (existing.exists && existing.data().status === "done") {
            console.log(`이미 완료된 요청이므로 건너뜁니다: ${requestId}`);
            return;
        }

        const onProgress = async (progress) => {
            await requestRef.set({ status: "running", progress, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        };

        try {
            await onProgress({ step: 0, message: "분석을 시작합니다", pct: 5 });

            const secrets = {
                dartKey: dartApiKey.value(),
                kisAppKey: kisAppKey.value(),
                kisAppSecret: kisAppSecret.value(),
                naverId: naverClientId.value(),
                naverSecret: naverClientSecret.value(),
            };

            const collected = await collectStockData(db, ticker, secrets, onProgress);

            await onProgress({ step: 2, message: "정량 지표 계산 중", pct: 50 });
            const metrics = computeMetrics(collected.series, collected.stock.quote, collected.stock.flags);

            // 거시지표는 보조 입력값이다. 실패해도 분석을 멈추지 않는다.
            await onProgress({ step: 4, message: "거시지표 수집 중", pct: 52 });
            let macro = null;
            try {
                macro = await fetchMacroContext(ecosApiKey.value());
            } catch (error) {
                console.warn(`ECOS 조회 실패 — ${error.message}`);
            }

            const portfolio = await loadPortfolioContext(db, uid);

            const report = await runAnalysis({
                apiKey: claudeApiKey.value(),
                stock: collected.stock,
                metrics,
                flows: collected.flows,
                news: collected.news,
                disclosures: collected.disclosures,
                portfolio,
                onProgress,
            });

            // 리포트는 공용 경로에 둔다 — 같은 종목을 다시 분석할 때 재사용할 수 있다
            const reportDate = todayKST();
            const reportRef = db.collection("stock_analyses").doc(ticker).collection("reports").doc(reportDate);

            await reportRef.set({
                ticker,
                stockName: collected.stock.name,
                market: collected.stock.market,
                sector: collected.stock.sector,
                ...report,
                // 정량 지표를 리포트에 함께 남긴다.
                // 화면에서 표시할 뿐 아니라, 나중에 "그때 판단이 맞았나"를 검증하려면
                // 당시 계산값이 스냅샷으로 보존돼 있어야 한다.
                metrics,
                macro: macro ?? null,
                // 사후 검증용 — 6개월 뒤 "그때 판단이 맞았나"를 보려면 당시 가격이 있어야 한다
                priceAtAnalysis: collected.stock.quote.price,
                marketCapAtAnalysis: collected.stock.quote.marketCapKrw,
                financialYears: collected.series.map((r) => r.year),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            await requestRef.set(
                {
                    status: "done",
                    progress: { step: 6, message: "완료", pct: 100 },
                    reportPath: `stock_analyses/${ticker}/reports/${reportDate}`,
                    reportDate,
                    scoreTotal: report.scores.total,
                    grade: report.scores.grade,
                    priceAtAnalysis: collected.stock.quote.price,
                    costUsd: report.modelUsage.costUsd,
                    error: null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
            );

            console.log(`분석 완료 ${ticker} — ${report.scores.total}점(${report.scores.grade}), $${report.modelUsage.costUsd}`);
        } catch (error) {
            console.error(`분석 실패 ${ticker} — ${error.message}`);
            await requestRef.set(
                {
                    status: "failed",
                    error: error.message,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
            );
            // 재시도 대상인지 판단은 Cloud Tasks에 맡긴다
            throw error;
        }
    },
);
