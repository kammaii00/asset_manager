import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import { default as YahooFinance } from "yahoo-finance2";

// Gemini API 키는 Firebase Secret Manager로 주입 (firebase functions:secrets:set GEMINI_API_KEY)
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// 시황과 함께 보여줄 대표 지수·환율
const INDEX_TARGETS = [
    { symbol: "^KS11", name: "코스피" },
    { symbol: "^KQ11", name: "코스닥" },
    { symbol: "^IXIC", name: "나스닥" },
    { symbol: "^GSPC", name: "S&P500" },
    // 환율만 preferQuote — 24시간 거래라 야후의 일별 봉이 불규칙하다.
    // 실측(30일): 금요일 봉이 통째로 빠지고 일요일 봉이 대신 들어와 "전일 대비"를 계산할 수 없다.
    // 지수(^KS11·^KQ11 등)는 반대로 거래일 봉이 정확해 시계열 계산이 안전하다.
    { symbol: "KRW=X", name: "원/달러", preferQuote: true },
];

// VIX(변동성지수, 흔히 '공포지수') 구간별 시장 온도 — 통상적인 해석 기준
const VIX_LEVELS = [
    { max: 15, level: "calm", label: "안정" },
    { max: 20, level: "neutral", label: "보통" },
    { max: 30, level: "caution", label: "경계" },
    { max: Infinity, level: "fear", label: "공포" },
];

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// KST(Asia/Seoul) 기준 현재 시각 (UTC 필드를 읽으면 KST 값이 되도록 9시간 밀어 둔 Date)
function nowKST() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

// Date를 YYYY-MM-DD 문자열로 변환
function formatDate(date) {
    return date.toISOString().split("T")[0];
}

// KST(Asia/Seoul) 기준 오늘 날짜 문자열(YYYY-MM-DD) 반환
function getTodayKST() {
    return formatDate(nowKST());
}

// KST 기준 요일 (0=일 … 6=토) — 브리핑이 훑어야 할 뉴스 구간을 정할 때 쓴다
function getWeekdayKST() {
    return nowKST().getUTCDay();
}

// 브리핑에 담긴 지수·뉴스의 실제 기준일 = 직전 거래일.
// 07시 브리핑은 어제 국내 종가와 오늘 새벽 마감한 미국장(현지 기준 어제)을 담으므로
// 문서 ID(생성일)와 데이터 기준일이 하루 어긋난다. 사후 검증 때 헷갈리지 않도록 따로 기록한다.
// 월요일 07시 브리핑은 금요일 종가를 담으므로 3일 전으로 잡는다(주말은 실행되지 않음).
// 공휴일은 한쪽 시장만 쉬는 경우가 대부분이라 반영하지 않고 요일 규칙만 적용한다.
function resolveMarketDate(weekday) {
    const kst = nowKST();
    kst.setUTCDate(kst.getUTCDate() - (weekday === 1 ? 3 : 1));
    return formatDate(kst);
}

// 브리핑이 다룰 뉴스 구간 — 주말은 휴장이라 실행하지 않으므로,
// 월요일 브리핑은 금요일 장 마감(미국 종가는 토 06:00 KST) 이후 주말 전체를 훑어야 한다.
function resolveNewsWindow(weekday) {
    if (weekday === 1) {
        return {
            range: "지난 금요일 장 마감(미국 증시 종가 포함) 이후 주말 동안",
            cutoff: "지난 금요일 장 마감보다 이전의 뉴스는 제외하세요.",
        };
    }
    return {
        range: "최근 24시간 이내",
        cutoff: "이틀 이상 지난 오래된 뉴스는 제외하세요.",
    };
}

// 종가와 직전 종가로 등락률 계산 (소수 둘째 자리)
function toChangePercent(price, prev) {
    if (price == null || !prev) return null;
    return Number((((price - prev) / prev) * 100).toFixed(2));
}

// 최근 2거래일 종가 조회.
// 야후 quote의 등락률 필드는 종목에 따라 신뢰할 수 없다 —
// ^VIX는 change에 전일종가와 같은 값을 넣어 -54% 같은 불가능한 수치를 주고,
// ^KQ11은 07시 시점에 regularMarketPreviousClose가 며칠 전 종가에 머물러 있어
// 실제 +0.39%가 +7.39%로 부풀려 저장된 날이 있었다(2026-08-12 실측).
// 그래서 등락률은 quote가 아니라 일별 종가 시계열에서 직접 계산한다.
async function fetchDailyCloses(yf, symbol) {
    const period1 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const chart = await yf.chart(symbol, { period1, interval: "1d" });
    const closes = (chart?.quotes || []).map((q) => q?.close).filter((c) => c != null);
    if (closes.length < 2) return null;
    return { price: closes[closes.length - 1], prev: closes[closes.length - 2] };
}

// quote 기반 종가·등락률 (환율용 기본 경로이자, 시계열 조회가 실패했을 때의 대체 경로)
async function fetchPointFromQuote(yf, symbol) {
    const quote = await yf.quote(symbol);
    const price = quote?.regularMarketPrice;
    if (price == null) return null;
    return {
        price: Number(price.toFixed(2)),
        changePercent: toChangePercent(price, quote?.regularMarketPreviousClose),
    };
}

