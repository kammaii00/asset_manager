'use client';

import { useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, ChevronDown, ExternalLink, CalendarClock } from 'lucide-react';

// VIX 구간별 배지 색상 (안정 → 공포 순으로 초록·회색·주황·빨강)
const SENTIMENT_STYLES = {
    calm: { emoji: '🟢', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    neutral: { emoji: '⚪', className: 'bg-slate-50 border-slate-200 text-slate-600' },
    caution: { emoji: '🟠', className: 'bg-amber-50 border-amber-200 text-amber-700' },
    fear: { emoji: '🔴', className: 'bg-red-50 border-red-200 text-red-700' },
};

// 'YYYY-MM-DD' → 'M월 D일' (구버전 문서처럼 값이 없으면 빈 문자열)
function formatShortDate(date) {
    const [, month, day] = String(date || '').split('-');
    return month && day ? `${Number(month)}월 ${Number(day)}일` : '';
}

// 지수·환율 값 표기 (천 단위 구분 + 소수 2자리)
function formatIndexPrice(price) {
    if (price == null) return '';
    return price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 등락률 배지 (국내 관행: 상승 빨강 / 하락 파랑)
export function ChangeBadge({ value }) {
    if (value == null) return <span className="text-slate-400 text-xs">-</span>;
    const up = value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-red-500' : 'text-blue-500'}`}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {up ? '+' : ''}{value}%
        </span>
    );
}

// VIX 실측값 기반 시장 온도 배지
function SentimentBadge({ sentiment }) {
    const style = SENTIMENT_STYLES[sentiment.level] || SENTIMENT_STYLES.neutral;
    return (
        <span
            className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-bold ${style.className}`}
            title={`변동성지수(VIX) ${sentiment.vix} — 15 미만이면 안정, 20을 넘으면 경계, 30을 넘으면 공포 국면으로 봅니다.`}
        >
            {style.emoji} {sentiment.label}
            <span className="font-medium opacity-60">VIX {sentiment.vix}</span>
        </span>
    );
}

// 국내/해외 뉴스 목록 (사실 = title, 해석 = detail)
function NewsList({ title, items }) {
    if (!items?.length) return null;
    return (
        <div className="mt-3">
            <h4 className="text-xs font-bold text-slate-500 mb-1.5">{title}</h4>
            <ul className="flex flex-col gap-2">
                {items.map((item, i) => (
                    <li key={i} className="flex gap-1.5">
                        <span className="text-indigo-300 shrink-0 text-[13px] leading-relaxed">•</span>
                        <div>
                            <p className="text-[13px] font-semibold text-slate-700 leading-relaxed">{item.title}</p>
                            {item.detail && <p className="text-[13px] text-slate-500 leading-relaxed">{item.detail}</p>}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// 다가오는 일정 (검색으로 확인된 것만 담기므로 비어 있을 수 있음)
function WatchList({ items }) {
    if (!items?.length) return null;
    return (
        <div className="mt-3">
            <h4 className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1.5">
                <CalendarClock size={12} /> 다가오는 일정
            </h4>
            <div className="flex flex-wrap gap-1.5">
                {items.map((item, i) => (
                    <span key={i} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">{item}</span>
                ))}
            </div>
        </div>
    );
}

// 날짜별 공용 시황 블록 (한 줄 제목 + 시장 온도 + 지수 + 요약 + 접히는 상세)
export default function JournalBriefing({ briefing }) {
    const [open, setOpen] = useState(false);
    const hasDetail = briefing.domestic?.length > 0 || briefing.overseas?.length > 0 || briefing.watch?.length > 0;
    // 07시 브리핑의 지수·뉴스는 직전 거래일 것이므로, 오늘 장 결과로 오해하지 않도록 기준일을 함께 적는다
    const marketDateLabel = formatShortDate(briefing.marketDate);

    return (
        <div className="bg-gradient-to-br from-indigo-50/70 to-white border border-indigo-100 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-x-1.5 text-indigo-600 font-bold text-sm mb-2">
                <Sparkles size={15} />
                아침 시황
                {marketDateLabel && (
                    <span className="font-medium text-slate-400 text-xs">· {marketDateLabel} 종가 기준</span>
                )}
            </div>

            {briefing.headline && (
                <h3 className="text-slate-900 font-bold text-[15px] leading-snug mb-2.5">{briefing.headline}</h3>
            )}

            {(briefing.sentiment || briefing.indices?.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    {briefing.sentiment && <SentimentBadge sentiment={briefing.sentiment} />}
                    {briefing.indices?.map((idx) => (
                        <span
                            key={idx.name}
                            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-2.5 py-1"
                            title={marketDateLabel ? `${marketDateLabel} 종가 기준 등락률` : '직전 거래일 종가 기준 등락률'}
                        >
                            <span className="text-slate-500 text-xs">{idx.name}</span>
                            {idx.price != null && (
                                <span className="text-slate-700 text-xs font-semibold tabular-nums">{formatIndexPrice(idx.price)}</span>
                            )}
                            <ChangeBadge value={idx.changePercent} />
                        </span>
                    ))}
                </div>
            )}

            <p className="text-slate-700 text-[14px] leading-relaxed whitespace-pre-line">{briefing.summary}</p>

            {hasDetail && (
                <>
                    {open && (
                        <>
                            <NewsList title="🇰🇷 국내" items={briefing.domestic} />
                            <NewsList title="🌎 해외" items={briefing.overseas} />
                            <WatchList items={briefing.watch} />
                            {briefing.sources?.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-indigo-100">
                                    <h4 className="text-xs font-bold text-slate-400 mb-1.5">출처</h4>
                                    <div className="flex flex-col gap-1">
                                        {briefing.sources.map((s, i) => (
                                            <a
                                                key={i}
                                                href={s.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                                            >
                                                <ExternalLink size={11} className="shrink-0" />
                                                <span className="truncate">{s.title}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <button
                        onClick={() => setOpen(!open)}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                    >
                        {open ? '접기' : '주요 뉴스 자세히 보기'}
                        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                </>
            )}
        </div>
    );
}
