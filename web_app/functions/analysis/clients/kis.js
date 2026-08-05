/**
 * 한국투자증권 KIS Developers 클라이언트 (실전투자, 조회 전용)
 *
 * ⚠️ 보안: KIS 앱키는 실제 계좌의 '주문 권한'을 포함한다. DART·ECOS 키와 위험도가 다르다.
 * 이 모듈은 조회 API만 다루며, 주문 경로(/uapi/domestic-stock/v1/trading/*)는
 * 코드에 존재하지 않을 뿐 아니라 ALLOWED_PATHS 화이트리스트로 이중 차단한다.
 * 주문 기능이 필요해지더라도 이 파일에 추가해서는 안 된다.
 */

const BASE_URL = "https://openapi.koreainvestment.com:9443";

// 호출을 허용할 경로 — 여기에 없는 경로는 요청 자체를 만들지 않는다
const ALLOWED_PATHS = new Set([
    "/oauth2/tokenP",
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
    "/uapi/domestic-stock/v1/quotations/inquire-investor",
]);

// 시장구분 코드 — J는 주식/ETF/ETN 공통
const MARKET_DIV = "J";

// 유량 제한 간격.
// 문서상 실전투자는 초당 20건이지만, 실측에서 100ms 간격(초당 10건)에도
// "초당 거래건수를 초과하였습니다"(EGW00201)가 발생했다.
// 계정·API별로 실제 한도가 더 빡빡하므로 여유 있게 300ms(초당 약 3건)로 잡는다.
// 이 기능은 요청 시점에 소수 종목만 조회하므로 느려도 문제되지 않는다.
const MIN_INTERVAL_MS = 300;
let lastCallAt = 0;

// 유량 초과 시 재시도 설정 — 일시적 오류이므로 백오프 후 다시 시도한다
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

// KIS가 유량 초과를 알리는 방식 — HTTP 500에 메시지로 내려온다
function isRateLimited(payload) {
    return /초당 거래건수|EGW00201/.test(`${payload?.msg1 ?? ""} ${payload?.msg_cd ?? ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 유량 제한 준수 — 직전 호출로부터 최소 간격이 지나도록 대기한다
async function throttle() {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastCallAt = Date.now();
}

// 화이트리스트 검증 — 조회 외 경로는 여기서 막힌다
function assertAllowed(path) {
    if (!ALLOWED_PATHS.has(path)) {
        throw new Error(`KIS 허용되지 않은 경로입니다(조회 전용): ${path}`);
    }
}

/**
 * Firestore 기반 토큰 저장소.
 *
 * KIS 접근토큰은 24시간 유효하지만 재발급이 1분에 1회로 제한된다.
 * 함수 실행마다 새로 발급받으면 즉시 차단되므로 반드시 캐싱해야 한다.
 */
export function createFirestoreTokenStore(db) {
    const ref = db.collection("system").doc("kis_token");
    return {
        async get() {
            const snap = await ref.get();
            return snap.exists ? snap.data() : null;
        },
        async set(value) {
            await ref.set(value, { merge: true });
        },
    };
}

// 테스트·로컬 검증용 메모리 저장소 (Firestore 없이 동작 확인할 때 사용)
export function createMemoryTokenStore() {
    let cached = null;
    return {
        async get() {
            return cached;
        },
        async set(value) {
            cached = value;
        },
    };
}

/**
 * 접근토큰 발급 — 캐시가 유효하면 재사용하고, 만료 10분 전에만 새로 받는다.
 *
 * 1분 1회 제한에 걸리면 KIS가 EGW00133 오류를 반환한다. 이때 캐시된 토큰이 남아 있으면
 * 만료 전까지는 그대로 쓰는 것이 정상 동작이므로, 캐시가 아예 없을 때만 오류를 올린다.
 */
export async function getAccessToken(appKey, appSecret, store) {
    const cached = await store.get();
    const safetyMarginMs = 10 * 60 * 1000;

    if (cached?.accessToken && cached.expiresAt > Date.now() + safetyMarginMs) {
        return cached.accessToken;
    }

    assertAllowed("/oauth2/tokenP");
    await throttle();

    const response = await fetch(`${BASE_URL}/oauth2/tokenP`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            grant_type: "client_credentials",
            appkey: appKey,
            appsecret: appSecret,
        }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.access_token) {
        // 재발급 제한에 걸렸지만 아직 살아 있는 토큰이 있으면 그것을 계속 쓴다
        if (cached?.accessToken && cached.expiresAt > Date.now()) {
            console.warn(`KIS 토큰 재발급 실패, 기존 토큰 유지 — ${payload.error_description || response.status}`);
            return cached.accessToken;
        }
        throw new Error(
            `KIS 토큰 발급 실패 [${response.status}] ${payload.error_description || payload.msg1 || "알 수 없는 오류"}`,
        );
    }

    // expires_in은 초 단위(보통 86400)
    const expiresAt = Date.now() + Number(payload.expires_in || 86400) * 1000;
    await store.set({ accessToken: payload.access_token, expiresAt, issuedAt: Date.now() });

    return payload.access_token;
}

/**
 * 조회 API 공통 호출.
 * KIS는 REST이지만 요청마다 거래ID(tr_id) 헤더를 명시해야 하며, API별로 값이 다르다.
 */
async function callQuotation({ appKey, appSecret, store }, path, trId, params) {
    assertAllowed(path);

    const token = await getAccessToken(appKey, appSecret, store);
    const query = new URLSearchParams(params);

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        await throttle();

        const response = await fetch(`${BASE_URL}${path}?${query}`, {
            headers: {
                authorization: `Bearer ${token}`,
                appkey: appKey,
                appsecret: appSecret,
                tr_id: trId,
                "content-type": "application/json",
            },
        });

        const payload = await response.json().catch(() => ({}));

        // 유량 초과는 일시적이므로 지수 백오프 후 재시도한다.
        // 재시도하지 않으면 '종목 없음' 같은 다른 오류로 오인하게 된다.
        if (isRateLimited(payload)) {
            lastError = new Error(`KIS ${trId} 유량 초과 — ${payload.msg1}`);
            if (attempt < MAX_RETRIES) {
                const wait = RETRY_BASE_MS * 2 ** attempt;
                console.warn(`KIS 유량 초과, ${wait}ms 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
                await sleep(wait);
                continue;
            }
            throw lastError;
        }

        if (!response.ok) {
            throw new Error(`KIS ${trId} HTTP ${response.status} ${payload.msg1 || ""}`.trim());
        }
        // rt_cd: 0=정상, 그 외는 오류이며 msg1에 사유가 담긴다
        if (payload.rt_cd !== "0") {
            throw new Error(`KIS ${trId} 실패 [${payload.msg_cd || payload.rt_cd}] ${payload.msg1 || ""}`.trim());
        }

        return payload;
    }

    throw lastError;
}

