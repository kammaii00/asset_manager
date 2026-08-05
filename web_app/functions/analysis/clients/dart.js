/**
 * DART OpenAPI (금융감독원 전자공시) 클라이언트
 *
 * 재무제표·공시의 원천 소스. 종목코드(005930)가 아니라 8자리 고유번호(corp_code)로 조회한다는 점이 핵심.
 * 인증키는 Secret Manager에서 주입받아 호출 시점에 인자로 넘긴다(모듈 로드 시점에는 시크릿이 없을 수 있음).
 */

const BASE_URL = "https://opendart.fss.or.kr/api";

// DART 응답의 status 코드별 의미 — 오류 메시지를 사람이 읽을 수 있게 바꾼다
const STATUS_MESSAGES = {
    "000": "정상",
    "010": "등록되지 않은 키입니다",
    "011": "사용할 수 없는 키입니다(오픈API 이용신청 확인 필요)",
    "012": "접근할 수 없는 IP입니다",
    "013": "조회된 데이터가 없습니다",
    "014": "파일이 존재하지 않습니다",
    "020": "요청 제한을 초과했습니다(일일 호출 한도)",
    "021": "조회 가능한 회사 개수를 초과했습니다",
    "100": "필드의 부적절한 값입니다",
    "101": "부적절한 접근입니다",
    "800": "시스템 점검 중입니다",
    "900": "정의되지 않은 오류입니다",
    "901": "사용자 계정의 개인정보 보유기간이 만료되었습니다",
};

// status 코드로 오류 여부를 판정 — 000(정상)과 013(데이터 없음)만 정상 흐름으로 취급
function assertOk(payload, context) {
    const status = payload?.status;
    if (status === "000") return payload;
    if (status === "013") return { ...payload, list: [] }; // 데이터 없음은 빈 결과로 정규화
    const message = STATUS_MESSAGES[status] || "알 수 없는 오류";
    throw new Error(`DART ${context} 실패 [${status}] ${message}`);
}

// DART JSON API 공통 호출 — 인증키를 붙이고 status 검증까지 수행한다
async function callJson(apiKey, path, params, context) {
    const query = new URLSearchParams({ crtfc_key: apiKey, ...params });
    const response = await fetch(`${BASE_URL}/${path}?${query}`);

    if (!response.ok) {
        throw new Error(`DART ${context} HTTP ${response.status}`);
    }
    return assertOk(await response.json(), context);
}

/**
 * 전체 법인의 고유번호 매핑 파일을 내려받는다.
 *
 * 주의: 엔드포인트 이름이 corpCode.xml이지만 실제 응답은 ZIP 바이너리다.
 * 압축을 푸는 것은 호출자(stockMaster.js)의 몫이며, 여기서는 버퍼만 반환한다.
 */
export async function fetchCorpCodeZip(apiKey) {
    const response = await fetch(`${BASE_URL}/corpCode.xml?crtfc_key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`DART 고유번호 파일 HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // 인증키가 잘못되면 ZIP이 아니라 JSON 오류 문서가 내려온다.
    // ZIP 파일은 항상 'PK'(0x50 0x4B)로 시작하므로 이것으로 구분한다.
    if (buffer.length < 2 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        let detail = buffer.toString("utf8").slice(0, 300);
        try {
            const parsed = JSON.parse(detail);
            const status = parsed.status;
            detail = `[${status}] ${STATUS_MESSAGES[status] || parsed.message || "알 수 없는 오류"}`;
        } catch {
            // JSON도 아니면 원문 앞부분을 그대로 노출한다
        }
        throw new Error(`DART 고유번호 파일이 ZIP이 아닙니다 — ${detail}`);
    }

    return buffer;
}

/**
 * 기업개황 조회 — 업종코드(induty_code), 결산월, 대표자 등 기본 정보.
 * 종목마스터에 업종을 채워 넣을 때 사용한다.
 */
export async function fetchCompanyProfile(apiKey, corpCode) {
    return callJson(apiKey, "company.json", { corp_code: corpCode }, "기업개황");
}

/**
 * 단일회사 전체 재무제표 조회.
 *
 * @param reportCode 11011=사업보고서, 11012=반기, 11013=1분기, 11014=3분기
 * @param fsDiv      CFS=연결, OFS=별도 (연결이 없는 회사는 CFS 조회 시 빈 결과)
 */
export async function fetchFinancialStatements(apiKey, corpCode, businessYear, reportCode, fsDiv = "CFS") {
    return callJson(
        apiKey,
        "fnlttSinglAcntAll.json",
        { corp_code: corpCode, bsns_year: String(businessYear), reprt_code: reportCode, fs_div: fsDiv },
        "재무제표",
    );
}

/**
 * 공시목록 조회 — 유상증자·자사주·최대주주 변경 등 이벤트 탐지용.
 *
 * @param beginDate/endDate YYYYMMDD
 */
export async function fetchDisclosures(apiKey, corpCode, beginDate, endDate, pageCount = 100) {
    return callJson(
        apiKey,
        "list.json",
        {
            corp_code: corpCode,
            bgn_de: beginDate,
            end_de: endDate,
            page_count: String(pageCount),
        },
        "공시목록",
    );
}
