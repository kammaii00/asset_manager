import { NextResponse } from 'next/server';
import { adminDb, FieldValue, getUserIdFromRequest } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// 투자일기 목록 조회 (날짜 내림차순, 기본 30개)
export async function GET(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);

        const snap = await adminDb
            .collection('users').doc(uid).collection('journals')
            .orderBy('date', 'desc')
            .limit(limit)
            .get();

        const journals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return NextResponse.json(journals);
    } catch (error) {
        console.error('Journal GET Error:', error);
        return NextResponse.json({ error: '일기 목록을 불러오지 못했습니다.' }, { status: 500 });
    }
}

// 특정 날짜의 유저 메모(주관 기록) 저장/수정
export async function POST(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { date, text, emotion } = await request.json();
        if (!date) {
            return NextResponse.json({ error: 'date는 필수입니다.' }, { status: 400 });
        }

        const userNote = {
            text: text || '',
            emotion: emotion || null,
            updatedAt: new Date().toISOString(),
        };

        const docRef = adminDb.collection('users').doc(uid).collection('journals').doc(date);
        // aiContext 등 기존 필드는 보존하고 userNote만 병합
        await docRef.set({ date, userNote }, { merge: true });

        return NextResponse.json({ id: date, date, userNote });
    } catch (error) {
        console.error('Journal POST Error:', error);
        return NextResponse.json({ error: '일기 저장에 실패했습니다.' }, { status: 500 });
    }
}

// 특정 날짜의 유저 메모 삭제 (AI 시황이 있으면 메모만 제거, 없으면 문서 자체 삭제)
export async function DELETE(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const date = new URL(request.url).searchParams.get('date');
        if (!date) {
            return NextResponse.json({ error: 'date는 필수입니다.' }, { status: 400 });
        }

        const docRef = adminDb.collection('users').doc(uid).collection('journals').doc(date);
        const snap = await docRef.get();
        if (snap.exists && snap.data().aiContext) {
            await docRef.update({ userNote: FieldValue.delete() });
        } else if (snap.exists) {
            await docRef.delete();
        }

        return NextResponse.json({ id: date, date, deleted: true });
    } catch (error) {
        console.error('Journal DELETE Error:', error);
        return NextResponse.json({ error: '일기 삭제에 실패했습니다.' }, { status: 500 });
    }
}