// 심볼 1종의 종가·등락률 — 지수는 일별 시계열, 환율은 quote.
// 시계열 조회가 실패해도 항목 전체가 빠지는 것보다는 낫기 때문에 quote로 대체한다.
async function fetchPoint(yf, symbol, preferQuote = false) {
    if (!preferQuote) {
        try {
            const series = await fetchDailyCloses(yf, symbol);
            if (series) {
                return {
                    price: Number(series.price.toFixed(2)),
                    changePercent: toChangePercent(series.price, series.prev),
                };
            }
            console.warn(`[briefing] ${symbol}: 일별 종가가 2개 미만 — quote로 대체`);
        } catch (error) {
            console.warn(`[briefing] ${symbol} 일별 시세 조회 실패: ${error.message} — quote로 대체`);
        }
    }
    return fetchPointFromQuote(yf, symbol);
}

// 대표 지수·환율의 최근 종가와 등락률 조회 (실패한 항목은 조용히 제외)
async function fetchIndices() {
    const yf = new YahooFinance();
    const results = await Promise.all(INDEX_TARGETS.map(async (target) => {
        try {
            const point = await fetchPoint(yf, target.symbol, target.preferQuote);
            return point ? { name: target.name, ...point } : null;
        } catch (error) {
            console.warn(`[briefing] 지수 조회 실패 ${target.symbol}: ${error.message}`);
            return null;
        }
    }));
    return results.filter(Boolean);
}

// VIX 실측값으로 시장 온도 판정 (모델 판단이 아니라 지표 기반이라 매일 기준이 동일하다)
async function fetchSentiment() {
    const yf = new YahooFinance();
    try {
        const point = await fetchPoint(yf, "^VIX");
        if (!point) return null;
        const matched = VIX_LEVELS.find((l) => point.price < l.max);
        return {
            level: matched.level,
            label: matched.label,
            vix: point.price,
            changePercent: point.changePercent,
        };
    } catch (error) {
        console.warn(`[briefing] VIX 조회 실패: ${error.message}`);
        return null;
    }
}

// Gemini에 보낼 프롬프트 구성 — 구글 검색으로 직전 거래일 이후의 증시 뉴스를 찾아 JSON으로 정리시킨다
function buildPrompt(date, indices, sentiment, weekday) {
    const vixNote = sentiment
        ? `${sentiment.vix} (${sentiment.label} 국면)`
        : "조회 실패";
    const newsWindow = resolveNewsWindow(weekday);
    return `오늘은 ${date} ${DAY_LABELS[weekday]}요일(한국 시간 오전)입니다. 당신은 개인 투자자를 위한 아침 증시 브리핑을 쓰는 애널리스트입니다.
구글 검색으로 "${newsWindow.range}"의 국내(한국) 증시와 해외(주로 미국) 증시 관련 주요 뉴스를 찾아, 아래 형식의 JSON만 출력하세요.

[참고: 대표 지수 등락률] ${JSON.stringify(indices)}
[참고: 변동성지수 VIX] ${vixNote}

출력 형식(JSON 외의 텍스트·마크다운·코드펜스 금지):
{
  "headline": "오늘 시장을 한 줄로 압축한 제목",
  "summary": "국내외 증시 흐름을 아우르는 2~3문장 요약",
  "domestic": [{ "title": "무슨 일이 있었는지", "detail": "그래서 시장에 어떤 의미인지" }],
  "overseas": [{ "title": "무슨 일이 있었는지", "detail": "그래서 시장에 어떤 의미인지" }],
  "watch": ["8월 1일 미국 고용지표 발표"]
}

작성 규칙:
1. domestic과 overseas 배열은 각각 정확히 3개 항목으로 채우세요. 위 형식에 항목이 하나씩만 적힌 것은 예시입니다. 말줄임표(...)를 그대로 출력하지 마세요.
2. headline은 40자 이내, title은 신문 기사 제목처럼 명사형으로 끊어 25자 이내로 쓰고 마침표를 붙이지 마세요. detail은 한 문장으로 쓰세요.
3. title에는 사실만, detail에는 해석만 담아 서로 중복되지 않게 쓰세요.
4. 검색으로 실제 확인한 사실만 쓰고, 확인되지 않은 내용을 지어내지 마세요.
5. watch는 "오늘부터 7일 이내"에 예정된 지표 발표·실적 발표·정책 이벤트만, 검색으로 날짜까지 확인된 것만 최대 3개 쓰세요. 확인되지 않으면 빈 배열 []로 두세요. 절대 추측해서 채우지 마세요.
6. 매수·매도 권유, 목표주가, 수익률 예측은 절대 쓰지 마세요. 사실과 해석만 담으세요.
7. ${newsWindow.cutoff}
8. 위 참고 지표(지수 등락·VIX)와 어긋나는 서술을 하지 마세요.
9. 모든 문장은 한국어로 쓰세요.`;
}

