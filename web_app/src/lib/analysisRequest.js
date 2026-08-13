/**
 * 분석 요청 상태 판정 — 목록 삭제(DELETE)와 중복 요청 검사(POST)가 같은 기준을 써야 한다.
 *
 * 큐 등록에는 성공했지만 함수가 실행되지 못하면(IAM 권한 누락 등) 요청이 'queued'인 채로
 * 영영 남는다. 이 잔해를 '진행 중'으로 취급하면 지울 수도, 같은 종목을 다시 분석할 수도 없다.
 */

// 분석 자체는 80~120초가 걸린다. 그보다 넉넉한 이 시간이 지나면 죽은 요청으로 본다.
export const STALE_AFTER_MS = 10 * 60 * 1000;

// 지금도 실제로 돌고 있는 요청인지 — 오래된 'queued'는 살아 있다고 보지 않는다
export function isActiveRequest(data) {
    if (data?.status !== 'queued' && data?.status !== 'running') return false;
    const ageMs = Date.now() - (Date.parse(data.createdAt ?? '') || 0);
    return ageMs < STALE_AFTER_MS;
}
