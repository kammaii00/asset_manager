/**
 * 데이터 수집 파이프라인 — 캐시를 우선 쓰고 부족한 것만 외부에서 받아온다.
 *
 * 수집 원칙(설계 문서 §7): 요청받은 종목만, 요청받은 그때.
 * 정기 수집 스케줄러는 두지 않는다.
 */

import admin from "firebase-admin";
import { fetchFinancialStatements, fetchDisclosures, fetchDividendInfo } from "./clients/dart.js";
import { fetchCurrentPrice, fetchInvestorFlows, createFirestoreTokenStore } from "./clients/kis.js";
import { fetchStockNews } from "./clients/naver.js";
import { normalizeAnnual, mergeAnnualSeries } from "./financials.js";
import { normalizeDividendRows } from "./dividend.js";
import { normalizeQuote, extractFlags, resolveMarket, toYahooSymbol, isValidQuote } from "./stockEnrichment.js";

// 재무제표는 분기당 최대 1회 바뀌므로 캐시를 길게 잡는다
const FINANCIALS_TTL_DAYS = 30;

const YYYYMMDD = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");

/**
 * 연간 재무제표를 가져온다. 캐시가 신선하면 외부 호출을 건너뛴다.
 *
 * DART는 한 번의 호출로 3개년을 주므로 2회 호출이면 6개년이 확보된다.
 */
