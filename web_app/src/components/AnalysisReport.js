'use client';

import { AlertTriangle, TrendingUp, TrendingDown, Eye, ShieldCheck, ShieldAlert, CalendarClock } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

// 정량 지표 설명 — 주식을 처음 보는 사람도 이해할 수 있게 "무엇을 뜻하는지 + 어느 정도면 괜찮은지"까지 적는다
const METRIC_HELP = {
    ROE: '자기자본이익률. 주주 돈 100원으로 1년에 얼마를 벌었는지를 나타냅니다. 통상 10% 이상이면 양호합니다.',
    영업이익률: '매출 100원 중 본업으로 남긴 이익의 비율. 사업 자체의 수익성을 봅니다.',
    순이익률: '매출 100원 중 이자·세금까지 모두 빼고 최종적으로 남은 이익의 비율입니다.',
    '매출 3년 CAGR': '최근 3년간 매출이 해마다 평균 몇 %씩 늘었는지(연평균 성장률)를 뜻합니다.',
    부채비율: '자기자본 대비 빚의 비율. 100% 미만이면 안정적, 200%를 넘으면 부담이 큰 편입니다.',
    유동비율: '1년 안에 갚아야 할 빚 대비 1년 안에 현금화할 수 있는 자산의 비율. 100% 미만이면 단기 자금 압박 신호입니다.',
    이자보상배율: '영업이익으로 이자를 몇 번 낼 수 있는지. 1배 미만이면 벌어서 이자도 못 내는 상태입니다.',
    PER: '주가 ÷ 주당순이익. 지금 이익 수준으로 투자금을 회수하는 데 몇 년이 걸리는지를 뜻합니다. 같은 업종끼리 비교해야 의미가 있습니다.',
    PBR: '주가 ÷ 주당순자산. 1배면 회사의 장부상 가치만큼 값이 매겨진 상태입니다.',
    현금전환율: '영업현금흐름 ÷ 순이익. 장부상 이익이 실제 현금으로 얼마나 들어왔는지 봅니다. 1배 미만이 이어지면 이익의 질이 나쁘다는 신호입니다.',
    FCF: '잉여현금흐름. 영업으로 번 현금에서 설비투자를 빼고 남은 돈으로, 배당·자사주·빚 상환에 쓸 수 있는 여윳돈입니다.',
    '자체 PER 밴드': '과거 PER 범위에서 현재 PER의 위치. 0%에 가까우면 역사적으로 싼 편, 100%에 가까우면 비싼 편입니다.',
};

const AXIS_LABELS = {
    quality: '수익성',
    value: '밸류에이션',
    growth: '성장성',
    safety: '재무안정성',
    sentiment: '수급·심리',
};

const GRADE_STYLE = {
    '매우 우수': 'bg-emerald-500',
    우수: 'bg-blue-500',
    보통: 'bg-slate-400',
    주의: 'bg-amber-500',
    위험: 'bg-red-500',
};

const SEVERITY_STYLE = {
    critical: 'bg-red-50 border-red-200 text-red-700',
    high: 'bg-amber-50 border-amber-200 text-amber-700',
};

// 점수 막대 — 0~100을 너비로 표현한다
function ScoreBar({ label, score, comment }) {
    const color = score >= 70 ? 'bg-blue-500' : score >= 50 ? 'bg-slate-400' : 'bg-amber-500';
    return (
        <div className="py-2.5 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-700">{label}</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">{score}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            </div>
            {comment && <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{comment}</p>}
        </div>
    );
}

function Section({ title, icon: Icon, children }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
                {Icon && <Icon size={16} className="text-slate-400" />}
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            </div>
            {children}
        </div>
    );
}

