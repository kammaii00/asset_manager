import { NextResponse } from 'next/server';
import { adminDb, getUserIdFromRequest } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * 종목 검색 — stock_master(약 4천 건)를 메모리에 올려두고 부분 문자열로 찾는다.
 *
 * Firestore는 접두어 매칭만 가능해 "하이닉스"로 "SK하이닉스"를 찾을 수 없다.
 * 자동완성에서 이건 치명적이므로, 목록 전체를 한 번 읽어 프로세스 메모리에 캐싱한 뒤
 * 자바스크립트로 검색한다. 종목마스터는 월 1회만 바뀌므로 캐시 수명을 길게 잡아도 된다.
 */
let cache = { rows: null, loadedAt: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

async function loadStockMaster() {
    if (cache.rows && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return cache.rows;
    }

    const snap = await adminDb.collection('stock_master').get();
    const rows = snap.docs.map((doc) => {
        const d = doc.data();
        return {
            ticker: d.ticker || doc.id,
            name: d.name || '',
            searchName: d.searchName || '',
            market: d.market || null,
            sector: d.sector || null,
            // 보강 전이거나 거래 불가로 확인된 종목은 검색 결과에서 뒤로 밀거나 제외한다
            tradable: d.tradable !== false,
        };
    });

    cache = { rows, loadedAt: Date.now() };
    return rows;
}

// 검색어 정규화 — 적재 시 searchName과 동일한 규칙이어야 매칭된다
function normalize(value) {
    return String(value || '').toLowerCase().replace(/[\s.,()·]/g, '');
}

export async function GET(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const query = normalize(new URL(request.url).searchParams.get('q'));
        if (query.length < 1) {
            return NextResponse.json([]);
        }

        const rows = await loadStockMaster();

        // 종목코드로 바로 찾는 경우도 지원한다 (6자리 숫자 입력)
        const byTicker = /^\d{1,6}$/.test(query);

        const matched = rows.filter((row) =>
            byTicker ? row.ticker.startsWith(query) : row.searchName.includes(query),
        );

        // 접두어 일치를 앞에, 이름이 짧은 것을 앞에 둔다 ("삼성전자" 검색 시 "삼성전자우"보다 먼저)
        matched.sort((a, b) => {
            const aPrefix = a.searchName.startsWith(query) ? 0 : 1;
            const bPrefix = b.searchName.startsWith(query) ? 0 : 1;
            if (aPrefix !== bPrefix) return aPrefix - bPrefix;
            if (a.tradable !== b.tradable) return a.tradable ? -1 : 1;
            return a.name.length - b.name.length;
        });

        return NextResponse.json(matched.slice(0, 20));
    } catch (error) {
        console.error('Stock search error:', error);
        return NextResponse.json({ error: '종목 검색에 실패했습니다.' }, { status: 500 });
    }
}
