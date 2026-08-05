/**
 * 정량 지표 계산 — AI를 전혀 쓰지 않는 순수 계산 모듈.
 *
 * 설계 원칙 "숫자는 코드가, 해석은 AI가"의 핵심 구현체다.
 * LLM에게 재무비율을 계산시키면 반드시 틀리므로 모든 수치는 여기서 결정론적으로 만든다.
 *
 * 모든 함수는 계산이 불가능하면 예외를 던지지 않고 null을 반환한다.
 * 적자·자본잠식·데이터 결측은 예외 상황이 아니라 정상적으로 존재하는 상태이기 때문이다.
 */

// 0 나눗셈과 null을 한 곳에서 막는다 — 지표 계산의 모든 나눗셈은 이 함수를 거친다
function ratio(numerator, denominator) {
    if (numerator === null || denominator === null) return null;
    if (denominator === 0) return null;
    return numerator / denominator;
}

/**
 * 지배주주 기준 값을 우선 사용한다.
 *
 * 연결재무제표의 '당기순이익'에는 자회사의 비지배주주 몫이 섞여 있다.
 * 시장에서 쓰는 PER·PBR·ROE는 지배주주 기준이므로 이를 맞춰야 한다.
 *
 * 실측 근거(2026-08-05): 에코프로비엠을 연결 전체 순이익(916억)으로 계산하면 PER 108.63이지만,
 * 지배주주 순이익(394억) 기준은 약 251배로 KIS가 제공하는 252.36과 사실상 일치했다.
 */
function ownersFirst(ownersValue, totalValue) {
    return ownersValue !== null && ownersValue !== undefined ? ownersValue : totalValue;
}

// 백분율로 환산 (소수점 2자리)
function pct(value) {
    return value === null ? null : Math.round(value * 10000) / 100;
}

/**
 * 연평균 성장률(CAGR).
 *
 * 시작값이 0 이하이면 수학적으로 정의되지 않는다.
 * 적자에서 흑자로 전환한 경우 "성장률 몇 %"라는 표현 자체가 성립하지 않으므로
 * 억지로 숫자를 만들지 않고 null을 돌려준다(해석은 AI가 별도로 한다).
 */
export function cagr(startValue, endValue, years) {
    if (startValue === null || endValue === null || years <= 0) return null;
    if (startValue <= 0 || endValue <= 0) return null;
    return pct((endValue / startValue) ** (1 / years) - 1);
}

// 전년 대비 증감률 — 기준값이 음수면 부호가 뒤집혀 오해를 부르므로 계산하지 않는다
export function yoy(previous, current) {
    if (previous === null || current === null || previous <= 0) return null;
    return pct((current - previous) / previous);
}

/**
 * 수익성 지표.
 * ROE·ROA는 기말 잔액이 아니라 기초·기말 평균 자본을 쓰는 것이 정확하다.
 * 전기 데이터가 있으면 평균을, 없으면 기말 값을 사용한다.
 */
export function profitability(current, previous) {
    // ROE는 지배주주 기준이 시장 관행이다 (분자·분모를 함께 맞춰야 한다)
    const equityNow = ownersFirst(current.equityOwners, current.equity);
    const equityPrev = previous ? ownersFirst(previous.equityOwners, previous.equity) : null;
    const netIncome = ownersFirst(current.netIncomeOwners, current.netIncome);

    const avgEquity = equityPrev ? (equityNow + equityPrev) / 2 : equityNow;
    const avgAssets = previous?.assets ? (current.assets + previous.assets) / 2 : current.assets;

    return {
        roe: pct(ratio(netIncome, avgEquity)),
        // ROA는 자산 전체가 분모이므로 순이익도 연결 전체를 쓰는 것이 정합적이다
        roa: pct(ratio(current.netIncome, avgAssets)),
        operatingMargin: pct(ratio(current.operatingIncome, current.revenue)),
        netMargin: pct(ratio(current.netIncome, current.revenue)),
        // 매출총이익률은 서비스 기업에 매출총이익이 없을 수 있어 null이 정상이다
        grossMargin: pct(ratio(current.grossProfit, current.revenue)),
    };
}

/**
 * 성장성 지표 — 시계열은 최신 연도가 앞에 오는 순서를 전제한다.
 */
export function growth(series) {
    const latest = series[0];
    const prior = series[1];
    // 3년 성장률은 4개년 데이터가 필요하다(3구간)
    const threeYearsAgo = series[3];

    return {
        revenueYoy: yoy(prior?.revenue ?? null, latest.revenue),
        operatingIncomeYoy: yoy(prior?.operatingIncome ?? null, latest.operatingIncome),
        revenueCagr3y: cagr(threeYearsAgo?.revenue ?? null, latest.revenue, 3),
        operatingIncomeCagr3y: cagr(threeYearsAgo?.operatingIncome ?? null, latest.operatingIncome, 3),
        // 흑자·적자 전환은 성장률로 표현되지 않으므로 별도 플래그로 남긴다
        turnedProfitable: prior?.operatingIncome < 0 && latest.operatingIncome > 0,
        turnedLoss: prior?.operatingIncome > 0 && latest.operatingIncome < 0,
    };
}

