import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { headers } from 'next/headers';
import { default as YahooFinance } from 'yahoo-finance2';
import { adminDb, getUserIdFromRequest } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// KST(Asia/Seoul) 기준 오늘 날짜 문자열(YYYY-MM-DD) 반환
function getTodayKST() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
}

// 야후 심볼 정규화 (KR 주식은 .KS 우선)
function toQuerySymbol(asset) {
    let sym = asset.symbol;
    if (asset.type === 'crypto' && !sym.includes('-')) sym = `${sym}-USD`;
    if ((asset.type === 'stock' || asset.type === 'pension') && asset.region === 'KR' && !sym.includes('.')) {
        sym = `${sym}.KS`;
    }
    return sym;
}

// 마감 계열 marketState (정규장 종료 → 종가 확정으로 간주)
const CLOSED_STATES = new Set(['POST', 'POSTPOST', 'CLOSED']);

// 개별 뉴스가 이름 검색으로 노이즈를 잘 물어오는 유형 (ETF·펀드) → 종목 뉴스 근거에서 제외
const NO_NEWS_TYPES = new Set(['ETF', 'MUTUALFUND', 'INDEX']);

// quote에서 등락률·marketState·quoteType 추출
function applyQuote(result, quote) {
    if (quote?.regularMarketChangePercent != null) {
        result.changePercent = Number(quote.regularMarketChangePercent.toFixed(2));
    } else if (quote?.regularMarketPrice && quote?.regularMarketPreviousClose) {
        result.changePercent = Number((((quote.regularMarketPrice - quote.regularMarketPreviousClose) / quote.regularMarketPreviousClose) * 100).toFixed(2));
    }
    if (quote?.marketState) result.marketState = quote.marketState;
    if (quote?.quoteType) result.quoteType = quote.quoteType;
}

// 보유 종목 1건의 등락률·marketState·대표 뉴스 헤드라인을 조회
async function fetchHoldingContext(yf, asset) {
    const result = { symbol: asset.symbol, name: asset.name, changePercent: null, marketState: null, quoteType: null, headline: null };
    const querySymbol = toQuerySymbol(asset);
    try {
        applyQuote(result, await yf.quote(querySymbol));
    } catch (e) {
        // KR은 KOSDAQ(.KQ) 재시도
        if (asset.region === 'KR' && querySymbol.endsWith('.KS')) {
            try {
                applyQuote(result, await yf.quote(`${asset.symbol}.KQ`));
            } catch (_) { /* 무시 */ }
        }
    }
    // ETF·펀드는 이름 검색 뉴스의 관련성이 낮아 환각을 유발하므로 종목 뉴스를 수집하지 않음
    if (NO_NEWS_TYPES.has(result.quoteType)) return result;
    // 대표 뉴스 1건 (KR은 종목명, 그 외는 심볼로 검색)
    try {
        const query = asset.region === 'KR' ? asset.name : asset.symbol;
        const search = await yf.search(query, { newsCount: 2, quotesCount: 0 });
        const news = (search?.news || []).find((n) => n.title);
        if (news) result.headline = news.title;
    } catch (_) { /* 뉴스는 실패해도 무시 */ }
    return result;
}

// 시장 지수 요약 (보유 지역에 맞춰 최소한만 조회)
async function fetchIndices(yf, regions) {
    const targets = [];
    if (regions.has('KR')) targets.push({ symbol: '^KS11', name: '코스피' });
    if (regions.has('US')) targets.push({ symbol: '^IXIC', name: '나스닥' }, { symbol: '^GSPC', name: 'S&P500' });
    const results = await Promise.all(targets.map(async (t) => {
        try {
            const q = await yf.quote(t.symbol);
            const pct = q?.regularMarketChangePercent;
            return { name: t.name, changePercent: pct != null ? Number(pct.toFixed(2)) : null, marketState: q?.marketState || null };
        } catch (_) {
            return null;
        }
    }));
    return results.filter(Boolean);
}

// 모든 종목·지수가 마감 상태면 종가 확정(finalized). 하나라도 장중/장전이면 잠정
function computeFinalized(indices, holdings) {
    const states = [...indices, ...holdings].map((x) => x.marketState).filter(Boolean);
    if (states.length === 0) return true; // 판단할 시세가 없으면 확정 취급
    return states.every((s) => CLOSED_STATES.has(s));
}

// 보유 지역에 맞춘 시장 전반 뉴스 헤드라인 수집 (배경/이유 해설의 근거)
async function fetchMarketNews(yf, regions) {
    const queries = [];
    if (regions.has('KR')) queries.push('코스피 증시');
    if (regions.has('US')) queries.push('US stock market');
    if (queries.length === 0) queries.push('증시');

    const lists = await Promise.all(queries.map(async (q) => {
        try {
            const s = await yf.search(q, { newsCount: 4, quotesCount: 0 });
            return (s?.news || []).map((n) => n.title).filter(Boolean);
        } catch (_) {
            return [];
        }
    }));
    // 평탄화 + 중복 제거 + 상위 5개
    return [...new Set(lists.flat())].slice(0, 5);
}

