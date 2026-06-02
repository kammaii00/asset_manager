import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

export default function SummaryCards({
    sortedEnabledTypes, ASSET_META, SUMMARY_KEYS,
    summary,
    displayTotalAssets, totalLiabilityAmount, grossAssets,
    displayTotalProfit, displayProfitRate,
    targetTotalAmount, achievementRate,
    rebalancingAlerts,
    formatCurrency, formatPercent,
}) {
    return (
        <>
            {/* 순자산 요약 + 자산 유형별 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* 순자산 메인 카드 */}
                <div className="sm:col-span-2 p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden group">
                    <div className="flex-1 flex flex-col gap-1 w-full">
                        <div className="flex justify-between items-center relative z-10">
                            <p className="text-sm font-medium text-slate-500 flex flex-col">
                                <span>순자산 요약 (부채 차감)</span>
                                <span className="text-[11px] opacity-70">Net Assets</span>
                            </p>
                        </div>
                        <div className="flex items-end gap-2 mt-1 relative z-10">
                            <span className="text-3xl font-bold text-slate-900 tracking-tight">{formatCurrency(displayTotalAssets)}</span>
                        </div>
                        {totalLiabilityAmount > 0 && (
                            <div className="flex items-center gap-1 mt-1 relative z-10 text-xs text-slate-400">
                                <span>총자산 {formatCurrency(grossAssets)}</span>
                                <span className="text-red-400 font-bold">- 부채 {formatCurrency(totalLiabilityAmount)}</span>
                            </div>
                        )}
                        <div className={`flex items-center gap-2 mt-2 text-sm font-bold relative z-10 ${displayTotalProfit >= 0 ? 'text-[#ef4444]' : 'text-[#3b82f6]'}`}>
                            {displayTotalProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                            <span>{displayTotalProfit > 0 ? '+' : ''}{formatCurrency(displayTotalProfit)}</span>
                            <span className="opacity-80">({formatPercent(displayProfitRate)})</span>
                        </div>
                    </div>

                    {targetTotalAmount > 0 && (
                        <div className="flex-1 w-full bg-slate-50/50 p-4 rounded-lg border border-slate-100 relative z-10">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">목표 달성 현황</span>
                                <span className="text-sm text-blue-600 font-black">{achievementRate.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                    style={{ width: `${Math.min(achievementRate, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="flex flex-col items-end w-full">
                                    <span className="text-[10px] text-slate-400 font-medium">최종 목표</span>
                                    <span className="text-xs font-bold text-slate-900">{formatCurrency(targetTotalAmount)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 자산 유형별 카드 */}
                {sortedEnabledTypes.map(typeId => {
                    const meta = ASSET_META[typeId];
                    const keys = SUMMARY_KEYS[typeId];
                    if (!meta || !keys) return null;
                    const totalVal = summary[keys.total] || 0;
                    const profitVal = summary[keys.profit] || 0;
                    const rateVal = summary[keys.rate] || 0;

                    return (
                        <div key={typeId} className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col gap-1 relative overflow-hidden group">
                            <div className={`absolute right-[-20px] top-[-20px] w-24 h-24 rounded-full transition-colors z-0 ${meta.bgClass}`} />
                            <div className="flex justify-between items-center relative z-10">
                                <p className="text-sm font-medium text-slate-500 flex flex-col">
                                    <span>{meta.label} 자산</span>
                                    <span className="text-[11px] opacity-70">Total {meta.labelEn}</span>
                                </p>
                            </div>
                            <div className="flex items-end gap-2 mt-1 relative z-10">
                                <span className="text-2xl font-bold text-slate-900 tracking-tight">{formatCurrency(totalVal)}</span>
                            </div>
                            <div className={`flex flex-col mt-2 text-xs font-bold relative z-10 ${profitVal >= 0 ? 'text-[#ef4444]' : 'text-[#3b82f6]'}`}>
                                <div className="flex items-center gap-1">
                                    {profitVal >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                    <span>{profitVal > 0 ? '+' : ''}{formatCurrency(profitVal)}</span>
                                </div>
                                <span className="ml-[20px] opacity-80">({formatPercent(rateVal)})</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 리밸런싱 알림 */}
            {rebalancingAlerts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                            <AlertTriangle size={20} />
                        </div>
                        <h3 className="text-sm font-black text-amber-900">리밸런싱이 필요한 자산이 있습니다</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {rebalancingAlerts.map((alert) => (
                            <div key={alert.type} className="bg-white/60 p-3 rounded-lg border border-amber-100 flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-800 text-sm">{alert.label}</span>
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${alert.diff > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {alert.diff > 0 ? '비중 초과' : '비중 부족'} ({Math.abs(alert.diff).toFixed(1)}%)
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>현재 {alert.actualPct.toFixed(1)}%</span>
                                    <span className="text-slate-300">→</span>
                                    <span className="font-medium">목표 {alert.targetPct}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
