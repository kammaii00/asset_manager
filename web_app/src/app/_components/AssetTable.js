import Link from 'next/link';

export default function AssetTable({
    sortedEnabledTypes, ASSET_META, SUMMARY_KEYS,
    assets, transactions,
    currentExchangeRate,
    summary,
    handleRowClick,
    formatCurrency, formatPercent,
}) {
    return (
        <>
            {sortedEnabledTypes.map(assetType => {
                const filteredAssets = assets
                    .filter(a => a.type === assetType && a.quantity > 0)
                    .sort((a, b) => {
                        const valA = (a.type === 'real_estate' ? (a.netInvestment || 0) + (a.profitGain || 0) : a.totalValue) * (a.region === 'US' ? (currentExchangeRate || 1400) : 1);
                        const valB = (b.type === 'real_estate' ? (b.netInvestment || 0) + (b.profitGain || 0) : b.totalValue) * (b.region === 'US' ? (currentExchangeRate || 1400) : 1);
                        return valB - valA;
                    });
                const meta = ASSET_META[assetType];
                if (!meta) return null;

                if (filteredAssets.length === 0 && !['stock', 'crypto', 'car', sortedEnabledTypes[0]].includes(assetType)) return null;

                // 수익실현 금액 계산 (stock·pension·crypto만)
                let realizedProfit = null;
                if (['stock', 'pension', 'crypto'].includes(assetType)) {
                    const typeTxs = [...(transactions || [])]
                        .filter(t => t.type === assetType)
                        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    const state = {};
                    let total = 0;
                    const rate = currentExchangeRate || 1400;
                    for (const tx of typeTxs) {
                        const id = tx.asset_id;
                        if (!state[id]) state[id] = { qty: 0, costBasis: 0 };
                        const s = state[id];
                        const qty = tx.quantity || 0;
                        const txRate = tx.region === 'US' ? (tx.exchangeRateAtTx || rate) : 1;
                        const priceKRW = (tx.price || 0) * txRate;
                        if (tx.action === 'buy') {
                            s.qty += qty;
                            s.costBasis += qty * priceKRW;
                        } else if (tx.action === 'sell' && s.qty > 0) {
                            const soldQty = Math.min(qty, s.qty);
                            const avgCost = s.costBasis / s.qty;
                            total += soldQty * (priceKRW - avgCost);
                            s.costBasis -= soldQty * avgCost;
                            s.qty -= soldQty;
                        }
                    }
                    realizedProfit = total;
                }

                // 헤더 합계 계산
                const tableTotal = {};
                if (filteredAssets.length > 0) {
                    if (assetType === 'cash') {
                        tableTotal.totalKRW = filteredAssets.reduce((sum, a) => sum + (a.region === 'US' ? a.quantity * currentExchangeRate : a.quantity), 0);
                    } else if (assetType === 'gold') {
                        tableTotal.totalValue = filteredAssets.reduce((sum, a) => sum + (a.totalValue || 0), 0);
                        const totalPrincipal = filteredAssets.reduce((sum, a) => sum + (a.principal || 0), 0);
                        tableTotal.totalProfit = filteredAssets.reduce((sum, a) => sum + (a.profitGain || 0), 0);
                        tableTotal.totalProfitRate = totalPrincipal > 0 ? (tableTotal.totalProfit / totalPrincipal) * 100 : 0;
                    } else if (assetType === 'real_estate') {
                        tableTotal.totalCurrentPrice = filteredAssets.reduce((sum, a) => sum + (a.currentPrice || 0), 0);
                        tableTotal.totalProfit = filteredAssets.reduce((sum, a) => sum + (a.profitGain || 0), 0);
                        const totalNetInvestment = filteredAssets.reduce((sum, a) => sum + (a.netInvestment || 0), 0);
                        tableTotal.totalProfitRate = totalNetInvestment > 0 ? (tableTotal.totalProfit / totalNetInvestment) * 100 : 0;
                    } else if (assetType === 'car') {
                        tableTotal.totalPurchase = filteredAssets.reduce((sum, a) => sum + (a.principal || 0), 0);
                    } else {
                        tableTotal.totalValueKRW = filteredAssets.reduce((sum, a) => sum + (a.totalValue || 0) * (a.region === 'US' ? currentExchangeRate : 1), 0);
                        tableTotal.totalProfitKRW = filteredAssets.reduce((sum, a) => sum + (a.profitGain || 0) * (a.region === 'US' ? currentExchangeRate : 1), 0);
                        const totalPrincipalKRW = filteredAssets.reduce((sum, a) => sum + (a.principal || 0) * (a.region === 'US' ? currentExchangeRate : 1), 0);
                        tableTotal.totalProfitRate = totalPrincipalKRW > 0 ? (tableTotal.totalProfitKRW / totalPrincipalKRW) * 100 : 0;
                    }
                }

                return (
                    <div key={assetType} className="rounded-xl bg-white border border-slate-200 overflow-hidden mt-6">
                        {/* 테이블 헤더 */}
                        <div className="p-4 md:p-6 border-b border-slate-200 flex flex-col gap-3">
                            <div className="flex justify-between items-start w-full">
                                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 min-w-0">
                                    <h3 className="text-base md:text-lg font-bold text-slate-900 leading-tight">{meta.label} 보유 현황 리스트</h3>
                                    {filteredAssets.length > 0 && (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm md:text-base font-black text-slate-800 tracking-tight">
                                                {assetType === 'cash' && formatCurrency(tableTotal.totalKRW)}
                                                {assetType === 'gold' && formatCurrency(tableTotal.totalValue, 'KR')}
                                                {assetType === 'real_estate' && formatCurrency(tableTotal.totalCurrentPrice)}
                                                {assetType === 'car' && formatCurrency(tableTotal.totalPurchase, 'KR')}
                                                {!['cash', 'gold', 'real_estate', 'car'].includes(assetType) && formatCurrency(tableTotal.totalValueKRW)}
                                            </span>
                                            {!['cash', 'car'].includes(assetType) && (() => {
                                                const profit = tableTotal.totalProfit ?? tableTotal.totalProfitKRW ?? 0;
                                                const rate = tableTotal.totalProfitRate ?? 0;
                                                const isPositive = profit >= 0;
                                                return (
                                                    <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-md ${isPositive ? 'text-[#ff4d4f] bg-red-50' : 'text-[#0d7ff2] bg-blue-50'}`}>
                                                        {profit > 0 ? '+' : ''}{formatCurrency(profit)}&nbsp;({rate > 0 ? '+' : ''}{rate.toFixed(2)}%)
                                                    </span>
                                                );
                                            })()}
                                            {realizedProfit !== null && realizedProfit !== 0 && (
                                                <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-md border ${realizedProfit >= 0 ? 'text-green-500 border-green-100 bg-green-50' : 'text-yellow-500 border-yellow-300 bg-yellow-50'}`}>
                                                    실현 {realizedProfit > 0 ? '+' : ''}{formatCurrency(realizedProfit)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <Link href={`/entry?tab=${assetType}`} className="text-[10px] md:text-sm font-bold text-[#0d7ff2] hover:underline shrink-0 bg-blue-50 md:bg-transparent px-2 py-1.5 md:p-0 rounded-lg ml-2">추가/관리</Link>
                            </div>
                        </div>

                        {/* 테이블 */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                    {assetType === 'cash' ? (
                                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                                            <th className="p-4">금융기관명</th>
                                            <th className="p-4 text-right">금액</th>
                                        </tr>
                                    ) : assetType === 'gold' ? (
                                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                                            <th className="p-4">자산명</th>
                                            <th className="p-4 text-right">보유량 (돈)</th>
                                            <th className="p-4 text-right">매수 단가 (평균)</th>
                                            <th className="p-4 text-right">현재가</th>
                                            <th className="p-4 text-right">현재 평가액</th>
                                            <th className="p-4 text-right">수익금 / 수익률</th>
                                        </tr>
                                    ) : assetType === 'real_estate' ? (
                                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                                            <th className="p-4">부동산명</th>
                                            <th className="p-4 text-right">매수가(비용포함)</th>
                                            <th className="p-4 text-right">현재가</th>
                                            <th className="p-4 text-right">수익금 / 수익률</th>
                                        </tr>
                                    ) : assetType === 'car' ? (
                                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                                            <th className="p-4 w-32">날짜</th>
                                            <th className="p-4 w-40">차량번호</th>
                                            <th className="p-4 min-w-[150px]">이름</th>
                                            <th className="p-4 text-right">매수가</th>
                                        </tr>
                                    ) : assetType === 'liability' ? (
                                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                                            <th className="p-4 w-32">발생일</th>
                                            <th className="p-4 min-w-[150px]">부채명</th>
                                            <th className="p-4 text-right">금액</th>
                                            <th className="p-4 text-right">이자율</th>
                                        </tr>
                                    ) : (
                                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                                            <th className="p-4">구분</th>
                                            <th className="p-4">종목 코드 (이름)</th>
                                            <th className="p-4 text-right">수량</th>
                                            <th className="p-4 text-right">매수 단가 (평균)</th>
                                            <th className="p-4 text-right">현재가</th>
                                            <th className="p-4 text-right">투자 원금</th>
                                            <th className="p-4 text-right">현재 평가액</th>
                                            <th className="p-4 text-right">수익금 / 수익률</th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="text-sm divide-y divide-slate-100">
                                    {filteredAssets.length === 0 ? (
                                        <tr>
                                            <td colSpan={assetType === 'cash' ? '2' : assetType === 'car' ? '4' : '8'} className="p-8 text-center text-slate-500">
                                                내역이 없습니다. &quot;자산 추가&quot; 버튼을 통해 시작해보세요.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAssets.map((asset) => (
                                            <tr
                                                key={asset.id}
                                                className={`hover:bg-slate-50 transition-colors ${['stock', 'crypto', 'pension'].includes(assetType) ? 'cursor-pointer' : ''}`}
                                                onClick={(e) => handleRowClick(e, asset, assetType)}
                                            >
                                                {assetType === 'cash' ? (
                                                    <>
                                                        <td className="p-4 font-bold text-slate-900">{asset.name}</td>
                                                        <td className="p-4 text-right font-bold text-slate-900 pr-5">
                                                            <div className="flex flex-col items-end">
                                                                <span>{formatCurrency(asset.quantity, asset.region)}</span>
                                                                {asset.region === 'US' && (
                                                                    <span className="text-xs text-slate-400 mt-0.5 font-normal">≈ {formatCurrency(asset.quantity * currentExchangeRate, 'KR')}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : assetType === 'gold' ? (
                                                    <>
                                                        <td className="p-4 font-bold text-slate-900">{asset.name}</td>
                                                        <td className="p-4 text-right font-medium text-slate-700">{asset.quantity.toLocaleString()}</td>
                                                        <td className="p-4 text-right text-slate-600 pr-5">{formatCurrency(asset.avgPrice, 'KR')}</td>
                                                        <td className="p-4 text-right text-slate-600 pr-5">{formatCurrency(asset.currentPrice || asset.goldCurrentPrice || asset.avgPrice, 'KR')}</td>
                                                        <td className="p-4 text-right font-bold text-slate-900"><div className="flex flex-col items-end"><span>{formatCurrency(asset.totalValue, 'KR')}</span></div></td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className={`font-bold ${asset.profitGain >= 0 ? 'text-[#ff4d4f]' : 'text-[#0d7ff2]'}`}>{asset.profitGain > 0 ? '+' : ''}{formatCurrency(asset.profitGain, 'KR')}</span>
                                                                <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded ${asset.profitRate >= 0 ? 'text-[#ff4d4f] bg-red-50' : 'text-[#0d7ff2] bg-blue-50'}`}>{asset.profitRate > 0 ? '+' : ''}{asset.profitRate.toFixed(2)}%</span>
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : assetType === 'real_estate' ? (
                                                    <>
                                                        <td className="p-4 font-bold text-slate-900 whitespace-nowrap">{asset.name}</td>
                                                        <td className="p-4 text-right text-slate-600 font-medium pr-5">{formatCurrency(asset.principal + (asset.expense || 0), asset.region)}</td>
                                                        <td className="p-4 text-right font-bold text-slate-900 pr-5">{formatCurrency(asset.currentPrice || 0, asset.region)}</td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className={`font-bold ${asset.profitGain >= 0 ? 'text-[#ff4d4f]' : 'text-[#339af0]'}`}>{asset.profitGain > 0 ? '+' : ''}{formatCurrency(asset.profitGain || 0, asset.region)}</span>
                                                                <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded ${(asset.profitGain || 0) >= 0 ? 'text-[#ff4d4f] bg-red-50' : 'text-[#0d7ff2] bg-blue-50'}`}>{asset.profitGain > 0 ? '+' : ''}{asset.netInvestment > 0 ? ((asset.profitGain / asset.netInvestment) * 100).toFixed(2) : 0}%</span>
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : assetType === 'car' ? (
                                                    <>
                                                        <td className="p-4 text-slate-500 whitespace-nowrap">{transactions?.find(t => t.asset_id === asset.id)?.date || '-'}</td>
                                                        <td className="p-4 font-bold text-slate-900">{asset.symbol || '-'}</td>
                                                        <td className="p-4 font-bold text-slate-900">{asset.name}</td>
                                                        <td className="p-4 text-right font-bold text-slate-900 font-mono">{formatCurrency(asset.principal, 'KR')}</td>
                                                    </>
                                                ) : assetType === 'liability' ? (
                                                    <>
                                                        <td className="p-4 text-slate-500 whitespace-nowrap">{transactions?.find(t => t.asset_id === asset.id)?.date || '-'}</td>
                                                        <td className="p-4 font-bold text-slate-900">{asset.name}</td>
                                                        <td className="p-4 text-right font-bold text-slate-900 font-mono text-red-600">{formatCurrency(asset.principal, 'KR')}</td>
                                                        <td className="p-4 text-right font-medium text-slate-600">{asset.interestRate ? `${asset.interestRate}%` : '-'}</td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="p-4 text-slate-700 font-bold whitespace-nowrap">
                                                            <span className="px-2 py-1 bg-slate-100 rounded-md text-xs">{asset.account || '일반'}</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-900">
                                                                    {asset.investmentCountry === 'US' || (!asset.investmentCountry && asset.region === 'US') ? '🇺🇸 ' : asset.investmentCountry === 'KR' || (!asset.investmentCountry && asset.region === 'KR') ? '🇰🇷 ' : ''}{asset.name}
                                                                </span>
                                                                <span className="text-xs text-slate-500">{asset.symbol || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right font-medium text-slate-700">{asset.quantity.toLocaleString()}</td>
                                                        <td className="p-4 text-right text-slate-600 pr-5">{formatCurrency(asset.avgPrice, asset.region)}</td>
                                                        <td className="p-4 text-right text-slate-600 pr-5">{formatCurrency(asset.currentPrice, asset.region)}</td>
                                                        <td className="p-4 text-right font-medium text-slate-700 pr-5">
                                                            <div className="flex flex-col items-end">
                                                                <span>{formatCurrency(asset.principal, asset.region)}</span>
                                                                {asset.region === 'US' && <span className="text-xs text-slate-400 mt-0.5">≈ {formatCurrency(asset.principal * currentExchangeRate, 'KR')}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right font-bold text-slate-900">
                                                            <div className="flex flex-col items-end">
                                                                <span>{formatCurrency(asset.totalValue, asset.region)}</span>
                                                                {asset.region === 'US' && <span className="text-xs text-slate-400 mt-0.5 font-normal">≈ {formatCurrency(asset.totalValue * currentExchangeRate, 'KR')}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className={`font-bold ${asset.profitGain >= 0 ? 'text-[#ff4d4f]' : 'text-[#0d7ff2]'}`}>{asset.profitGain > 0 ? '+' : ''}{formatCurrency(asset.profitGain, asset.region)}</span>
                                                                <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded ${asset.profitRate >= 0 ? 'text-[#ff4d4f] bg-red-50' : 'text-[#0d7ff2] bg-blue-50'}`}>{asset.profitRate > 0 ? '+' : ''}{asset.profitRate.toFixed(2)}%</span>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </>
    );
}
