/**
 * 분석 파이프라인 오케스트레이션 — 정성 분석 → 종합 판단 → 검증
 *
 * 설계 원칙: 계산은 코드가 한다.
 * AI는 5개 축에 점수만 매기고, 종합 점수·등급은 이 파일이 가중합으로 계산한다.
 * AI에게 곱셈·덧셈을 맡기면 리포트마다 총점이 달라진다.
 */

import { MODELS, callStructured, sumUsage } from "./clients/claude.js";
import {
    NEWS_SYSTEM, NEWS_SCHEMA,
    DISCLOSURE_SYSTEM, DISCLOSURE_SCHEMA,
    JUDGMENT_SYSTEM, JUDGMENT_SCHEMA,
    VERIFY_SYSTEM, VERIFY_SCHEMA,
    WEIGHTS, DISCLAIMER,
} from "./prompts.js";

// 등급 경계 — 종합 점수를 사람이 읽는 표현으로 바꾼다
const GRADES = [
    { min: 85, label: "매우 우수" },
    { min: 70, label: "우수" },
    { min: 55, label: "보통" },
    { min: 40, label: "주의" },
    { min: 0, label: "위험" },
];

/**
 * 종합 점수 계산 — AI가 매긴 5축 점수의 가중합.
 * 축 점수는 0~100 범위를 벗어날 수 있으므로 방어적으로 자른다.
 */
export function computeTotalScore(scores) {
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    const normalized = {};
    let total = 0;
    for (const [axis, weight] of Object.entries(WEIGHTS)) {
        normalized[axis] = clamp(scores[axis]);
        total += normalized[axis] * weight;
    }

    const rounded = Math.round(total);
    return {
        axes: normalized,
        total: rounded,
        grade: GRADES.find((g) => rounded >= g.min).label,
    };
}

/**
 * Red Flag가 있으면 등급 상단을 제한한다.
 *
 * 자본잠식·관리종목 같은 결격 사유가 있는데 "우수" 등급이 나오면
 * 리포트 전체의 신뢰가 무너진다. 점수와 무관하게 등급에 상한을 건다.
 */
export function applyRedFlagCap(scoreResult, redFlags) {
    const hasCritical = redFlags.some((f) => f.severity === "critical");
    const hasHigh = redFlags.some((f) => f.severity === "high");

    if (!hasCritical && !hasHigh) return scoreResult;

    // critical이면 '주의' 이하, high면 '보통' 이하로 제한
    const capLabel = hasCritical ? "주의" : "보통";
    const capIndex = GRADES.findIndex((g) => g.label === capLabel);
    const currentIndex = GRADES.findIndex((g) => g.label === scoreResult.grade);

    if (currentIndex >= capIndex) return scoreResult; // 이미 상한 이하

    return {
        ...scoreResult,
        grade: capLabel,
        gradeCapped: true,
        gradeCapReason: `결격 사유(${hasCritical ? "critical" : "high"})로 등급을 ${capLabel} 이하로 제한했습니다`,
    };
}

// JSON을 프롬프트에 넣을 때 토큰을 아끼기 위해 들여쓰기를 최소화한다
const toJson = (value) => JSON.stringify(value, null, 1);

/** 뉴스 분석 — 재료와 노이즈를 구분한다 */
export async function analyzeNews(apiKey, stockName, news) {
    if (!news?.items?.length) {
        return { data: { sentiment: "중립", keyEvents: [], noiseRatio: 0, summary: "최근 뉴스가 없습니다." }, usage: null };
    }

    const user = `종목명: ${stockName}
수집 기간 내 뉴스 ${news.items.length}건입니다.

${news.items.map((n, i) => `[${i + 1}] (${n.date}) ${n.title}\n    ${n.summary}`).join("\n")}`;

    return callStructured(apiKey, {
        model: MODELS.NEWS,
        system: NEWS_SYSTEM,
        user,
        schema: NEWS_SCHEMA,
        maxTokens: 8000,
    });
}

/** 공시 분석 — 주주가치 영향 이벤트를 찾는다 */
export async function analyzeDisclosures(apiKey, stockName, disclosures) {
    if (!disclosures?.length) {
        return { data: { events: [], summary: "최근 공시가 없습니다." }, usage: null };
    }

    const user = `종목명: ${stockName}
최근 공시 ${disclosures.length}건입니다.

${disclosures.map((d) => `(${d.rcept_dt}) ${d.report_nm}`).join("\n")}`;

    return callStructured(apiKey, {
        model: MODELS.DOCUMENT,
        system: DISCLOSURE_SYSTEM,
        user,
        schema: DISCLOSURE_SCHEMA,
        effort: "medium",
        maxTokens: 8000,
    });
}

/**
 * 종합 판단 — 정량 지표와 정성 분석을 종합한다.
 *
 * @param portfolio 보유 현황(선택). 있으면 포트폴리오 편중도를 함께 고려하게 한다.
 *                  이것이 별도 앱이 아니라 자산관리 앱에 통합한 이유다.
 */
