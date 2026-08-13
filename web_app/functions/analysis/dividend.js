/**
 * 배당 지표 계산 — metrics.js와 마찬가지로 AI를 쓰지 않는 순수 계산 모듈.
 *
 * 두 개의 출처를 합쳐서 본다.
 *  ① DART 배당사항 공시(alotMatter): 주당배당금·시가배당률·배당성향의 회사 공시값. 3개년.
 *  ② 현금흐름표의 배당금지급(financials.js): 추가 호출 없이 얻는 6개년 지급 이력.
 * ①은 "주당 얼마"를, ②는 "몇 년째 주는가"를 알려주며 둘 다 있어야 배당의 지속성을 판단할 수 있다.
 *
 * 계산이 불가능하면 예외를 던지지 않고 null을 둔다. 무배당은 오류가 아니라 정상 상태다.
 */

import { parseAmount } from "./financials.js";

// alotMatter 응답의 구분(se) 문자열은 회사·연도마다 표기가 조금씩 달라 부분 일치로 찾는다
const squash = (value) => String(value ?? "").replace(/\s/g, "");

/**
 * 배당사항 응답에서 원하는 항목 한 줄을 찾는다.
 * 우선주가 따로 있는 회사는 같은 항목이 두 줄로 오므로 보통주를 우선한다.
 */
function findRow(list, matcher) {
    const candidates = list.filter((row) => matcher(squash(row.se)));
    if (candidates.length === 0) return null;
    return candidates.find((row) => squash(row.stock_knd).includes("보통주")) ?? candidates[0];
}

/**
 * DART 배당사항 응답을 연도별 배열로 정규화한다.
 *
 * 한 응답에 당기(thstrm)·전기(frmtrm)·전전기(lwfr) 3개년이 함께 들어 있다.
 * 금액 단위는 총액만 백만원이고 주당 금액은 원, 비율은 %다.
 *
 * @param list      alotMatter.json 응답의 list
 * @param baseYear  조회한 사업연도 — 당기가 이 연도다
 */
export function normalizeDividendRows(list, baseYear) {
    if (!Array.isArray(list) || list.length === 0) return [];

    const dpsRow = findRow(list, (se) => se.includes("주당") && se.includes("현금배당금") && !se.includes("총액"));
    const yieldRow = findRow(list, (se) => se.includes("현금배당수익률"));
    const payoutRow = findRow(list, (se) => se.includes("현금배당성향"));
    const totalRow = findRow(list, (se) => se.includes("현금배당금총액"));

    const periods = [
        { field: "thstrm", year: baseYear },
        { field: "frmtrm", year: baseYear - 1 },
        { field: "lwfr", year: baseYear - 2 },
    ];

    return periods
        .map(({ field, year }) => {
            const totalMillion = totalRow ? parseAmount(totalRow[field]) : null;
            const record = {
                year,
                dps: dpsRow ? parseAmount(dpsRow[field]) : null,
                yieldPct: yieldRow ? parseAmount(yieldRow[field]) : null,
                payoutRatio: payoutRow ? parseAmount(payoutRow[field]) : null,
                // 공시 단위가 백만원이므로 다른 금액 지표와 같은 원 단위로 맞춘다
                totalCashKrw: totalMillion === null ? null : totalMillion * 1e6,
            };
            const hasAny = record.dps !== null || record.totalCashKrw !== null;
            return hasAny ? record : null;
        })
        .filter(Boolean);
}

// 배당 총액 추이 판정 — 최근 3개년을 보고 늘었는지 줄었는지만 말한다
function resolveTrend(amounts) {
    const valid = amounts.filter((v) => v !== null && v > 0);
    if (valid.length < 2) return null;
    const [latest, previous] = valid;
    if (latest > previous * 1.02) return "증가";
    if (latest < previous * 0.98) return "감소";
    return "유지";
}

/**
 * 배당 지표 계산.
 *
 * @param series        연간 재무 시계열(최신 연도가 앞). dividendsPaid로 지급 이력을 본다.
 * @param dividendRows  normalizeDividendRows 결과 (없으면 빈 배열)
 * @param quote         KIS 시세 — 현재가 기준 배당수익률을 계산하는 데 쓴다
 */
export function computeDividend(series = [], dividendRows = [], quote = {}) {
    // 현금흐름표 기준 지급 이력 (현금 유출이라 음수로 오므로 절댓값으로 본다)
    const paidHistory = series.map((record) => ({
        year: record.year,
        amount: record.dividendsPaid === null || record.dividendsPaid === undefined
            ? null
            : Math.abs(record.dividendsPaid),
    }));

    // 최근 연도부터 연속으로 배당을 지급한 햇수. 중간에 끊기면 거기서 멈춘다.
    let consecutiveYears = 0;
    for (const { amount } of paidHistory) {
        if (amount === null || amount <= 0) break;
        consecutiveYears += 1;
    }

    const latest = dividendRows[0] ?? null;
    const dps = latest?.dps ?? null;
    const price = quote?.price ?? null;

    /**
     * 공시된 시가배당률은 '배당기준일 주가' 기준이라 지금 사는 사람의 수익률과 다르다.
     * 지금 매수하면 받게 될 수익률을 따로 계산해 함께 보여준다.
     */
    const currentYieldPct = dps && price ? Math.round((dps / price) * 10000) / 100 : null;

    const paysDividend = consecutiveYears > 0 || (dps !== null && dps > 0);

    return {
        paysDividend,
        // 무배당 기업은 여기서 끝난다 — 억지로 0을 채우면 "배당수익률 0%"로 오독된다
        dps,
        currentYieldPct,
        disclosedYieldPct: latest?.yieldPct ?? null,
        payoutRatio: latest?.payoutRatio ?? null,
        totalCashKrw: latest?.totalCashKrw ?? null,
        baseYear: latest?.year ?? null,
        consecutiveYears,
        trend: resolveTrend(paidHistory.map((r) => r.amount)),
        history: paidHistory,
        // 이익보다 많이 배당하는 상태가 이어지면 지속 가능하지 않다 (판단은 AI가 한다)
        payoutOverEarnings: latest?.payoutRatio !== null && latest?.payoutRatio !== undefined
            ? latest.payoutRatio > 100
            : null,
    };
}
