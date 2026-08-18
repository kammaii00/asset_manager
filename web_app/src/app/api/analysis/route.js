import { NextResponse } from 'next/server';
import { getFunctions } from 'firebase-admin/functions';
import { adminApp, adminDb, getUserIdFromRequest } from '@/lib/firebase-admin';
import { isActiveRequest } from '@/lib/analysisRequest';

export const dynamic = 'force-dynamic';

// 큐 함수가 배포된 리전 — 함수 정의(analyzeStockTask.js)와 반드시 일치해야 한다
const QUEUE_PATH = 'locations/asia-northeast3/functions/analyzeStock';

/**
 * 분석 요청 — 큐에 넣고 즉시 응답한다.
 *
 * 분석 1건에 1~2분이 걸리므로 여기서 기다리면 요청이 타임아웃된다.
 * 진행 상황은 클라이언트가 Firestore를 구독해 실시간으로 받는다.
 */
export async function POST(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ticker } = await request.json();
        if (!/^\d{6}$/.test(String(ticker || ''))) {
            return NextResponse.json({ error: '종목코드는 6자리 숫자여야 합니다.' }, { status: 400 });
        }

        // 종목마스터에 없는 종목은 큐에 넣기 전에 막는다 (헛된 함수 실행 방지)
        const masterSnap = await adminDb.collection('stock_master').doc(ticker).get();
        if (!masterSnap.exists) {
            return NextResponse.json({ error: '등록되지 않은 종목입니다.' }, { status: 404 });
        }
        const master = masterSnap.data();

        // 같은 종목이 이미 대기·진행 중이면 중복 요청을 만들지 않는다 (LLM 비용 절약).
        // 단 큐 등록 후 실행되지 못해 'queued'로 굳어버린 잔해는 재사용하면 안 된다 —
        // 진행률 0%에서 영영 멈춘 요청을 돌려주게 되므로, 죽은 요청은 무시하고 새로 시작한다.
        const running = await adminDb
            .collection('users').doc(uid).collection('analysis_requests')
            .where('ticker', '==', ticker)
            .where('status', 'in', ['queued', 'running'])
            .limit(5)
            .get();

        const active = running.docs.find((doc) => isActiveRequest(doc.data()));
        if (active) {
            return NextResponse.json({ requestId: active.id, reused: true }, { status: 202 });
        }

        const requestRef = adminDb.collection('users').doc(uid).collection('analysis_requests').doc();
        await requestRef.set({
            ticker,
            stockName: master.name || '',
            status: 'queued',
            progress: { step: 0, message: '대기 중', pct: 0 },
            error: null,
            createdAt: new Date().toISOString(),
        });

        // 앱을 반드시 명시한다 — 인자를 비우면 기본 앱을 찾는데, 운영(Firebase Hosting)에서는
        // firebase-frameworks가 만든 이름 붙은 앱만 있는 상황이 생겨 호출 자체가 실패한다.
        try {
            await getFunctions(adminApp)
                .taskQueue(QUEUE_PATH)
                .enqueue({ requestId: requestRef.id, uid, ticker });
        } catch (error) {
            // 큐 등록에 실패하면 방금 만든 요청 문서를 'failed'로 확정한다.
            // 'queued'로 남겨두면 아래 중복 검사가 이 잔해를 살아 있는 요청으로 보고 재사용해,
            // 곧바로 다시 눌러도 큐에 들어가지 못한 채 화면만 영원히 '진행 중'이 된다.
            console.error('Analysis enqueue error:', error);
            await requestRef.set(
                { status: 'failed', error: `분석 요청을 큐에 등록하지 못했습니다: ${error.message}` },
                { merge: true },
            );
            return NextResponse.json({ error: '분석 요청에 실패했습니다.' }, { status: 500 });
        }

        return NextResponse.json({ requestId: requestRef.id, reused: false }, { status: 202 });
    } catch (error) {
        console.error('Analysis enqueue error:', error);
        return NextResponse.json({ error: '분석 요청에 실패했습니다.' }, { status: 500 });
    }
}

/** 내 분석 요청 목록 — 최신순 */
export async function GET(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 20, 50);
        const snap = await adminDb
            .collection('users').doc(uid).collection('analysis_requests')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        return NextResponse.json(snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), updatedAt: null })));
    } catch (error) {
        console.error('Analysis list error:', error);
        return NextResponse.json({ error: '분석 목록을 불러오지 못했습니다.' }, { status: 500 });
    }
}