// 로그인 유저의 자산을 내부 API로 조회
async function fetchUserAssets(authHeader) {
    const reqHeaders = await headers();
    const host = reqHeaders.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const res = await fetch(`${protocol}://${host}/api/assets`, { headers: { Authorization: authHeader } });
    if (!res.ok) return [];
    return res.json();
}

// Gemini로 오늘의 시황 코멘트 생성 — 종목 등락 나열이 아니라 '왜 이런 흐름인지'를 뉴스 근거로 해설
async function generateMarketSummary({ date, indices, holdings, marketNews }) {
    const holdingNews = holdings.filter((h) => h.headline).map((h) => `${h.name}: ${h.headline}`);
    const prompt = `오늘은 ${date}입니다. 당신은 개인 투자자를 돕는 노련한 투자 전문가입니다.
아래 데이터로 "오늘의 시황" 코멘트를 한국어 3문장 내외로 작성하세요.

[시장 지수 등락] ${JSON.stringify(indices)}
[시장 뉴스 헤드라인] ${JSON.stringify(marketNews)}
[보유 종목 관련 뉴스] ${JSON.stringify(holdingNews)}

작성 규칙:
1. 첫 문장: 지수 등락으로 시장 전반의 분위기를 한 줄로 요약하세요.
2. 이어서: 위 '뉴스 헤드라인'을 근거로 오늘 이런 흐름을 보이는 배경/이유를 전문가 시각으로 간결히 해설하세요.
   - 반드시 제공된 뉴스에 근거하세요. 뉴스에 없는 원인(금리·정책·수급 등)을 임의로 지어내지 마세요.
   - 근거로 삼을 뉴스가 빈약하면 원인을 단정하지 말고 "뚜렷한 재료 없이 관망세" 처럼 담백하게 서술하세요.
   - 헤드라인 내용이 특정 종목과 명확히 연결될 때만 그 종목을 언급하세요. 단순히 "○○ 관련 소식이 있었다"는 식으로 뉴스의 존재만 근거 없이 언급하지 마세요.
3. 개별 종목의 등락률 숫자를 나열하지 마세요(이미 화면 카드에 표시됨). 종목은 배경 설명에 꼭 필요할 때만 언급하세요.
4. 매수·매도 등 투자 권유는 하지 말고 사실과 해석만 담으세요.
5. 마지막 문장: "오늘 어떤 판단/감정이 있었나요?"처럼 기록을 유도하는 한 문장을 덧붙이세요.
6. 마크다운·머리말 없이 순수 문장만 출력하세요.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

export async function GET(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const date = getTodayKST();
        const docRef = adminDb.collection('users').doc(uid).collection('journals').doc(date);
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get('refresh') === '1';

        // 재사용 조건:
        // - 종가 확정(finalized)본은 리프레시를 눌러도 재생성하지 않음(확정된 사실)
        // - 잠정치는 일반 조회 30분 캐시, 강제 리프레시라도 최소 60초 간격(연타 방지)
        const snap = await docRef.get();
        const cached = snap.exists ? snap.data().aiContext : null;
        if (cached) {
            const age = cached.generatedAt ? Date.now() - new Date(cached.generatedAt).getTime() : Infinity;
            const minInterval = forceRefresh ? 60 * 1000 : 30 * 60 * 1000;
            if (cached.finalized || age < minInterval) {
                return NextResponse.json({ id: date, ...snap.data() });
            }
        }

        // 자산 조회 → 뉴스 대상 종목 선별(주식·코인, 평가액 상위 6개)
        const authHeader = request.headers.get('Authorization');
        const assets = await fetchUserAssets(authHeader);
        const yf = new YahooFinance();

        const tradable = assets
            .filter((a) => (a.type === 'stock' || a.type === 'crypto') && a.symbol)
            .sort((x, y) => (y.totalValue || 0) - (x.totalValue || 0))
            .slice(0, 6);

        const regions = new Set(tradable.map((a) => a.region || 'KR'));
        const [indices, holdings, marketNews] = await Promise.all([
            fetchIndices(yf, regions),
            Promise.all(tradable.map((a) => fetchHoldingContext(yf, a))),
            fetchMarketNews(yf, regions),
        ]);

        const marketSummary = await generateMarketSummary({ date, indices, holdings, marketNews });

        const aiContext = {
            marketSummary,
            indices,
            holdings,
            finalized: computeFinalized(indices, holdings), // 종가 확정 여부
            generatedAt: new Date().toISOString(),
        };

        // 기존 userNote는 보존하고 aiContext만 병합 저장
        await docRef.set({ date, aiContext }, { merge: true });

        const merged = snap.exists ? { ...snap.data(), aiContext } : { date, aiContext };
        return NextResponse.json({ id: date, ...merged });
    } catch (error) {
        console.error('Journal Today API Error:', error);
        return NextResponse.json({ error: '오늘의 시황을 불러오지 못했습니다.' }, { status: 500 });
    }
}
