/**
 * 한국은행 ECOS(경제통계시스템) 클라이언트 — 거시지표
 *
 * 금리·환율·물가 사이클이 종목 이익에 주는 방향성을 판단할 때 쓴다.
 *
 * ⚠️ ECOS는 파라미터를 `?key=value`가 아니라 **경로에 순서대로** 넣는 특이한 방식이다.
 *    /StatisticSearch/{인증키}/{형식}/{언어}/{시작건수}/{종료건수}/{통계표코드}/{주기}/{시작일}/{종료일}/{항목코드}
 */

const BASE_URL = "https://ecos.bok.or.kr/api";

// 분석에 사용할 주요 통계 — 통계표코드와 항목코드는 ECOS [통계코드검색]에서 확인한 값
export const SERIES = {
    BASE_RATE: { code: "722Y001", item: "0101000", cycle: "M", label: "한국은행 기준금리" },
    USD_KRW: { code: "731Y001", item: "0000001", cycle: "M", label: "원/달러 환율" },
    CPI: { code: "901Y009", item: "0", cycle: "M", label: "소비자물가지수" },
};

// ECOS 오류 응답은 { RESULT: { CODE, MESSAGE } } 형태로 온다 — 정상 응답과 구조가 다르다
function assertOk(payload, context) {
    if (payload?.RESULT) {
        throw new Error(`ECOS ${context} 실패 [${payload.RESULT.CODE}] ${payload.RESULT.MESSAGE}`);
    }
    return payload;
}

/**
 * 통계 시계열 조회.
 *
 * @param series SERIES 상수 중 하나
 * @param begin/end 주기에 맞춘 문자열 — 월(M)이면 YYYYMM, 일(D)이면 YYYYMMDD
 */
export async function fetchSeries(apiKey, series, begin, end, limit = 200) {
    const path = [
        "StatisticSearch",
        apiKey,
        "json",
        "kr",
        "1",
        String(limit),
        series.code,
        series.cycle,
        begin,
        end,
        series.item,
    ].join("/");

    const response = await fetch(`${BASE_URL}/${path}`);
    if (!response.ok) {
        throw new Error(`ECOS ${series.label} HTTP ${response.status}`);
    }

    const payload = assertOk(await response.json(), series.label);
    const rows = payload?.StatisticSearch?.row || [];

    // TIME(기간), DATA_VALUE(값)만 남기고 숫자로 변환한다
    return rows.map((row) => ({
        time: row.TIME,
        value: Number(row.DATA_VALUE),
        unit: row.UNIT_NAME,
    }));
}

/**
 * 분석에 필요한 거시지표를 한 번에 수집한다.
 * 최근 3년치 월간 데이터를 받아 추세(상승/하락)까지 판단할 수 있게 한다.
 */
export async function fetchMacroContext(apiKey, monthsBack = 36) {
    const now = new Date();
    const end = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const begin = `${from.getFullYear()}${String(from.getMonth() + 1).padStart(2, "0")}`;

    // 하나가 실패해도 나머지는 살리기 위해 allSettled를 쓴다 (거시지표는 보조 입력값)
    const entries = Object.entries(SERIES);
    const results = await Promise.allSettled(
        entries.map(([, series]) => fetchSeries(apiKey, series, begin, end)),
    );

    const context = {};
    results.forEach((result, index) => {
        const [key, series] = entries[index];
        if (result.status === "fulfilled") {
            context[key] = { label: series.label, rows: result.value };
        } else {
            console.warn(`ECOS ${series.label} 조회 실패 — ${result.reason.message}`);
            context[key] = { label: series.label, rows: [], error: result.reason.message };
        }
    });

    return context;
}