/**
 * 재무안정성 지표.
 * 이자보상배율은 이자비용 대신 금융원가(FinanceCosts)를 쓰는 근사치다 —
 * 금융원가에는 이자 외 항목이 섞일 수 있어 실제보다 보수적으로 나온다.
 */
export function stability(current) {
    const netDebt =
        current.liabilities !== null && current.currentAssets !== null
            ? current.liabilities - current.currentAssets
            : null;

    return {
        debtRatio: pct(ratio(current.liabilities, current.equity)),
        currentRatio: pct(ratio(current.currentAssets, current.currentLiabilities)),
        interestCoverage: current.financeCosts
            ? Math.round((ratio(current.operatingIncome, current.financeCosts) ?? 0) * 100) / 100
            : null,
        // 자본잠식은 부채비율 숫자보다 먼저 봐야 하는 결격 사유다
        capitalImpaired: current.equity !== null && current.equity <= 0,
        netDebt,
    };
}

/**
 * 현금흐름의 질.
 *
 * 순이익은 회계적 판단이 개입하지만 현금은 조작하기 어렵다.
 * 영업현금흐름이 순이익을 지속적으로 밑돌면 이익의 신뢰도가 낮다는 신호다.
 */
export function cashQuality(current, series) {
    const fcf =
        current.operatingCashFlow !== null && current.capex !== null
            ? current.operatingCashFlow - Math.abs(current.capex)
            : null;

    // 영업CF가 3년 연속 음수면 Red Flag — 계속기업 위험 신호
    const recent = series.slice(0, 3).map((r) => r.operatingCashFlow);
    const negativeStreak = recent.length === 3 && recent.every((v) => v !== null && v < 0);

    return {
        // 1.0 이상이면 순이익만큼 현금이 들어온다는 뜻
        cashConversion:
            current.netIncome > 0 ? Math.round((ratio(current.operatingCashFlow, current.netIncome) ?? 0) * 100) / 100 : null,
        freeCashFlow: fcf,
        operatingCashFlow: current.operatingCashFlow,
        negativeOperatingCashFlow3y: negativeStreak,
    };
}

/**
 * 밸류에이션 — 시가총액이 필요하므로 KIS 시세와 결합해 계산한다.
 *
 * 적자 기업의 PER, 자본잠식 기업의 PBR은 숫자를 만들어도 의미가 없다.
 * 억지로 음수 PER을 노출하면 "싸다"로 오독되므로 null로 둔다.
 */
export function valuation(current, quote = {}) {
    const marketCapKrw = quote.marketCapKrw;
    if (!marketCapKrw) return { per: null, pbr: null, psr: null };

    // 시가총액은 지배주주 몫의 가치이므로 분모도 지배주주 기준으로 맞춘다
    const netIncome = ownersFirst(current.netIncomeOwners, current.netIncome);
    const equity = ownersFirst(current.equityOwners, current.equity);

    const per = netIncome > 0 ? Math.round(ratio(marketCapKrw, netIncome) * 100) / 100 : null;
    const pbr = equity > 0 ? Math.round(ratio(marketCapKrw, equity) * 100) / 100 : null;

    /**
     * KIS 제공값과의 교차검증.
     *
     * 실측(2026-08-05): 우선주가 없는 카카오·에코프로비엠은 오차 0%로 일치했으나
     * 우선주가 별도 상장된 삼성전자는 13% 차이가 났다.
     * KIS 시가총액(hts_avls)은 보통주만 계산하는 반면 EPS·BPS는 우선주를 포함한
     * 전체 자본 기준이라 분자·분모 기준이 어긋나기 때문으로 보인다.
     *
     * 따라서 현재 시점 밸류에이션은 거래소 기준인 KIS 값을 우선하고,
     * 우리 계산값은 과거 연도 밴드 산출과 교차검증에 사용한다.
     */
    const gap = (ours, theirs) =>
        ours && theirs ? Math.round(((ours - theirs) / theirs) * 1000) / 10 : null;

    return {
        per,
        pbr,
        psr: current.revenue > 0 ? Math.round(ratio(marketCapKrw, current.revenue) * 100) / 100 : null,
        // 어떤 기준으로 계산했는지 남겨야 리포트에서 오해가 없다
        basis: current.netIncomeOwners !== null ? "지배주주" : "연결전체",
        crossCheck: {
            kisPer: quote.per ?? null,
            kisPbr: quote.pbr ?? null,
            perGapPct: gap(per, quote.per),
            pbrGapPct: gap(pbr, quote.pbr),
            // 10% 넘게 벌어지면 우선주·자사주 등 특수 요인을 의심해야 한다
            diverged: Math.abs(gap(per, quote.per) ?? 0) > 10,
        },
    };
}

