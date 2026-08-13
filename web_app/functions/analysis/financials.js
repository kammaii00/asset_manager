/**
 * DART 재무제표 정규화 — 회사마다 다른 응답을 동일한 형태로 바꾼다.
 *
 * 실측으로 확인한 사항(2026-08-05, 삼성전자·에코프로비엠·카카오):
 *  - IFRS 표준계정코드(account_id) 커버리지가 91~98%로 높아 계정명 매칭에 의존하지 않아도 된다.
 *  - 한 번의 호출로 당기·전기·전전기 3개년이 함께 온다 → 5년치는 2회 호출이면 충분하다.
 *  - 손익계산서를 IS가 아니라 CIS(포괄손익계산서)에만 제출하는 회사가 있다
 *    → sj_div로 필터링하면 안 되고 account_id로 찾아야 한다.
 *  - 매출총이익(GrossProfit)은 서비스 기업에 없을 수 있다 → 선택 항목.
 */

// IFRS 표준계정코드 매핑. required=false는 없어도 분석이 가능한 항목이다.
const ACCOUNTS = {
    // 재무상태표
    assets: { id: "ifrs-full_Assets", label: "자산총계", required: true },
    liabilities: { id: "ifrs-full_Liabilities", label: "부채총계", required: true },
    equity: { id: "ifrs-full_Equity", label: "자본총계", required: true },
    equityOwners: { id: "ifrs-full_EquityAttributableToOwnersOfParent", label: "지배주주지분", required: false },
    currentAssets: { id: "ifrs-full_CurrentAssets", label: "유동자산", required: true },
    currentLiabilities: { id: "ifrs-full_CurrentLiabilities", label: "유동부채", required: true },

    // 손익계산서
    revenue: { id: "ifrs-full_Revenue", label: "매출액", required: true },
    grossProfit: { id: "ifrs-full_GrossProfit", label: "매출총이익", required: false },
    operatingIncome: { id: "dart_OperatingIncomeLoss", label: "영업이익", required: true },
    netIncome: { id: "ifrs-full_ProfitLoss", label: "당기순이익", required: true },
    netIncomeOwners: { id: "ifrs-full_ProfitLossAttributableToOwnersOfParent", label: "지배주주순이익", required: false },
    financeCosts: { id: "ifrs-full_FinanceCosts", label: "금융원가", required: false },

    // 현금흐름표
    operatingCashFlow: { id: "ifrs-full_CashFlowsFromUsedInOperatingActivities", label: "영업활동현금흐름", required: true },
    investingCashFlow: { id: "ifrs-full_CashFlowsFromUsedInInvestingActivities", label: "투자활동현금흐름", required: false },
    capex: {
        id: "ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
        label: "유형자산취득",
        required: false,
    },
    // 배당 지급액. 재무활동 현금흐름 항목이라 추가 API 호출 없이 6개년 배당 이력을 얻을 수 있다.
    // 현금 유출이라 음수로 오는 것이 보통이므로 쓰는 쪽에서 절댓값을 취한다.
    dividendsPaid: {
        id: "ifrs-full_DividendsPaidClassifiedAsFinancingActivities",
        label: "배당금지급",
        required: false,
    },
};

// 표준계정코드가 없는 소수 행을 대비한 계정명 보조 매칭
const NAME_FALLBACK = {
    operatingIncome: ["영업이익", "영업이익(손실)"],
    revenue: ["매출액", "수익(매출액)", "영업수익"],
    netIncome: ["당기순이익", "당기순이익(손실)"],
    // 배당금지급은 표준계정코드를 쓰지 않는 회사가 많아 계정명 후보를 넓게 잡는다
    dividendsPaid: ["배당금지급", "배당금의지급", "배당금지급액", "현금배당금의지급", "배당금의 지급"],
};

/**
 * DART 금액 문자열을 숫자로 변환한다.
 * 쉼표가 포함되고, 값이 없으면 빈 문자열이나 "-"로 온다.
 */
export function parseAmount(value) {
    if (value === undefined || value === null) return null;
    const cleaned = String(value).replace(/,/g, "").trim();
    if (cleaned === "" || cleaned === "-") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 응답 행들을 account_id 기준으로 색인한다.
 * 같은 계정이 여러 재무제표에 중복 등장할 수 있어 먼저 나온 것을 채택한다.
 */
function indexRows(rows) {
    const byId = new Map();
    const byName = new Map();

    for (const row of rows) {
        const id = row.account_id;
        if (id && id !== "-표준계정코드 미사용-" && !byId.has(id)) {
            byId.set(id, row);
        }
        const name = String(row.account_nm || "").replace(/\s/g, "");
        if (name && !byName.has(name)) {
            byName.set(name, row);
        }
    }
    return { byId, byName };
}

// 계정 하나를 찾는다 — 표준코드 우선, 실패 시 계정명 보조 매칭
function findRow(index, key) {
    const spec = ACCOUNTS[key];
    const row = index.byId.get(spec.id);
    if (row) return row;

    for (const name of NAME_FALLBACK[key] || []) {
        const found = index.byName.get(name.replace(/\s/g, ""));
        if (found) return found;
    }
    return null;
}

/**
 * 사업보고서 응답 1건을 3개년 재무 데이터로 변환한다.
 *
 * @param rows      fnlttSinglAcntAll 응답의 list
 * @param baseYear  해당 보고서의 사업연도 — 당기/전기/전전기 연도를 이 값에서 역산한다
 * @returns [{ year, assets, revenue, ... }] 최신 연도부터 정렬
 */
export function normalizeAnnual(rows, baseYear) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const index = indexRows(rows);
    // 당기/전기/전전기 → 실제 연도. 사업보고서(11011) 기준으로만 성립한다.
    const periods = [
        { field: "thstrm_amount", year: baseYear },
        { field: "frmtrm_amount", year: baseYear - 1 },
        { field: "bfefrmtrm_amount", year: baseYear - 2 },
    ];

    return periods
        .map(({ field, year }) => {
            const record = { year };
            let hasAny = false;

            for (const key of Object.keys(ACCOUNTS)) {
                const row = findRow(index, key);
                const amount = row ? parseAmount(row[field]) : null;
                record[key] = amount;
                if (amount !== null) hasAny = true;
            }
            return hasAny ? record : null;
        })
        .filter(Boolean);
}

/**
 * 필수 계정이 모두 채워졌는지 검증한다.
 * 하나라도 비면 그 연도의 지표 계산이 왜곡되므로 미리 걸러낸다.
 */
export function validateYear(record) {
    const missing = Object.entries(ACCOUNTS)
        .filter(([key, spec]) => spec.required && record[key] === null)
        .map(([, spec]) => spec.label);

    return { valid: missing.length === 0, missing };
}

/**
 * 여러 사업보고서 응답을 하나의 연도별 시계열로 병합한다.
 *
 * 보고서마다 3개년이 겹치므로(2025 보고서 = 2023~2025, 2022 보고서 = 2020~2022)
 * 같은 연도가 중복되면 더 최근 보고서의 값을 채택한다 — 소급 재작성이 반영된 값이기 때문이다.
 */
export function mergeAnnualSeries(seriesList) {
    const byYear = new Map();

    // 최신 보고서가 먼저 오도록 정렬한 뒤 먼저 들어온 값을 유지한다
    for (const series of seriesList) {
        for (const record of series) {
            if (!byYear.has(record.year)) byYear.set(record.year, record);
        }
    }

    return [...byYear.values()].sort((a, b) => b.year - a.year);
}

export { ACCOUNTS };
