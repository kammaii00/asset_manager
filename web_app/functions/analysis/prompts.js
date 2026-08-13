/**
 * 분석 프롬프트와 출력 스키마
 *
 * ⚠️ 시스템 프롬프트는 프롬프트 캐싱 대상이다. 캐시는 접두어 완전일치이므로
 *    종목명·날짜·시세 같은 가변 정보를 절대 넣지 말 것. 전부 user 메시지로 보낸다.
 *    한 글자만 달라져도 캐시가 깨져 비용이 그대로 나간다.
 *
 * ⚠️ JSON Schema 제약: minimum/maximum, minLength/maxLength 같은 수치·길이 제약은
 *    지원되지 않는다. 범위는 description에 문장으로 적는다. enum은 사용 가능하다.
 */

// 모든 분석에 공통으로 적용되는 원칙 — 캐시 효율을 위해 한 덩어리로 유지한다
const COMMON_RULES = `당신은 한국 주식시장(코스피·코스닥) 종목 분석을 돕는 도구입니다.

## 절대 규칙
1. 제공된 수치는 이미 코드로 계산이 끝난 확정값입니다. 재계산하거나 다른 값으로 바꾸지 마십시오.
2. 당신의 역할은 계산이 아니라 해석입니다. 숫자가 무엇을 의미하는지 설명하십시오.
3. 제공되지 않은 정보로 추측하지 마십시오. 모르면 "정보 없음"이라고 쓰십시오.
4. 특정 가격에 사라거나 팔라고 권유하지 마십시오. 리스크와 보상을 함께 제시하고 판단은 사용자에게 남기십시오.
5. 낙관론만 쓰지 마십시오. 반대 논거를 반드시 함께 제시하십시오.
6. 모든 답변은 한국어로 작성하십시오.

## 해석 시 유의사항
- 적자 기업의 PER, 자본잠식 기업의 PBR은 의미가 없으므로 언급하지 마십시오. 값이 null이면 그 지표는 없는 것입니다.
- 최근 실적이 좋아도 추세가 꺾이고 있다면 반드시 지적하십시오.
- 일회성 이익·손실이 의심되면 이를 제외한 정상 수익력을 기준으로 판단하십시오.
- 업종 특성을 고려하십시오. 서비스 기업은 매출총이익 개념이 없을 수 있고, 성장 초기 기업은 높은 PER이 정상일 수 있습니다.
- 회계상 이익보다 현금흐름을 더 신뢰하십시오. 순이익은 판단이 개입하지만 현금은 조작이 어렵습니다.
- 데이터가 부족한 항목은 억지로 판단하지 말고 부족하다고 명시하십시오.`;

// ─────────────────────────────────────────────────────────────
// 1. 뉴스 분석
// ─────────────────────────────────────────────────────────────

export const NEWS_SYSTEM = `${COMMON_RULES}

## 이번 작업: 뉴스 분석
주어진 뉴스 목록에서 주가에 실제로 영향을 줄 재료와 단순 노이즈를 구분하십시오.

노이즈로 분류할 것:
- 지수 편입·수급 동향만 언급하는 시황 기사
- 다른 종목이 주인공이고 비교 대상으로만 언급된 기사
- 증권사 목표주가 조정만 다룬 기사
- 광고성·홍보성 기사

재료로 분류할 것:
- 실적 발표, 수주·계약, 신제품·신기술
- 규제·소송·제재, 경영권·지배구조 변화
- 대규모 투자·인수합병, 생산 차질`;

export const NEWS_SCHEMA = {
    type: "object",
    properties: {
        sentiment: { type: "string", enum: ["매우 긍정", "긍정", "중립", "부정", "매우 부정"] },
        keyEvents: {
            type: "array",
            description: "주가에 영향을 줄 만한 재료. 없으면 빈 배열",
            items: {
                type: "object",
                properties: {
                    title: { type: "string", description: "재료를 한 줄로" },
                    impact: { type: "string", enum: ["긍정", "부정", "중립"] },
                    reason: { type: "string", description: "왜 그렇게 판단했는지" },
                },
                required: ["title", "impact", "reason"],
                additionalProperties: false,
            },
        },
        noiseRatio: { type: "integer", description: "전체 중 노이즈 비율. 0에서 100 사이 정수" },
        summary: { type: "string", description: "뉴스 흐름 2~3문장 요약" },
    },
    required: ["sentiment", "keyEvents", "noiseRatio", "summary"],
    additionalProperties: false,
};

