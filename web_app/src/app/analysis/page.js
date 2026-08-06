'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useAssetStore from '@/store/useAssetStore';
import { AppHeader, MobileTabBar } from '@/components/AppNav';
import AnalysisReport from '@/components/AnalysisReport';
import { LineChart, Search, Loader2, TrendingUp, RotateCcw, Clock } from 'lucide-react';

const MARKET_STYLE = {
    KOSPI: 'bg-blue-50 text-blue-600',
    KOSDAQ: 'bg-emerald-50 text-emerald-600',
    KONEX: 'bg-amber-50 text-amber-600',
};

const GRADE_COLOR = {
    '매우 우수': 'text-emerald-600',
    우수: 'text-blue-600',
    보통: 'text-slate-500',
    주의: 'text-amber-600',
    위험: 'text-red-600',
};

function StockRow({ stock, onSelect }) {
    return (
        <button
            onClick={() => onSelect(stock)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
        >
            <div className="flex items-center gap-3 min-w-0">
                <span className="font-semibold text-slate-900 truncate">{stock.name}</span>
                <span className="text-xs text-slate-400 font-mono shrink-0">{stock.ticker}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {stock.sector && <span className="text-xs text-slate-400 hidden sm:inline">{stock.sector}</span>}
                {stock.market && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${MARKET_STYLE[stock.market] || 'bg-slate-100 text-slate-500'}`}>
                        {stock.market}
                    </span>
                )}
            </div>
        </button>
    );
}

export default function AnalysisPage() {
    const { isLoggedIn, login, getAuthHeaders } = useAssetStore();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState(null);

    const [job, setJob] = useState(null); // { id, status, progress, report, ... }
    const [requesting, setRequesting] = useState(false);
    const [history, setHistory] = useState([]);

    const searchTimer = useRef(null);
    const pollTimer = useRef(null);

    // 최근 분석 목록
    const loadHistory = useCallback(async () => {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/analysis?limit=10', { headers });
            if (res.ok) setHistory(await res.json());
        } catch {
            // 목록 실패는 화면 전체를 막을 이유가 없다
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        if (isLoggedIn) loadHistory();
    }, [isLoggedIn, loadHistory]);

    // 종목 검색 (250ms 디바운스)
    useEffect(() => {
        if (!isLoggedIn) return;
        const keyword = query.trim();
        if (!keyword) {
            setResults([]);
            return;
        }

        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            setError(null);
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(keyword)}`, { headers });
                if (!res.ok) throw new Error('검색에 실패했습니다.');
                setResults(await res.json());
            } catch (e) {
                setError(e.message);
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 250);

        return () => clearTimeout(searchTimer.current);
    }, [query, isLoggedIn, getAuthHeaders]);

    /**
     * 진행 상황 폴링.
     * 이 앱은 firebase/firestore/lite를 쓰는데 lite는 onSnapshot(실시간 구독)을 지원하지 않는다.
     * 공용 SDK를 교체하는 대신 2.5초 간격 폴링으로 처리한다.
     */
    const pollJob = useCallback(
        async (requestId) => {
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/analysis/${requestId}`, { headers });
                if (!res.ok) throw new Error('진행 상황을 불러오지 못했습니다.');
                const data = await res.json();
                setJob(data);

                if (data.status === 'done' || data.status === 'failed') {
                    clearInterval(pollTimer.current);
                    loadHistory();
                }
            } catch (e) {
                setError(e.message);
                clearInterval(pollTimer.current);
            }
        },
        [getAuthHeaders, loadHistory],
    );

    useEffect(() => () => clearInterval(pollTimer.current), []);

    const requestAnalysis = async (ticker) => {
        setRequesting(true);
        setError(null);
        setJob(null);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/analysis', { method: 'POST', headers, body: JSON.stringify({ ticker }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '분석 요청에 실패했습니다.');

            setJob({ id: data.requestId, status: 'queued', progress: { message: '대기 중', pct: 0 } });
            clearInterval(pollTimer.current);
            pollTimer.current = setInterval(() => pollJob(data.requestId), 2500);
            pollJob(data.requestId);
        } catch (e) {
            setError(e.message);
        } finally {
            setRequesting(false);
        }
    };

    // 과거 분석 리포트 열기
    const openHistory = async (requestId) => {
        setSelected(null);
        setResults([]);
        setQuery('');
        setJob({ id: requestId, status: 'running', progress: { message: '리포트 불러오는 중', pct: 100 } });
        await pollJob(requestId);
    };

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-50">
                <AppHeader />
                <main className="max-w-3xl mx-auto px-4 py-16 text-center pb-24 md:pb-8">
                    <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-blue-50 text-[#0d7ff2]">
                        <LineChart size={28} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">기업분석은 로그인이 필요합니다</h1>
                    <p className="mt-2 text-sm text-slate-500">분석 요청과 리포트가 계정에 저장됩니다.</p>
                    <button onClick={login} className="mt-6 px-5 py-2.5 rounded-xl bg-[#0d7ff2] text-white font-semibold text-sm hover:bg-blue-600 transition-colors">
                        Google로 로그인
                    </button>
                </main>
                <MobileTabBar />
            </div>
        );
    }

    const running = job && (job.status === 'queued' || job.status === 'running');

    return (
        <div className="min-h-screen bg-slate-50">
            <AppHeader />
            <main className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-8">
                <div className="flex items-center gap-2 mb-1">
                    <LineChart size={22} className="text-[#0d7ff2]" />
                    <h1 className="text-xl font-bold text-slate-900">기업분석</h1>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    재무제표·시세·수급·뉴스를 모아 5개 축으로 평가합니다. 분석에 1~2분이 걸립니다.
                </p>

                {/* 검색 */}
                <div className="relative">
                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="종목명 또는 종목코드 (예: 삼성전자, 005930)"
                        className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d7ff2]/30 focus:border-[#0d7ff2]"
                    />
                    {searching && <Loader2 size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
                </div>

                {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

                {results.length > 0 && (
                    <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
                        {results.map((stock) => (
                            <StockRow key={stock.ticker} stock={stock} onSelect={(s) => { setSelected(s); setResults([]); setQuery(''); }} />
                        ))}
                    </div>
                )}

                {/* 선택한 종목 → 분석 요청 */}
                {selected && !job && (
                    <div className="mt-5 bg-white border border-slate-200 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-1">
                            <TrendingUp size={18} className="text-[#0d7ff2]" />
                            <span className="font-bold text-slate-900">{selected.name}</span>
                            <span className="text-xs text-slate-400 font-mono">{selected.ticker}</span>
                        </div>
                        <p className="text-sm text-slate-500">
                            {selected.market || '시장 정보 미확인'}{selected.sector ? ` · ${selected.sector}` : ''}
                        </p>
                        <button
                            onClick={() => requestAnalysis(selected.ticker)}
                            disabled={requesting}
                            className="mt-4 w-full py-3 rounded-xl bg-[#0d7ff2] text-white font-semibold text-sm hover:bg-blue-600 disabled:bg-slate-300 transition-colors"
                        >
                            {requesting ? '요청 중…' : '분석 요청'}
                        </button>
                    </div>
                )}

                {/* 진행률 */}
                {running && (
                    <div className="mt-5 bg-white border border-slate-200 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Loader2 size={16} className="text-[#0d7ff2] animate-spin" />
                            <span className="text-sm font-semibold text-slate-700">{job.progress?.message ?? '준비 중'}</span>
                            <span className="ml-auto text-sm text-slate-400 tabular-nums">{job.progress?.pct ?? 0}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#0d7ff2] rounded-full transition-all duration-500" style={{ width: `${job.progress?.pct ?? 0}%` }} />
                        </div>
                        <p className="mt-3 text-xs text-slate-400">
                            재무제표·시세·수급·뉴스를 모으고 AI가 해석한 뒤 수치를 검증합니다. 화면을 벗어나도 분석은 계속됩니다.
                        </p>
                    </div>
                )}

                {job?.status === 'failed' && (
                    <div className="mt-5 bg-red-50 border border-red-200 rounded-xl p-5">
                        <p className="text-sm font-semibold text-red-700">분석에 실패했습니다</p>
                        <p className="mt-1 text-sm text-red-600">{job.error}</p>
                        <button onClick={() => setJob(null)} className="mt-3 text-sm text-red-700 font-semibold underline">
                            닫기
                        </button>
                    </div>
                )}

                {/* 리포트 */}
                {job?.status === 'done' && job.report && (
                    <div className="mt-5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-slate-400">분석 비용 ${job.costUsd}</span>
                            <button onClick={() => { setJob(null); setSelected(null); }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#0d7ff2]">
                                <RotateCcw size={13} /> 다른 종목 분석
                            </button>
                        </div>
                        <AnalysisReport report={job.report} />
                    </div>
                )}

                {/* 최근 분석 */}
                {!job && history.length > 0 && (
                    <div className="mt-8">
                        <div className="flex items-center gap-1.5 mb-2 text-slate-500">
                            <Clock size={14} />
                            <h2 className="text-xs font-semibold">최근 분석</h2>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            {history.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => openHistory(item.id)}
                                    disabled={item.status !== 'done'}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors border-b border-slate-100 last:border-0"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-medium text-slate-800 truncate">{item.stockName}</span>
                                        <span className="text-xs text-slate-400 font-mono">{item.ticker}</span>
                                    </div>
                                    {item.status === 'done' ? (
                                        <span className="text-sm shrink-0">
                                            <span className="font-bold text-slate-900 tabular-nums">{item.scoreTotal}</span>
                                            <span className={`ml-1.5 text-xs font-semibold ${GRADE_COLOR[item.grade] ?? 'text-slate-400'}`}>{item.grade}</span>
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-400 shrink-0">
                                            {item.status === 'failed' ? '실패' : '진행 중'}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {!query.trim() && !job && !selected && history.length === 0 && (
                    <div className="mt-10 text-center">
                        <p className="text-sm text-slate-400">종목명을 입력해 검색해 보세요.</p>
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                            {['삼성전자', 'SK하이닉스', '카카오', '에코프로비엠'].map((name) => (
                                <button
                                    key={name}
                                    onClick={() => setQuery(name)}
                                    className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:border-[#0d7ff2] hover:text-[#0d7ff2] transition-colors"
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            <MobileTabBar />
        </div>
    );
}
