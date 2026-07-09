import { ArrowLeft } from 'lucide-react';
import { CartesianGrid, Cell, ComposedChart, Legend, Line, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function ChartsSection({
    drillDownCategory, setDrillDownCategory,
    displayAllocation, allocationTitle, drillDownTotal,
    includeMap, toggleInclude,
    ASSET_META, ASSET_COLORS, DRILLDOWN_COLORS, SUMMARY_KEYS,
    summary, enabledAssetTypes,
    includedTotalAssets,
    chartHistory, HISTORY_KEYS,
    handleLegendClick,
    formatCurrency,
}) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 비중 확인 도넛 차트 */}
            <div className="rounded-xl bg-white border border-slate-200 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        {drillDownCategory && (
                            <button onClick={() => setDrillDownCategory(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <h3 className="text-lg font-bold text-slate-900">{allocationTitle}</h3>
                    </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center relative min-h-[250px]">
                    {displayAllocation.length > 0 ? (
                        <>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-sm font-medium text-slate-500">총합계</span>
                                <span className="text-xl font-bold text-slate-900 z-0">
                                    {formatCurrency(drillDownCategory ? drillDownTotal : includedTotalAssets)}
                                </span>
                            </div>
                            <ResponsiveContainer width="100%" height={250} className="relative z-10">
                                <PieChart>
                                    <Pie
                                        data={displayAllocation}
                                        cx="50%" cy="50%"
                                        innerRadius={85} outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="value"
                                        onClick={(data) => {
                                            if (!drillDownCategory && (data.name === '주식' || data.name === '연금' || data.name === '현금')) {
                                                setDrillDownCategory(data.name);
                                            }
                                        }}
                                        className={!drillDownCategory ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                                    >
                                        {displayAllocation.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={drillDownCategory ? DRILLDOWN_COLORS[entry.name] : ASSET_COLORS[entry.name]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value)}
                                        contentStyle={{ backgroundColor: '#ffffff', opacity: 1, borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">자산 데이터가 없습니다.</div>
                    )}
                </div>

                {/* 범례 */}
                <div className="flex justify-between items-center mt-8 mb-3 px-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">자산 유형별 비중</span>
                    {!drillDownCategory && (
                        <span className="text-[10px] text-blue-500 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                            클릭하여 데이터 포함/제외
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {!drillDownCategory ? (
                        [...(enabledAssetTypes || [])]
                            .sort((a, b) => (summary[SUMMARY_KEYS[b]?.total] || 0) - (summary[SUMMARY_KEYS[a]?.total] || 0))
                            .map((typeId) => {
                                const meta = ASSET_META[typeId];
                                if (!meta) return null;
                                const value = summary[SUMMARY_KEYS[typeId]?.total] || 0;
                                if (value <= 0) return null;
                                const isIncluded = includeMap[typeId];
                                return (
                                    <div
                                        key={typeId}
                                        className={`flex items-center gap-3 cursor-pointer p-2.5 rounded-xl transition-all border ${isIncluded ? 'bg-white border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md' : 'bg-slate-50 border-transparent opacity-50 grayscale-[0.8] hover:opacity-70'}`}
                                        onClick={() => toggleInclude(typeId)}
                                    >
                                        <div className="relative flex-shrink-0">
                                            <span className="w-4 h-4 rounded-full block border border-white shadow-sm" style={{ backgroundColor: ASSET_COLORS[meta.label] }} />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className={`text-xs font-medium truncate ${isIncluded ? 'text-slate-600' : 'text-slate-400'}`}>{meta.label}</span>
                                            {isIncluded && (
                                                <span className="text-sm font-bold text-slate-900">
                                                    {includedTotalAssets > 0 ? ((value / includedTotalAssets) * 100).toFixed(1) : 0}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                    ) : (
                        displayAllocation.map((item) => (
                            <div key={item.name} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: DRILLDOWN_COLORS[item.name] }} />
                                <div className="flex flex-col">
                                    <span className="text-xs text-slate-500">{item.name}</span>
                                    <span className="text-sm font-bold text-slate-900">
                                        {drillDownTotal > 0 ? ((item.value / drillDownTotal) * 100).toFixed(1) : 0}%
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 자산 변동 추이 차트 */}
            <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-900">자산 변동 추이</h3>
                </div>
                <div className="w-full flex-1 flex items-center mt-4 relative">
                    <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={chartHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="displayLabel" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} minTickGap={20} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={45} tickFormatter={(v) => v === 0 ? '0' : `${parseFloat((v / 100000000).toFixed(1))}억`} />
                            <Tooltip
                                formatter={(value, name) => [formatCurrency(value), name === 'includedTotal' ? '선택 자산 합계' : name]}
                                labelFormatter={(label) => `시점: ${label}`}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend
                                iconType="circle"
                                onClick={handleLegendClick}
                                wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }}
                                payload={[
                                    ...((enabledAssetTypes || []).map(typeId => {
                                        const meta = ASSET_META[typeId];
                                        const isIncluded = includeMap[typeId];
                                        return meta ? { value: meta.label, type: 'circle', id: HISTORY_KEYS[typeId], color: isIncluded ? meta.color : '#cbd5e1', inactive: !isIncluded } : null;
                                    }).filter(Boolean)),
                                    { value: '합계(Line)', type: 'line', id: 'includedTotal', color: '#0f172a' }
                                ]}
                            />
                            {(enabledAssetTypes || []).map((typeId) => {
                                const meta = ASSET_META[typeId];
                                if (!meta || !includeMap[typeId]) return null;
                                return (
                                    <Line key={typeId} type="monotone" dataKey={HISTORY_KEYS[typeId]} name={meta.label} stroke={meta.color} strokeWidth={2} dot={{ r: 2, fill: meta.color }} activeDot={{ r: 4 }} />
                                );
                            })}
                            <Line type="monotone" dataKey="includedTotal" stroke="#0f172a" strokeWidth={2} dot={{ r: 2, fill: '#0f172a' }} activeDot={{ r: 4 }} name="전체" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