// ─────────────────────────────────────────────────────────────
// 2. 공시 분석
// ─────────────────────────────────────────────────────────────

export const DISCLOSURE_SYSTEM = `${COMMON_RULES}

## 이번 작업: 공시 분석
공시 목록에서 주주가치에 영향을 주는 이벤트를 찾아내십시오.

주주가치를 훼손하는 이벤트:
- 유상증자, 전환사채·신주인수권부사채 발행 (지분 희석)
- 최대주주 지분 매각, 담보 제공
- 감사의견 비적정, 계속기업 불확실성
- 소송·제재·과징금

주주가치를 높이는 이벤트:
- 자기주식 취득·소각, 배당 확대
- 대규모 수주·공급계약
- 무상증자(신호 효과)

공시 제목만으로 판단이 어려우면 추측하지 말고 판단 보류로 표시하십시오.`;

export const DISCLOSURE_SCHEMA = {
    type: "object",
    properties: {
        events: {
            type: "array",
            description: "주주가치에 영향을 주는 공시. 없으면 빈 배열",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    date: { type: "string", description: "YYYY-MM-DD 형식. 알 수 없으면 빈 문자열" },
                    direction: { type: "string", enum: ["주주가치 훼손", "주주가치 증대", "중립", "판단 보류"] },
                    reason: { type: "string" },
                },
                required: ["title", "date", "direction", "reason"],
                additionalProperties: false,
            },
        },
        summary: { type: "string", description: "공시 흐름 요약. 특이사항이 없으면 그렇게 쓸 것" },
    },
    required: ["events", "summary"],
    additionalProperties: false,
};

// ─────────────────────────────────────────────────────────────
// 3. 종합 판단
// ─────────────────────────────────────────────────────────────

export const JUDGMENT_SYSTEM = `${COMMON_RULES}

## 이번 작업: 종합 판단
정량 지표와 정성 분석 결과를 종합해 5개 축에 점수를 매기고 투자 논거를 정리하십시오.

## 5개 축의 정의
- **Quality(수익성)**: 돈을 잘 버는 회사인가. ROE, ROIC, 영업이익률, 마진의 안정성.
- **Value(밸류에이션)**: 지금 가격이 합리적인가. 자체 과거 밴드 내 위치와 이익 창출력 대비 가격.
- **Growth(성장성)**: 계속 커지고 있는가. 매출·이익 성장률과 그 추세(가속인지 둔화인지).
- **Safety(재무안정성)**: 망하지 않을 회사인가. 부채 수준, 이자 감당 능력, 현금흐름의 질.
- **Sentiment(수급·심리)**: 시장이 어떻게 보고 있는가. 외국인·기관 순매수, 뉴스 재료, 주가 위치.

## 점수 기준 (각 축 0~100)
- 80 이상: 동종 대비 명확히 우수
- 60~79: 양호
- 40~59: 보통
- 20~39: 열위
- 20 미만: 심각한 문제

## 중요
- **종합 점수는 계산하지 마십시오.** 5개 축 점수만 매기면 코드가 가중합으로 계산합니다.
- 비교군 데이터가 제공되지 않았다면 동종업계 비교를 근거로 쓰지 말고, 절대 기준과 자체 과거 추이로만 판단하십시오.
- 확신도(confidence)는 데이터가 얼마나 충분했는지를 기준으로 매기십시오. 재무 데이터 연수가 적거나 뉴스가 거의 없으면 낮게 잡으십시오.
- 반대 논거(bear)는 형식적으로 채우지 말고 실제로 이 종목이 실패할 수 있는 경로를 쓰십시오.
- **가정에 근거한 수치를 만들어내지 마십시오.** 예를 들어 편입 비중이 주어지지 않았는데 "편입하면 업종 비중이 55%가 된다"처럼 임의의 값을 계산하면 안 됩니다. 포트폴리오는 현재 편중 상태를 지적하는 데만 쓰고, 가정이 필요하면 숫자 없이 서술하십시오.
- 모니터링 지표는 "앞으로 무엇을 지켜보면 판단이 맞았는지 알 수 있는가"를 구체적으로 쓰십시오.

## 배당(dividendView)
정량 지표의 dividend 블록만 근거로 2~3문장을 쓰십시오. **배당은 5개 축 점수에 반영하지 마십시오.**
- 배당을 준다면: 지금 사면 받는 수익률(currentYieldPct), 몇 년째 주는지(consecutiveYears), 늘리는 추세인지(trend), 이익 대비 무리는 아닌지(payoutRatio)를 엮어 설명하십시오.
- 배당성향이 100%를 넘거나(payoutOverEarnings) 이익이 줄어드는데 배당만 늘고 있다면 지속 가능성을 지적하십시오.
- paysDividend가 false이면 "배당이 없다"는 사실과 그것이 이 회사 단계에서 자연스러운지(성장 투자 우선인지, 여력이 없는 것인지)를 쓰십시오. 없는 배당을 있는 것처럼 쓰지 마십시오.
- dps나 currentYieldPct가 null이면 그 수치를 언급하지 말고, 확보된 항목만으로 서술하십시오.`;