const 억 = (v) => (v === null || v === undefined ? '—' : `${Math.round(v / 1e8).toLocaleString()}억`);
const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`);

// 분석 시점 표기 — createdAt(정확한 시각)을 우선 쓰고, 없으면 리포트 날짜(문서 ID)로 대체한다
function formatAnalyzedAt(report) {
    if (report.createdAt) {
        const d = new Date(report.createdAt);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
        }
    }
    return report.reportDate || null;
}

export default function AnalysisReport({ report }) {
    if (!report) return null;

    const { scores, axisComments, thesis, metrics, flows, verification, redFlags = [] } = report;
    const analyzedAt = formatAnalyzedAt(report);

    return (
        <div className="space-y-4">
            {/* 종합 점수 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500">{report.stockName} · {report.ticker}</p>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-4xl font-bold text-slate-900 tabular-nums">{scores.total}</span>
                            <span className="text-sm text-slate-400">/ 100</span>
                        </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-white text-sm font-bold ${GRADE_STYLE[scores.grade] ?? 'bg-slate-400'}`}>
                        {scores.grade}
                    </span>
                </div>
                {/* 리포트는 종목·날짜별로 보관돼 과거 것을 다시 열 수 있으므로 분석 시점을 명확히 밝힌다 */}
                {analyzedAt && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <CalendarClock size={13} className="shrink-0 text-slate-400" />
                        {analyzedAt} 분석
                    </p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                    확신도 {thesis.confidence} · {report.market} · {report.sector} · 분석 시점 주가 {report.priceAtAnalysis?.toLocaleString()}원
                </p>
            </div>

            {/* Red Flag — 점수와 무관하게 최상단 경고 */}
            {redFlags.length > 0 && (
                <div className="space-y-2">
                    {redFlags.map((flag, i) => (
                        <div key={i} className={`flex gap-2 items-start border rounded-xl p-3.5 ${SEVERITY_STYLE[flag.severity] ?? SEVERITY_STYLE.high}`}>
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            <span className="text-sm font-medium">{flag.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* 총평 */}
            <Section title="총평">
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{thesis.summary}</p>
            </Section>

            {/* 5축 점수 */}
            <Section title="세부 점수">
                {Object.entries(AXIS_LABELS).map(([key, label]) => (
                    <ScoreBar key={key} label={label} score={scores.axes[key]} comment={axisComments?.[key]} />
                ))}
            </Section>

            {/* Bull / Bear */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Section title="긍정 논거" icon={TrendingUp}>
                    <ul className="space-y-2">
                        {thesis.bull.map((item, i) => (
                            <li key={i} className="text-sm text-slate-600 leading-relaxed flex gap-2">
                                <span className="text-blue-500 shrink-0">·</span>{item}
                            </li>
                        ))}
                    </ul>
                </Section>
                <Section title="부정 논거" icon={TrendingDown}>
                    <ul className="space-y-2">
                        {thesis.bear.map((item, i) => (
                            <li key={i} className="text-sm text-slate-600 leading-relaxed flex gap-2">
                                <span className="text-amber-500 shrink-0">·</span>{item}
                            </li>
                        ))}
                    </ul>
                </Section>
            </div>

            {/* 모니터링 지표 */}
            <Section title="앞으로 지켜볼 것" icon={Eye}>
                <ul className="space-y-2">
                    {thesis.monitoringPoints.map((item, i) => (
                        <li key={i} className="text-sm text-slate-600 leading-relaxed flex gap-2">
                            <span className="text-slate-400 shrink-0">{i + 1}.</span>{item}
                        </li>
                    ))}
                </ul>
            </Section>

            {/* 정량 지표 — 초기 버전 리포트에는 metrics가 없어 방어한다 */}
            {metrics && (
            <Section title="정량 지표 (코드 계산값)">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                    {[
                        ['ROE', pctText(metrics.profitability.roe)],
                        ['영업이익률', pctText(metrics.profitability.operatingMargin)],
                        ['순이익률', pctText(metrics.profitability.netMargin)],
                        ['매출 3년 CAGR', pctText(metrics.growth.revenueCagr3y)],
                        ['부채비율', pctText(metrics.stability.debtRatio)],
                        ['유동비율', pctText(metrics.stability.currentRatio)],
                        ['이자보상배율', metrics.stability.interestCoverage ? `${metrics.stability.interestCoverage}배` : '—'],
                        ['PER', metrics.valuation.per ?? '—'],
                        ['PBR', metrics.valuation.pbr ?? '—'],
                        ['현금전환율', metrics.cashQuality.cashConversion ? `${metrics.cashQuality.cashConversion}배` : '—'],
                        ['FCF', 억(metrics.cashQuality.freeCashFlow)],
                        ['자체 PER 밴드', metrics.valuationBand ? `${metrics.valuationBand.percentile}%` : '—'],
                    ].map(([label, value]) => (
                        <div key={label}>
                            <p className="flex items-center gap-1 text-xs text-slate-400">
                                {label}
                                {METRIC_HELP[label] && <InfoTooltip text={METRIC_HELP[label]} label={`${label} 설명`} />}
                            </p>
                            <p className="font-semibold text-slate-800 tabular-nums">{value}</p>
                        </div>
                    ))}
                </div>
                {metrics.valuation.crossCheck?.diverged && (
                    <p className="mt-3 text-xs text-amber-600">
                        ⚠️ 거래소 제공 PER({metrics.valuation.crossCheck.kisPer})과 {metrics.valuation.crossCheck.perGapPct}% 차이가 있습니다.
                        우선주 상장 등 특수 요인일 수 있습니다.
                    </p>
                )}
            </Section>
            )}

            {/* 수급 */}
            {flows && (
                <Section title={`투자자별 수급 (최근 ${flows.days}거래일)`}>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        {[
                            ['외국인', flows.foreign],
                            ['기관', flows.institution],
                            ['개인', flows.individual],
                        ].map(([label, f]) => (
                            <div key={label}>
                                <p className="text-xs text-slate-400">{label}</p>
                                <p className={`font-semibold tabular-nums ${f.netQty >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                    {f.netQty >= 0 ? '+' : ''}{Math.round(f.netAmountKrw / 1e8).toLocaleString()}억
                                </p>
                                <p className="text-xs text-slate-400">매수우위 {f.buyDays}/{flows.days}일</p>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* 검증 결과 */}
            <div className={`flex gap-2 items-start border rounded-xl p-3.5 ${verification?.passed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                {verification?.passed ? <ShieldCheck size={16} className="shrink-0 mt-0.5" /> : <ShieldAlert size={16} className="shrink-0 mt-0.5" />}
                <div className="text-sm">
                    <p className="font-medium">
                        {verification?.passed ? '수치 검증 통과 — 리포트의 숫자가 원본 데이터와 일치합니다' : `수치 검증에서 ${verification?.issues?.length ?? 0}건이 확인됐습니다`}
                    </p>
                    {!verification?.passed && verification?.issues?.length > 0 && (
                        <ul className="mt-1.5 space-y-1 text-xs">
                            {verification.issues.map((issue, i) => (
                                <li key={i}>· {issue.claim} — {issue.detail}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed px-1">{report.disclaimer}</p>
        </div>
    );
}