/**
 * 주식 현재가 시세 — 시가총액·상장주식수·PER·PBR·외국인보유비중·종목상태를 한 번에 받는다.
 *
 * 밸류에이션의 분모(시가총액)와 Red Flag 판정(관리종목·거래정지)이 모두 여기서 나오는,
 * 분석 파이프라인에서 가장 자주 쓰는 호출이다.
 */
export async function fetchCurrentPrice(credentials, ticker) {
    const payload = await callQuotation(
        credentials,
        "/uapi/domestic-stock/v1/quotations/inquire-price",
        "FHKST01010100",
        { FID_COND_MRKT_DIV_CODE: MARKET_DIV, FID_INPUT_ISCD: ticker },
    );
    return payload.output;
}

/**
 * 기간별 일봉 시세.
 *
 * @param beginDate/endDate YYYYMMDD
 * @param adjusted 수정주가 반영 여부 — 액면분할·증자 영향을 제거하려면 true(기본값)
 *
 * KIS는 한 번에 최대 100건 내외만 반환하므로, 3년치는 호출자가 구간을 나눠 반복 호출해야 한다.
 */
export async function fetchDailyPrices(credentials, ticker, beginDate, endDate, adjusted = true) {
    const payload = await callQuotation(
        credentials,
        "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
        "FHKST03010100",
        {
            FID_COND_MRKT_DIV_CODE: MARKET_DIV,
            FID_INPUT_ISCD: ticker,
            FID_INPUT_DATE_1: beginDate,
            FID_INPUT_DATE_2: endDate,
            FID_PERIOD_DIV_CODE: "D", // D=일, W=주, M=월, Y=년
            FID_ORG_ADJ_PRC: adjusted ? "0" : "1", // 0=수정주가, 1=원주가
        },
    );
    // output1=종목 요약, output2=일자별 배열
    return { summary: payload.output1, rows: payload.output2 || [] };
}

/**
 * 투자자별 매매동향 — 외국인·기관·개인 순매수.
 * Yahoo Finance로는 얻을 수 없는 데이터이며, Sentiment 축의 핵심 입력값이다.
 */
export async function fetchInvestorFlows(credentials, ticker) {
    const payload = await callQuotation(
        credentials,
        "/uapi/domestic-stock/v1/quotations/inquire-investor",
        "FHKST01010900",
        { FID_COND_MRKT_DIV_CODE: MARKET_DIV, FID_INPUT_ISCD: ticker },
    );
    return payload.output || [];
}
