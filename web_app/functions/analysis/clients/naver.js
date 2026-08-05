/**
 * 네이버 뉴스 검색 클라이언트 (NAVER API HUB)
 *
 * ⚠️ 2026년 기준으로 검색 API가 developers.naver.com에서 네이버 클라우드 플랫폼으로 이전됐다.
 *    - 엔드포인트: openapi.naver.com → naverapihub.apigw.ntruss.com
 *    - 인증 헤더: X-Naver-Client-Id/Secret → X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
 *    환경변수명(NAVER_CLIENT_ID/SECRET)은 구버전 관례를 유지하지만 전송은 NCP 헤더로 한다.
 */

const BASE_URL = "https://naverapihub.apigw.ntruss.com/search/v1";

// 검색 결과의 제목·요약에는 검색어 강조용 <b> 태그와 HTML 엔티티가 섞여 온다.
// 그대로 LLM에 넘기면 토큰만 낭비하고 분석에 노이즈가 되므로 여기서 제거한다.
function stripMarkup(text) {
    return String(text || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .trim();
}

// RFC 1123 형식(pubDate)을 YYYY-MM-DD로 정규화 — 뉴스 타임라인 정렬에 쓴다
function toDateString(pubDate) {
    const parsed = new Date(pubDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * 종목 관련 뉴스 검색.
 *
 * @param sort "date"=최신순(기본), "sim"=정확도순
 *   재료 판단에는 최신순이 유리하다. 정확도순은 오래된 기사가 상위에 올 수 있다.
 */
export async function searchNews(keyId, keySecret, query, { display = 50, start = 1, sort = "date" } = {}) {
    const params = new URLSearchParams({
        query,
        display: String(Math.min(display, 100)), // API 상한 100
        start: String(start),
        sort,
    });

    const response = await fetch(`${BASE_URL}/news?${params}`, {
        headers: {
            "X-NCP-APIGW-API-KEY-ID": keyId,
            "X-NCP-APIGW-API-KEY": keySecret,
        },
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`네이버 뉴스 검색 실패 [${response.status}] ${detail.slice(0, 200)}`);
    }

    const payload = await response.json();

    return (payload.items || []).map((item) => ({
        title: stripMarkup(item.title),
        summary: stripMarkup(item.description),
        link: item.originallink || item.link,
        naverLink: item.link,
        date: toDateString(item.pubDate),
    }));
}

/**
 * 분석용 뉴스 수집 — 회사명으로 검색하되 최근 기사만 남긴다.
 *
 * 오래된 기사는 현재 주가에 이미 반영돼 있어 판단에 도움이 되지 않으므로
 * 기본 90일로 제한한다.
 */
export async function fetchStockNews(keyId, keySecret, stockName, { days = 90, display = 50 } = {}) {
    const items = await searchNews(keyId, keySecret, stockName, { display });

    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const recent = items.filter((item) => item.date && item.date >= cutoff);

    return {
        query: stockName,
        total: items.length,
        items: recent,
        // 기간 필터로 몇 건이 걸러졌는지 — 뉴스가 거의 없는 종목을 판별하는 데 쓴다
        filteredOut: items.length - recent.length,
    };
}
