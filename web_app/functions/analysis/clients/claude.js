/**
 * Claude API 클라이언트 — 정성 분석과 종합 판단 담당
 *
 * 설계 원칙: 숫자 계산은 metrics.js가 이미 끝냈고, 여기서는 '해석'만 시킨다.
 * 프롬프트에 계산을 요구하는 문장을 넣지 않는다.
 *
 * ⚠️ 환경변수명이 CLAUDE_API_KEY다. SDK는 ANTHROPIC_API_KEY를 자동으로 읽으므로
 *    키를 반드시 명시적으로 전달해야 한다.
 */

import Anthropic from "@anthropic-ai/sdk";

// 용도별 모델 — 종합 판단은 제품의 본질이므로 최상위 모델을 쓴다
export const MODELS = {
    NEWS: "claude-haiku-4-5", // 단순·대량 분류
    DOCUMENT: "claude-sonnet-5", // 공시·문서 해석
    JUDGMENT: "claude-opus-5", // 종합 판단
    VERIFY: "claude-sonnet-5", // 팩트체크 대조
};

/**
 * 모델별 지원 기능.
 *
 * ⚠️ Haiku 4.5는 adaptive thinking과 effort 파라미터를 지원하지 않는다.
 * 모든 모델에 동일한 파라미터를 보내면 뉴스 분석 호출이 400으로 실패한다.
 */
const MODEL_CAPS = {
    "claude-opus-5": { adaptiveThinking: true, effort: true },
    "claude-sonnet-5": { adaptiveThinking: true, effort: true },
    "claude-haiku-4-5": { adaptiveThinking: false, effort: false },
};

function capsOf(model) {
    return MODEL_CAPS[model] ?? { adaptiveThinking: false, effort: false };
}

let cachedClient = null;

// 클라이언트는 함수 인스턴스 간 재사용한다 (콜드스타트 비용 절감)
export function getClient(apiKey) {
    if (!cachedClient) {
        cachedClient = new Anthropic({ apiKey });
    }
    return cachedClient;
}

/**
 * 응답에서 텍스트 블록만 추출한다.
 * thinking 블록이 앞에 오므로 content[0]을 그대로 읽으면 안 된다.
 */
function extractText(response) {
    return response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}

/**
 * 구조화 출력 호출 — 스키마를 강제해 JSON 파싱 실패를 원천 차단한다.
 *
 * 기존 투자일기(Gemini)에서 겪은 문제들 — JSON 강제 시 빈 응답, 말줄임표 출력으로
 * JSON 깨짐 — 이 방식에서는 구조적으로 발생하지 않는다.
 *
 * @param system 시스템 프롬프트. 종목마다 반복되므로 캐싱 대상이다.
 *               ⚠️ 캐시는 접두어 완전일치라 종목명·날짜를 넣으면 캐시가 깨진다.
 * @param user   종목별로 달라지는 실제 데이터
 * @param schema JSON Schema. 최소/최대값 같은 수치 제약은 지원되지 않으므로
 *               범위는 description에 문장으로 적는다.
 */
export async function callStructured(apiKey, { model, system, user, schema, effort = "high", maxTokens = 16000 }) {
    const client = getClient(apiKey);
    const caps = capsOf(model);

    const request = {
        model,
        max_tokens: maxTokens,
        // 배열 형태 + cache_control로 시스템 프롬프트를 캐싱한다.
        // 종목마다 반복 호출되므로 캐시 적중 시 입력 비용이 크게 줄어든다.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema } },
    };

    // 지원하는 모델에만 붙인다 — Haiku에 보내면 400이 난다
    if (caps.adaptiveThinking) request.thinking = { type: "adaptive" };
    if (caps.effort) request.output_config.effort = effort;

    const response = await client.messages.create(request);

    // 안전장치 — 정책상 거부되면 content가 비거나 부분 응답일 수 있다
    if (response.stop_reason === "refusal") {
        throw new Error(`Claude 응답 거부 (${response.stop_details?.category ?? "사유 미상"})`);
    }
    if (response.stop_reason === "max_tokens") {
        throw new Error("Claude 응답이 max_tokens에서 잘렸습니다 — 한도를 늘려야 합니다");
    }

    const text = extractText(response);
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`Claude 응답 JSON 파싱 실패: ${text.slice(0, 200)}`);
    }

    return {
        data: parsed,
        usage: {
            model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
            cacheRead: response.usage.cache_read_input_tokens ?? 0,
        },
    };
}

/**
 * 호출 비용 추산 (USD, 100만 토큰당 단가).
 *
 * ⚠️ 이것은 어디까지나 추정치다. 정확한 청구액은 Claude 콘솔의 비용 페이지가 기준이다.
 *    리포트에 대략적인 비용을 남겨 추이를 보기 위한 용도다.
 *
 * Sonnet 5는 2026-08-31까지 프로모션 단가($2/$10)가 적용되고 이후 정가($3/$15)로 돌아간다.
 * 정가로 계산했더니 실측 대비 12% 과대 추정됐다(추정 $0.4036 vs 콘솔 $0.36).
 */
const SONNET_INTRO_UNTIL = Date.UTC(2026, 7, 31, 23, 59, 59); // 2026-08-31 (월은 0부터)

function priceOf(model) {
    switch (model) {
        case "claude-opus-5":
            return { input: 5, output: 25 };
        case "claude-sonnet-5":
            return Date.now() <= SONNET_INTRO_UNTIL ? { input: 2, output: 10 } : { input: 3, output: 15 };
        case "claude-haiku-4-5":
            return { input: 1, output: 5 };
        default:
            return null;
    }
}

export function estimateCost(usage) {
    const price = priceOf(usage.model);
    if (!price) return null;

    const perMillion = (tokens, rate) => (tokens / 1_000_000) * rate;
    const cost =
        perMillion(usage.inputTokens, price.input) +
        perMillion(usage.outputTokens, price.output) +
        perMillion(usage.cacheCreation, price.input * 1.25) +
        perMillion(usage.cacheRead, price.input * 0.1);

    return Math.round(cost * 10000) / 10000;
}

// 여러 호출의 사용량을 합산한다 — 리포트에 총 비용을 남기기 위함
export function sumUsage(usages) {
    return usages.reduce(
        (acc, u) => ({
            inputTokens: acc.inputTokens + u.inputTokens,
            outputTokens: acc.outputTokens + u.outputTokens,
            cacheCreation: acc.cacheCreation + u.cacheCreation,
            cacheRead: acc.cacheRead + u.cacheRead,
            costUsd: Math.round((acc.costUsd + (estimateCost(u) ?? 0)) * 10000) / 10000,
        }),
        { inputTokens: 0, outputTokens: 0, cacheCreation: 0, cacheRead: 0, costUsd: 0 },
    );
}