export async function judge(apiKey, { stock, metrics, flows, newsResult, disclosureResult, portfolio }) {
    const sections = [
        `## 종목 정보`,
        `종목명: ${stock.name} (${stock.ticker})`,
        `시장: ${stock.market} / 업종: ${stock.sector ?? "정보 없음"}`,
        `현재가: ${stock.quote?.price?.toLocaleString() ?? "정보 없음"}원`,
        `시가총액: ${stock.quote?.marketCapKrw ? (stock.quote.marketCapKrw / 1e12).toFixed(2) + "조원" : "정보 없음"}`,
        `외국인 보유비중: ${stock.quote?.foreignRatio ?? "정보 없음"}%`,
        ``,
        `## 정량 지표 (코드로 계산 완료된 확정값)`,
        toJson(metrics),
        ``,
        // 수급은 Sentiment 축의 핵심 입력값이다. 국내 시장에서 외국인·기관 순매수는
        // 단기 주가를 설명하는 가장 강한 변수 중 하나이므로 반드시 함께 넘긴다.
        `## 투자자별 수급 (최근 거래일 누적, 순매수 수량과 금액)`,
        flows ? toJson(flows) : "수급 데이터를 가져오지 못했습니다",
        ``,
        `## 뉴스 분석 결과`,
        toJson(newsResult.data),
        ``,
        `## 공시 분석 결과`,
        toJson(disclosureResult.data),
    ];

    if (portfolio?.holdings?.length) {
        sections.push(
            ``,
            `## 사용자의 현재 포트폴리오`,
            `이 종목을 편입할 경우의 분산 효과나 편중 위험을 함께 고려하십시오.`,
            toJson(portfolio),
        );
    }

    return callStructured(apiKey, {
        model: MODELS.JUDGMENT,
        system: JUDGMENT_SYSTEM,
        user: sections.join("\n"),
        schema: JUDGMENT_SCHEMA,
        effort: "high",
        maxTokens: 16000,
    });
}

/**
 * 팩트체크 — 리포트의 수치가 원본과 일치하는지 대조한다.
 * 환각 차단의 마지막 방어선이므로 생략하면 안 된다.
 */
export async function verify(apiKey, { judgment, sources }) {
    // 검증 대상은 서술문뿐이다. 점수는 숫자 자체라 대조 의미가 없다.
    const claims = [
        judgment.summary,
        ...Object.values(judgment.axisComments),
        ...judgment.bull,
        ...judgment.bear,
        // 배당 서술에도 수치가 들어가므로 함께 대조한다
        judgment.dividendView,
    ]
        .filter(Boolean)
        .join("\n");

    /**
     * ⚠️ 판단에 사용된 '모든' 입력을 원본으로 넘겨야 한다.
     * 정량 지표만 넘겼더니 뉴스·공시·포트폴리오에서 나온 사실이 전부
     * "원본에 없는 수치"로 오탐 처리됐다(실측: 4건 중 3건이 오탐).
     */
    const user = `## 원본 데이터 (이것이 유일한 사실)

### 정량 지표
${toJson(sources.metrics)}

### 투자자별 수급
${sources.flows ? toJson(sources.flows) : "제공되지 않음"}

### 뉴스 분석 결과
${toJson(sources.news)}

### 공시 분석 결과
${toJson(sources.disclosures)}

### 사용자 포트폴리오
${sources.portfolio ? toJson(sources.portfolio) : "제공되지 않음"}

## 검증 대상 리포트 서술
${claims}`;

    return callStructured(apiKey, {
        model: MODELS.VERIFY,
        system: VERIFY_SYSTEM,
        user,
        schema: VERIFY_SCHEMA,
        effort: "medium",
        maxTokens: 8000,
    });
}

/**
 * 전체 분석 실행.
 *
 * @param onProgress 진행률 콜백 — Firestore에 실시간 기록해 화면에 표시한다
 */
export async function runAnalysis({ apiKey, stock, metrics, flows, news, disclosures, portfolio, onProgress = () => {} }) {
    const usages = [];
    const track = (result) => {
        if (result.usage) usages.push(result.usage);
        return result;
    };

    // 뉴스와 공시는 서로 의존하지 않으므로 병렬 실행한다
    await onProgress({ step: 3, message: "뉴스·공시 정성 분석 중", pct: 55 });
    const [newsResult, disclosureResult] = await Promise.all([
        analyzeNews(apiKey, stock.name, news).then(track),
        analyzeDisclosures(apiKey, stock.name, disclosures).then(track),
    ]);

    await onProgress({ step: 5, message: "종합 판단 중", pct: 75 });
    const judgmentResult = track(await judge(apiKey, { stock, metrics, flows, newsResult, disclosureResult, portfolio }));

    await onProgress({ step: 6, message: "수치 검증 중", pct: 90 });
    const verifyResult = track(
        await verify(apiKey, {
            judgment: judgmentResult.data,
            // 판단에 쓰인 입력을 빠짐없이 넘긴다 — 하나라도 빠지면 그 출처의 사실이 오탐된다
            sources: { metrics, flows, news: newsResult.data, disclosures: disclosureResult.data, portfolio },
        }),
    );

    // 종합 점수는 코드가 계산한다 (AI에게 맡기지 않는다)
    const scored = applyRedFlagCap(computeTotalScore(judgmentResult.data.scores), metrics.redFlags ?? []);

    return {
        scores: scored,
        thesis: {
            bull: judgmentResult.data.bull,
            bear: judgmentResult.data.bear,
            confidence: judgmentResult.data.confidence,
            confidenceReason: judgmentResult.data.confidenceReason,
            monitoringPoints: judgmentResult.data.monitoringPoints,
            summary: judgmentResult.data.summary,
            dividendView: judgmentResult.data.dividendView,
        },
        axisComments: judgmentResult.data.axisComments,
        news: newsResult.data,
        disclosures: disclosureResult.data,
        flows,
        verification: verifyResult.data,
        redFlags: metrics.redFlags ?? [],
        modelUsage: sumUsage(usages),
        disclaimer: DISCLAIMER,
    };
}
