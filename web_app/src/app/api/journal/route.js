import { NextResponse } from 'next/server';
import { adminDb, FieldValue, getUserIdFromRequest } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// 공용 시황 문서에서 화면에 필요한 필드만 추린다 (createdAt 등 직렬화 불가 필드 제외)
function toBriefing(data) {
    return {
        marketDate: data.marketDate || '', // 지수·뉴스의 기준일(직전 거래일). 구버전 문서에는 없다.
        headline: data.headline || '',
        summary: data.summary || '',
        domestic: data.domestic || [],
        overseas: data.overseas || [],
        watch: data.watch || [],
        indices: data.indices || [],
        sentiment: data.sentiment || null,
        sources: data.sources || [],
    };
}

// 날짜별 피드 조회 — 공용 시황(market_briefings)과 내 기록(users/{uid}/journals)을 날짜로 병합
export async function GET(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);

        const [briefingSnap, journalSnap] = await Promise.all([
            adminDb.collection('market_briefings').orderBy('date', 'desc').limit(limit).get(),
            adminDb.collection('users').doc(uid).collection('journals').orderBy('date', 'desc').limit(limit).get(),
        ]);

        // 날짜(YYYY-MM-DD)를 키로 시황 + 내 기록을 한 항목으로 합친다
        const byDate = new Map();
        for (const doc of briefingSnap.docs) {
            const data = doc.data();
            byDate.set(doc.id, { id: doc.id, date: data.date || doc.id, briefing: toBriefing(data), userNote: null });
        }
        for (const doc of journalSnap.docs) {
            const data = doc.data();
            const entry = byDate.get(doc.id) || { id: doc.id, date: data.date || doc.id, briefing: null, userNote: null };
            entry.userNote = data.userNote || null;
            byDate.set(doc.id, entry);
        }

        // 시황도 기록도 없는 빈 날짜는 제외하고 최신순 정렬
        const feed = [...byDate.values()]
            .filter((entry) => entry.briefing || entry.userNote)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, limit);

        return NextResponse.json(feed);
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

// 특정 날짜의 유저 메모 삭제 (구버전 개인 시황 aiContext가 남아 있으면 메모만 제거, 없으면 문서 자체 삭제)
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