/**
 * 자체 시계열 밸류에이션 밴드 — 이 종목의 과거 대비 현재 위치.
 *
 * 동종업계 비교가 어려울 때도 "이 회사 기준으로 비싼가 싼가"는 판단할 수 있다.
 * 0%에 가까울수록 과거 대비 저평가, 100%에 가까울수록 고평가다.
 */
export function historicalBand(currentValue, historicalValues) {
    const valid = historicalValues.filter((v) => v !== null && v > 0);
    if (currentValue === null || valid.length < 3) return null;

    const below = valid.filter((v) => v < currentValue).length;
    return {
        percentile: Math.round((below / valid.length) * 100),
        min: Math.min(...valid),
        max: Math.max(...valid),
        median: [...valid].sort((a, b) => a - b)[Math.floor(valid.length / 2)],
    };
}

/**
 * 결격 사유(Red Flag) 판정 — 점수와 무관하게 최상단에 경고로 노출할 항목.
 * 재무 기반 항목만 여기서 판정하고, 관리종목·거래정지는 KIS flags에서 가져온다.
 */
export function detectRedFlags(current, series, kisFlags = {}) {
    const flags = [];

    if (current.equity !== null && current.equity <= 0) {
        flags.push({ code: "CAPITAL_IMPAIRED", severity: "critical", message: "자본잠식 상태입니다" });
    }
    const recent3 = series.slice(0, 3).map((r) => r.operatingCashFlow);
    if (recent3.length === 3 && recent3.every((v) => v !== null && v < 0)) {
        flags.push({ code: "NEGATIVE_OCF_3Y", severity: "critical", message: "영업활동 현금흐름이 3년 연속 음수입니다" });
    }
    const recentLoss = series.slice(0, 3).map((r) => r.operatingIncome);
    if (recentLoss.length === 3 && recentLoss.every((v) => v !== null && v < 0)) {
        flags.push({ code: "OPERATING_LOSS_3Y", severity: "high", message: "영업손실이 3년 연속입니다" });
    }
    const debtRatio = pct(ratio(current.liabilities, current.equity));
    if (debtRatio !== null && debtRatio > 400) {
        flags.push({ code: "HIGH_DEBT", severity: "high", message: `부채비율이 ${debtRatio}%로 과도합니다` });
    }
    // 이자보상배율 1 미만 = 영업이익으로 이자조차 감당하지 못하는 상태
    const coverage = ratio(current.operatingIncome, current.financeCosts);
    if (coverage !== null && coverage < 1) {
        flags.push({
            code: "LOW_INTEREST_COVERAGE",
            severity: "high",
            message: `이자보상배율이 ${coverage.toFixed(2)}배로 영업이익이 금융비용에 미치지 못합니다`,
        });
    }
    if (kisFlags.managed) {
        flags.push({ code: "MANAGED_ISSUE", severity: "critical", message: "관리종목으로 지정되어 있습니다" });
    }
    if (kisFlags.warned) {
        const labels = { "01": "투자주의", "02": "투자경고", "03": "투자위험" };
        flags.push({
            code: "MARKET_WARNING",
            severity: kisFlags.warnLevel === "03" ? "critical" : "high",
            message: `시장경보 ${labels[kisFlags.warnLevel] || kisFlags.warnLevel} 종목입니다`,
        });
    }

    return flags;
}

/**
 * 전체 지표를 한 번에 계산한다.
 *
 * @param series  최신 연도가 앞에 오는 연간 재무 시계열
 * @param quote   KIS 시세(marketCapKrw 필요)
 * @param kisFlags KIS 종목상태 플래그
 */
export function computeMetrics(series, quote = {}, kisFlags = {}) {
    if (!Array.isArray(series) || series.length === 0) {
        return { error: "재무 데이터가 없습니다" };
    }

    const current = series[0];
    const previous = series[1] ?? null;

    // 과거 각 연도의 PER을 계산해 현재 위치를 밴드로 표현한다.
    // 과거 시가총액이 없으므로 '현재 시총 기준' 근사이며, 이익 변화만 반영된다.
    // 밸류에이션과 동일하게 지배주주 기준으로 계산해야 비교가 성립한다.
    const perOf = (record) => {
        const income = ownersFirst(record.netIncomeOwners, record.netIncome);
        return income > 0 ? ratio(quote.marketCapKrw, income) : null;
    };
    const historicalPers = series.map(perOf);

    return {
        year: current.year,
        yearsAvailable: series.length,
        profitability: profitability(current, previous),
        growth: growth(series),
        stability: stability(current),
        cashQuality: cashQuality(current, series),
        valuation: valuation(current, quote),
        valuationBand: historicalBand(perOf(current), historicalPers),
        redFlags: detectRedFlags(current, series, kisFlags),
    };
}
