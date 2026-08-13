import { NextResponse } from 'next/server';
import { adminDb, getUserIdFromRequest } from '@/lib/firebase-admin';
import { isActiveRequest } from '@/lib/analysisRequest';

export const dynamic = 'force-dynamic';

/**
 * 분석 요청 하나의 상태 조회 — 진행률 폴링과 완료 리포트 수신을 겸한다.
 *
 * 이 앱은 firebase/firestore/lite를 쓰는데 lite 버전은 onSnapshot(실시간 구독)을
 * 지원하지 않는다. 전체 SDK로 교체하면 앱 공통 코드와 번들 크기에 영향을 주므로,
 * 2분 남짓 걸리는 작업 하나를 위해 폴링을 택했다.
 *
 * 리포트는 stock_analyses(공용 경로)에 있어 클라이언트가 직접 읽을 수 없다
 * (firestore.rules 기본 차단). market_briefings와 동일하게 서버가 Admin SDK로 읽어 전달한다.
 */
export async function GET(request, { params }) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const snap = await adminDb.collection('users').doc(uid).collection('analysis_requests').doc(id).get();
        if (!snap.exists) {
            return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });
        }

        const data = snap.data();
        const result = {
            id: snap.id,
            ticker: data.ticker,
            stockName: data.stockName,
            status: data.status,
            progress: data.progress ?? null,
            error: data.error ?? null,
            scoreTotal: data.scoreTotal ?? null,
            grade: data.grade ?? null,
            costUsd: data.costUsd ?? null,
            report: null,
        };

        // 완료된 경우에만 리포트 본문을 함께 내려준다 (폴링 중 불필요한 읽기를 피한다)
        if (data.status === 'done' && data.reportPath) {
            const reportSnap = await adminDb.doc(data.reportPath).get();
            if (reportSnap.exists) {
                const report = reportSnap.data();
                // Firestore Timestamp는 그대로 직렬화되지 않으므로 ISO 문자열로 바꿔 내려준다
                // (화면에 "언제 분석한 리포트인지" 표시하는 데 쓴다)
                report.createdAt = report.createdAt?.toDate?.().toISOString() ?? null;
                // 리포트 문서 ID가 곧 분석 날짜(YYYY-MM-DD, KST) — createdAt이 없는 초기 리포트의 대비책
                report.reportDate = reportSnap.id;
                result.report = report;
            }
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Analysis status error:', error);
        return NextResponse.json({ error: '분석 상태를 불러오지 못했습니다.' }, { status: 500 });
    }
}

/**
 * 분석 기록 삭제.
 *
 * 지우는 것은 내 요청 기록(users/{uid}/analysis_requests)뿐이고, 리포트 원본
 * (stock_analyses/{ticker}/reports/{date})은 남긴다. 리포트는 종목·날짜 단위 공용
 * 문서라 같은 종목을 다시 분석할 때 재사용돼 비용을 아끼며, 한 사용자의 목록 정리 때문에
 * 지울 성질의 것이 아니다.
 */
export async function DELETE(request, { params }) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const ref = adminDb.collection('users').doc(uid).collection('analysis_requests').doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });
        }

        // 정말 돌고 있는 요청을 지우면 큐 함수가 완료를 기록하면서 문서를 되살린다.
        // 반대로 오래 멈춰 있는 잔해는 지울 수 있어야 한다 (판정 기준은 analysisRequest.js).
        if (isActiveRequest(snap.data())) {
            return NextResponse.json({ error: '분석이 진행 중입니다. 끝난 뒤에 삭제해 주세요.' }, { status: 409 });
        }

        await ref.delete();
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Analysis delete error:', error);
        return NextResponse.json({ error: '삭제하지 못했습니다.' }, { status: 500 });
    }
}