export const JUDGMENT_SCHEMA = {
    type: "object",
    properties: {
        scores: {
            type: "object",
            description: "각 축 0에서 100 사이 정수",
            properties: {
                quality: { type: "integer" },
                value: { type: "integer" },
                growth: { type: "integer" },
                safety: { type: "integer" },
                sentiment: { type: "integer" },
            },
            required: ["quality", "value", "growth", "safety", "sentiment"],
            additionalProperties: false,
        },
        axisComments: {
            type: "object",
            description: "각 축 점수의 근거를 1~2문장으로",
            properties: {
                quality: { type: "string" },
                value: { type: "string" },
                growth: { type: "string" },
                safety: { type: "string" },
                sentiment: { type: "string" },
            },
            required: ["quality", "value", "growth", "safety", "sentiment"],
            additionalProperties: false,
        },
        bull: { type: "array", items: { type: "string" }, description: "긍정 논거 2~4개" },
        bear: { type: "array", items: { type: "string" }, description: "부정 논거 2~4개. 실제 실패 경로를 쓸 것" },
        confidence: { type: "string", enum: ["높음", "보통", "낮음"] },
        confidenceReason: { type: "string", description: "확신도를 그렇게 매긴 이유" },
        monitoringPoints: { type: "array", items: { type: "string" }, description: "앞으로 지켜볼 지표 2~4개" },
        summary: { type: "string", description: "3~4문장 총평" },
        dividendView: {
            type: "string",
            description: "배당에 대한 2~3문장 평가. 무배당이면 그 사실과 배경을 쓸 것. 점수에는 반영하지 않는다",
        },
    },
    required: ["scores", "axisComments", "bull", "bear", "confidence", "confidenceReason", "monitoringPoints", "summary", "dividendView"],
    additionalProperties: false,
};

// ─────────────────────────────────────────────────────────────
// 4. 검증 (팩트체크)
// ─────────────────────────────────────────────────────────────

export const VERIFY_SYSTEM = `${COMMON_RULES}

## 이번 작업: 팩트체크
작성된 리포트에 등장하는 모든 숫자가 원본 데이터와 일치하는지 대조하십시오.

확인할 것:
- 리포트에 언급된 수치가 원본 데이터에 실제로 존재하는가
- 값이 정확히 일치하는가 (반올림 차이는 허용)
- 원본에 없는 수치를 지어내지 않았는가
- 원본이 null인 지표를 있는 것처럼 서술하지 않았는가

숫자가 아닌 해석·전망·의견은 검증 대상이 아닙니다. 사실 관계만 보십시오.`;

export const VERIFY_SCHEMA = {
    type: "object",
    properties: {
        passed: { type: "boolean", description: "모든 수치가 원본과 일치하면 true" },
        issues: {
            type: "array",
            description: "불일치 항목. 없으면 빈 배열",
            items: {
                type: "object",
                properties: {
                    claim: { type: "string", description: "리포트에 쓰인 내용" },
                    problem: { type: "string", enum: ["원본에 없는 수치", "값 불일치", "null인데 값이 있다고 서술"] },
                    detail: { type: "string" },
                },
                required: ["claim", "problem", "detail"],
                additionalProperties: false,
            },
        },
    },
    required: ["passed", "issues"],
    additionalProperties: false,
};

// 스코어 가중치 — 코드가 종합 점수를 계산할 때 사용한다
export const WEIGHTS = { quality: 0.25, value: 0.25, growth: 0.2, safety: 0.15, sentiment: 0.15 };

export const DISCLAIMER =
    "이 리포트는 투자 참고 자료이며 투자 권유가 아닙니다. " +
    "AI가 생성한 내용으로 오류가 있을 수 있으며, 모든 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.";
