import { NextResponse } from 'next/server';
import { getFunctions } from 'firebase-admin/functions';
import { adminDb, getUserIdFromRequest } from '@/lib/firebase-admin';

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

        // 같은 종목이 이미 대기·진행 중이면 중복 요청을 만들지 않는다 (LLM 비용 절약)
        const running = await adminDb
            .collection('users').doc(uid).collection('analysis_requests')
            .where('ticker', '==', ticker)
            .where('status', 'in', ['queued', 'running'])
            .limit(1)
            .get();

        if (!running.empty) {
            return NextResponse.json({ requestId: running.docs[0].id, reused: true }, { status: 202 });
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

        await getFunctions()
            .taskQueue(QUEUE_PATH)
            .enqueue({ requestId: requestRef.id, uid, ticker });

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