// 모델 응답 텍스트에서 JSON 블록만 안전하게 파싱 (코드펜스·잡텍스트 방어)
function parseBriefingJson(text) {
    if (!text) return null;
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch (error) {
        console.error(`[briefing] JSON 파싱 실패: ${error.message}`);
        return null;
    }
}

// 구글 검색 근거(grounding) 링크 추출 — 중복 제거 후 상위 5개
// 응답이 JSON 본문일 때는 근거가 안 붙어 빈 배열이 되기도 하므로 화면에서 없을 때를 대비할 것
function extractSources(candidate) {
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const seen = new Set();
    const sources = [];
    for (const chunk of chunks) {
        const web = chunk?.web;
        if (!web?.uri || !web?.title || seen.has(web.title)) continue;
        seen.add(web.title);
        sources.push({ title: web.title, url: web.uri });
        if (sources.length >= 5) break;
    }
    return sources;
}

// 뉴스 항목을 {title, detail} 형태로 정규화 (모델이 문자열만 줘도 깨지지 않게 방어)
function normalizeNewsItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => (typeof item === "string"
            ? { title: item.trim(), detail: "" }
            : { title: String(item?.title || "").trim(), detail: String(item?.detail || "").trim() }))
        .filter((item) => item.title)
        .slice(0, 4);
}

// 구글 검색을 붙인 Gemini 호출로 하루치 시황 본문 생성
async function generateBriefingBody(date, indices, sentiment, weekday) {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [{ role: "user", parts: [{ text: buildPrompt(date, indices, sentiment, weekday) }] }],
        config: { tools: [{ googleSearch: {} }] },
    });

    // 추론(thought) 파트는 본문이 아니므로 제외하고 텍스트만 합친다
    const candidate = response.candidates?.[0];
    const text = (candidate?.content?.parts || [])
        .filter((p) => !p.thought)
        .map((p) => p.text)
        .filter(Boolean)
        .join("");
    const parsed = parseBriefingJson(text);
    if (!parsed || !parsed.summary) {
        throw new Error("시황 응답을 해석하지 못했습니다.");
    }

    // 일부 필드가 비어도 나머지는 정상 표시되도록 항목별로 기본값을 채운다
    return {
        headline: String(parsed.headline || "").trim(),
        summary: String(parsed.summary).trim(),
        domestic: normalizeNewsItems(parsed.domestic),
        overseas: normalizeNewsItems(parsed.overseas),
        watch: Array.isArray(parsed.watch) ? parsed.watch.filter(Boolean).map(String).slice(0, 3) : [],
        sources: extractSources(candidate),
    };
}

/**
 * 평일(월~금) 오전 7시(KST)에 국내외 증시 뉴스를 정리해 공용 컬렉션에 저장한다.
 * - 07시는 미국 정규장 마감(최대 06:00 KST) 직후이자 국내 개장(09:00) 전이라 전일 종가가 모두 확정된 시점.
 * - 토·일요일은 국내·미국 모두 휴장이라 지수가 금요일 종가 그대로여서 실행하지 않는다.
 *   금요일 미국장(토 06:00 KST 마감) 결과와 주말 뉴스는 월요일 브리핑이 함께 다룬다(resolveNewsWindow 참고).
 * - 모든 유저가 같은 문서를 공유하므로 AI 호출은 유저 수와 무관하게 하루 1회.
 * - 문서 ID는 생성일(오늘)이지만 담긴 데이터는 직전 거래일 것이므로 `marketDate`로 기준일을 함께 남긴다.
 */
export const generateDailyBriefing = onSchedule({
    schedule: "0 7 * * 1-5",
    timeZone: "Asia/Seoul",
    memory: "512MiB",
    timeoutSeconds: 300,
    retryCount: 1,
    secrets: [geminiApiKey],
}, async () => {
    const date = getTodayKST();
    const weekday = getWeekdayKST();
    const marketDate = resolveMarketDate(weekday);
    try {
        console.log(`[briefing] ${date}(${DAY_LABELS[weekday]}) 시황 생성 시작 — 데이터 기준일 ${marketDate}`);
        const [indices, sentiment] = await Promise.all([fetchIndices(), fetchSentiment()]);
        const body = await generateBriefingBody(date, indices, sentiment, weekday);

        await admin.firestore().collection("market_briefings").doc(date).set({
            date,          // 문서 ID = 브리핑을 읽는 날(타임라인 병합 키)
            marketDate,    // 지수·뉴스의 실제 기준일(직전 거래일)
            ...body,
            indices,
            sentiment,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[briefing] ${date} 생성 완료 (VIX ${sentiment?.vix ?? '-'} / 국내 ${body.domestic.length}건 / 해외 ${body.overseas.length}건 / 일정 ${body.watch.length}건 / 출처 ${body.sources.length}건)`);
    } catch (error) {
        console.error(`[briefing] ${date} 시황 생성 실패:`, error);
        throw error; // 재시도 유도
    }
});