async function loadFinancials(db, ticker, corpCode, dartKey) {
    const ref = db.collection("stock_master").doc(ticker).collection("financials").doc("annual");
    const snap = await ref.get();

    if (snap.exists) {
        const cached = snap.data();
        const ageMs = Date.now() - (cached.updatedAt?.toMillis?.() ?? 0);
        // 배당금지급 계정을 추가하기 전에 저장된 캐시에는 그 항목이 아예 없다.
        // normalizeAnnual은 값이 없어도 키는 항상 채우므로, 키의 유무로 구버전 캐시를 가려낸다.
        const hasDividendField = cached.series?.every((record) => "dividendsPaid" in record);
        if (ageMs < FINANCIALS_TTL_DAYS * 86400000 && cached.series?.length && hasDividendField) {
            return { series: cached.series, fromCache: true };
        }
    }

    // 직전 사업연도부터 역산한다. 연초에는 전년도 보고서가 아직 안 나왔을 수 있어
    // 한 해 더 뒤에서 시작하고, 빈 응답은 mergeAnnualSeries가 걸러낸다.
    const baseYear = new Date().getFullYear() - 1;
    const responses = [];
    for (const year of [baseYear, baseYear - 3]) {
        try {
            const res = await fetchFinancialStatements(dartKey, corpCode, year, "11011", "CFS");
            responses.push(normalizeAnnual(res.list || [], year));
        } catch (error) {
            console.warn(`재무제표 ${year}년 조회 실패 — ${error.message}`);
            responses.push([]);
        }
    }

    let series = mergeAnnualSeries(responses);

    // 연결재무제표를 제출하지 않는 회사는 별도(OFS)로 재시도한다
    if (series.length === 0) {
        const res = await fetchFinancialStatements(dartKey, corpCode, baseYear, "11011", "OFS");
        series = normalizeAnnual(res.list || [], baseYear);
    }

    if (series.length > 0) {
        await ref.set({ series, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    return { series, fromCache: false };
}

/**
 * 배당사항을 가져온다. 재무제표와 같은 캐시 수명을 쓴다(둘 다 사업보고서에서 나온다).
 *
 * 한 번의 호출로 3개년이 오므로 직전 사업연도만 조회하면 된다.
 * 무배당 회사는 DART가 status 013(데이터 없음)을 주고, 클라이언트가 이를 빈 list로 정규화한다.
 */
async function loadDividend(db, ticker, corpCode, dartKey) {
    const ref = db.collection("stock_master").doc(ticker).collection("financials").doc("dividend");
    const snap = await ref.get();

    if (snap.exists) {
        const cached = snap.data();
        const ageMs = Date.now() - (cached.updatedAt?.toMillis?.() ?? 0);
        if (ageMs < FINANCIALS_TTL_DAYS * 86400000 && Array.isArray(cached.rows)) {
            return cached.rows;
        }
    }

    const baseYear = new Date().getFullYear() - 1;
    const res = await fetchDividendInfo(dartKey, corpCode, baseYear);
    const rows = normalizeDividendRows(res.list || [], baseYear);

    // 무배당이라 빈 배열인 경우도 캐싱한다 — 매번 다시 물어볼 이유가 없다
    await ref.set({ rows, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return rows;
}

/**
 * 투자자별 매매동향 요약.
 *
 * KIS는 최근 30 거래일만 반환한다. 원본 배열을 그대로 AI에 넘기면 토큰만 낭비하므로
 * 누적 순매수와 매수 우위 일수로 압축한다.
 */
export function summarizeFlows(rows) {
    if (!rows?.length) return null;

    const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
    const sum = (key) => rows.reduce((acc, r) => acc + num(r[key]), 0);
    const buyDays = (key) => rows.filter((r) => num(r[key]) > 0).length;

    return {
        days: rows.length,
        foreign: { netQty: sum("frgn_ntby_qty"), netAmountKrw: sum("frgn_ntby_tr_pbmn") * 1_000_000, buyDays: buyDays("frgn_ntby_qty") },
        institution: { netQty: sum("orgn_ntby_qty"), netAmountKrw: sum("orgn_ntby_tr_pbmn") * 1_000_000, buyDays: buyDays("orgn_ntby_qty") },
        individual: { netQty: sum("prsn_ntby_qty"), netAmountKrw: sum("prsn_ntby_tr_pbmn") * 1_000_000, buyDays: buyDays("prsn_ntby_qty") },
    };
}

/**
 * 종목 하나에 필요한 모든 데이터를 모은다.
 *
 * @param secrets { dartKey, kisAppKey, kisAppSecret, naverId, naverSecret }
 */
export async function collectStockData(db, ticker, secrets, onProgress = async () => {}) {
    const masterRef = db.collection("stock_master").doc(ticker);
    const masterSnap = await masterRef.get();
    if (!masterSnap.exists) {
        throw new Error(`종목마스터에 없는 종목입니다: ${ticker}`);
    }
    const master = masterSnap.data();

    await onProgress({ step: 1, message: "시세·수급 조회 중", pct: 15 });

    const credentials = {
        appKey: secrets.kisAppKey,
        appSecret: secrets.kisAppSecret,
        store: createFirestoreTokenStore(db),
    };

    const output = await fetchCurrentPrice(credentials, ticker);
    const quote = normalizeQuote(output);
    if (!isValidQuote(quote)) {
        await masterRef.set({ tradable: false, enrichedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        throw new Error("실존하지 않거나 거래할 수 없는 종목입니다");
    }

    const market = resolveMarket(output.rprs_mrkt_kor_name);
    const flags = extractFlags(output);
    const sector = output.bstp_kor_isnm || null;

    // 조회한 김에 종목마스터도 최신화한다 (요청 시점 보강 방식)
    await masterRef.set(
        {
            market,
            sector,
            yahooSymbol: toYahooSymbol(ticker, market),
            tradable: true,
            quote,
            flags,
            enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
    );

    const flows = summarizeFlows(await fetchInvestorFlows(credentials, ticker));

    await onProgress({ step: 2, message: "재무제표 수집 중", pct: 35 });
    const { series, fromCache } = await loadFinancials(db, ticker, master.corpCode, secrets.dartKey);
    if (series.length === 0) {
        throw new Error("재무제표를 가져오지 못했습니다 (신규 상장이거나 미제출일 수 있습니다)");
    }

    await onProgress({ step: 2, message: "공시·뉴스 수집 중", pct: 45 });
    const today = new Date();
    const from = new Date(today.getTime() - 180 * 86400000);

    // 공시·뉴스·배당은 서로 독립적이므로 병렬로 받는다.
    // 모두 보조 입력값이라 실패해도 분석은 계속한다.
    const [disclosureResult, newsResult, dividendResult] = await Promise.allSettled([
        fetchDisclosures(secrets.dartKey, master.corpCode, YYYYMMDD(from), YYYYMMDD(today), 30),
        fetchStockNews(secrets.naverId, secrets.naverSecret, master.name, { days: 90, display: 30 }),
        loadDividend(db, ticker, master.corpCode, secrets.dartKey),
    ]);

    if (disclosureResult.status === "rejected") console.warn(`공시 조회 실패 — ${disclosureResult.reason.message}`);
    if (newsResult.status === "rejected") console.warn(`뉴스 조회 실패 — ${newsResult.reason.message}`);
    if (dividendResult.status === "rejected") console.warn(`배당사항 조회 실패 — ${dividendResult.reason.message}`);

    return {
        stock: {
            ticker,
            name: master.name,
            corpCode: master.corpCode,
            market,
            sector,
            quote,
            flags,
        },
        series,
        flows,
        disclosures: disclosureResult.status === "fulfilled" ? disclosureResult.value.list || [] : [],
        news: newsResult.status === "fulfilled" ? newsResult.value : { items: [], total: 0 },
        dividendRows: dividendResult.status === "fulfilled" ? dividendResult.value : [],
        financialsFromCache: fromCache,
    };
}

/**
 * 사용자의 보유 현황을 포트폴리오 맥락으로 요약한다.
 *
 * 종합 판단에서 "이미 특정 업종에 치우쳐 있는가"를 보게 하기 위한 것으로,
 * 이 기능을 별도 앱이 아니라 자산관리 앱에 통합한 핵심 이유다.
 * 시세를 새로 조회하지 않고 앱이 이미 가진 값만 쓴다.
 */
export async function loadPortfolioContext(db, uid) {
    const snap = await db.collection("users").doc(uid).collection("assets").where("type", "==", "stock").get();
    if (snap.empty) return null;

    const holdings = snap.docs
        .map((doc) => {
            const d = doc.data();
            const value = Number(d.currentValue ?? d.amount ?? 0);
            return { name: d.name || d.symbol || "이름 없음", value };
        })
        .filter((h) => h.value > 0);

    if (holdings.length === 0) return null;

    const total = holdings.reduce((acc, h) => acc + h.value, 0);
    return {
        totalValueKrw: Math.round(total),
        holdings: holdings
            .map((h) => ({ name: h.name, weightPct: Math.round((h.value / total) * 1000) / 10 }))
            .sort((a, b) => b.weightPct - a.weightPct)
            .slice(0, 15),
    };
}
