'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useAssetStore from '@/store/useAssetStore';
import { AppHeader, MobileTabBar, MAIN_BOTTOM_PADDING } from '@/components/AppNav';
import AnalysisReport from '@/components/AnalysisReport';
import FnGuidePanel, { fnGuideUrl } from '@/components/FnGuidePanel';
import { LineChart, Search, Loader2, TrendingUp, RotateCcw, Clock, SquareSplitHorizontal, ExternalLink, Trash2 } from 'lucide-react';

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
    const [compare, setCompare] = useState(false); // FnGuide 좌우 비교 (lg 이상에서만 노출)

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

    // 분석 기록 삭제 — 내 목록에서만 지우고 리포트 원본은 남긴다(같은 종목 재분석 시 재사용)
    const deleteHistory = async (item) => {
        if (!window.confirm(`'${item.stockName}' 분석 기록을 삭제할까요?`)) return;
        try {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/analysis/${item.id}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error((await res.json()).error || '삭제하지 못했습니다.');
            setHistory((prev) => prev.filter((h) => h.id !== item.id));
            if (job?.id === item.id) setJob(null);
        } catch (e) {
            // 목록은 화면 맨 아래에 있어 상단 오류 문구가 눈에 띄지 않는다. 실패는 바로 알려준다.
            window.alert(e.message);
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
                <main className={`max-w-3xl mx-auto px-4 py-16 text-center ${MAIN_BOTTOM_PADDING}`}>
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
            <main className={`max-w-3xl mx-auto px-4 py-6 ${MAIN_BOTTOM_PADDING}`}>
                <div className="flex items-center gap-2 mb-1">
                    <LineChart size={22} className="text-[#0d7ff2]" />
                    <h1 className="text-xl font-bold text-slate-900">기업분석</h1>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                    재무제표·시세·수급·뉴스를 모아 5개 축으로 평가합니다. 분석에 1~2분이 걸립니다.
                </p>

                {/* 검색 — 아이콘을 absolute로 겹쳐 놓으면 브라우저가 입력창 안에 자동완성 아이콘을
                    끼워 넣을 때 글자와 부딪히므로, flex로 자리를 나눠 겹칠 수 없게 만든다 */}
                <div className="flex items-center gap-2.5 w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-[#0d7ff2]/30 focus-within:border-[#0d7ff2]">
                    <Search size={18} className="shrink-0 text-slate-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="종목명 또는 종목코드 (예: 삼성전자, 005930)"
                        // type="search" + 자동완성 차단 — 이름 없는 text 입력이라 맥 사파리/크롬이
                        // 로그인 폼으로 오인해 암호 자동완성을 띄우던 문제를 막는다.
                        // (data-* 속성은 1Password·LastPass 등 확장 프로그램용)
                        type="search"
                        name="stockQuery"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="search"
                        enterKeyHint="search"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                        // 사파리가 검색창에 자체 돋보기·지우기 버튼을 그리면 우리 아이콘과 중복되므로 없앤다
                        className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none appearance-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                    />
                    {searching && <Loader2 size={18} className="shrink-0 text-slate-400 animate-spin" />}
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

                {/* 리포트 — 비교 모드에서는 max-w-3xl 밖으로 넓혀 좌우 2단으로 편다 */}
                {job?.status === 'done' && job.report && (
                    <div className={compare ? 'mt-5 relative left-1/2 -translate-x-1/2 w-[min(1800px,100vw-2rem)]' : 'mt-5'}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <span className="text-xs text-slate-400 shrink-0">분석 비용 ${job.costUsd}</span>
                            <div className="flex items-center gap-4">
                                {/* 좁은 화면에서 좌우 비교는 의미가 없어 링크만 제공한다 */}
                                <a
                                    href={fnGuideUrl(job.report.ticker)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="lg:hidden flex items-center gap-1 text-xs text-slate-500 hover:text-[#0d7ff2]"
                                >
                                    <ExternalLink size={13} /> FnGuide
                                </a>
                                <button
                                    onClick={() => setCompare((v) => !v)}
                                    className={`hidden lg:flex items-center gap-1 text-xs transition-colors ${compare ? 'text-[#0d7ff2] font-semibold' : 'text-slate-500 hover:text-[#0d7ff2]'}`}
                                >
                                    <SquareSplitHorizontal size={13} /> FnGuide 비교
                                </button>
                                <button onClick={() => { setJob(null); setSelected(null); }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#0d7ff2]">
                                    <RotateCcw size={13} /> 다른 종목 분석
                                </button>
                            </div>
                        </div>

                        {compare ? (
                            <div className="grid lg:grid-cols-2 gap-4 items-start">
                                <AnalysisReport report={job.report} />
                                {/* 리포트를 스크롤해도 따라오도록 고정 (헤더 높이만큼 내려서 시작) */}
                                <div className="hidden lg:block lg:sticky lg:top-24 h-[calc(100vh-8rem)]">
                                    <FnGuidePanel ticker={job.report.ticker} stockName={job.report.stockName} />
                                </div>
                            </div>
                        ) : (
                            <AnalysisReport report={job.report} />
                        )}
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
                            {/* 행 전체가 버튼이면 삭제 버튼을 안에 넣을 수 없어(버튼 중첩) 영역을 나눈다 */}
                            {history.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-1 pl-4 pr-2 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                                >
                                    <button
                                        onClick={() => openHistory(item.id)}
                                        disabled={item.status !== 'done'}
                                        className="flex-1 flex items-center justify-between gap-2 min-w-0 py-3 text-left disabled:opacity-50"
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
                                    <button
                                        onClick={() => deleteHistory(item)}
                                        aria-label={`${item.stockName} 분석 기록 삭제`}
                                        title="삭제"
                                        className="shrink-0 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
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
