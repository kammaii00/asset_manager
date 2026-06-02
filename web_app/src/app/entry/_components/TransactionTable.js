import { Fragment } from 'react';
import { Edit2, Trash2 } from 'lucide-react';

const formatCurrency = (val, region = 'KR') => {
    if (region === 'US') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KRW' }).format(val);
};

export default function TransactionTable({
    activeTab,
    filteredTransactions,
    filteredAssets,
    transactions,
    editingId,
    deletingId,
    handleEdit,
    handleRealEstateEdit,
    handleDeleteClick,
    confirmDelete,
    cancelDelete,
    repayingId,
    setRepayingId,
    repaymentForm,
    setRepaymentForm,
    handleRepaymentSubmit,
    visibleCount,
    setVisibleCount,
    allTransactionsLoaded,
    fetchTransactions,
    currentExchangeRate,
    currentGoldPrice,
}) {
    return (
        <div className="p-0 sm:p-6 sm:pt-0">
            {/* 통계 바 */}
            <div className="px-4 sm:px-0 py-4 flex justify-between items-center border-b border-slate-200 sm:border-0 sm:mb-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-md font-bold text-slate-800">
                        {activeTab === 'cash' ? '현금 현황' : activeTab === 'real_estate' ? '부동산 현황 리스트' : activeTab === 'gold' ? '금 보유 현황' : '거래 내역 (Transaction History)'}
                    </h3>
                    {activeTab === 'liability' && (
                        <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
                            대출 내역을 클릭하면 상환 정보를 입력할 수 있습니다.
                        </span>
                    )}
                </div>
                {(activeTab === 'cash' || activeTab === 'stock' || activeTab === 'pension') && currentExchangeRate && (
                    <div className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-2">
                        <span className="text-slate-400">USD/KRW:</span>
                        <span className="text-[#0d7ff2] font-mono">{currentExchangeRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 원</span>
                    </div>
                )}
                {activeTab === 'gold' && currentGoldPrice && (
                    <div className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-2">
                        <span className="text-slate-400">Gold Price / Don:</span>
                        <span className="text-amber-600 font-mono">₩ {currentGoldPrice.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
                    </div>
                )}
            </div>

            {/* 테이블 */}
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="uppercase tracking-wider border-b border-slate-200 bg-slate-50 text-slate-500">
                        {activeTab === 'cash' ? (
                            <tr className="table-fixed w-full">
                                <th className="px-4 py-3 font-semibold w-1/6">날짜</th>
                                <th className="px-4 py-3 font-semibold w-1/6">금융기관명</th>
                                <th className="px-4 py-3 font-semibold w-1/6">통화</th>
                                <th className="px-4 py-3 font-semibold text-right w-1/6">금액</th>
                                <th className="px-4 py-3 font-semibold text-center w-1/6">증감</th>
                                <th className="px-4 py-3 font-semibold text-center w-1/6">관리</th>
                            </tr>
                        ) : activeTab === 'real_estate' ? (
                            <tr>
                                <th className="px-4 py-3 font-semibold min-w-[150px]">부동산명</th>
                                <th className="px-4 py-3 font-semibold">매수일</th>
                                <th className="px-4 py-3 font-semibold text-right">매수가</th>
                                <th className="px-4 py-3 font-semibold text-right">비용</th>
                                <th className="px-4 py-3 font-semibold text-right">보증금</th>
                                <th className="px-4 py-3 font-semibold text-right">실투자금</th>
                                <th className="px-4 py-3 font-semibold text-right">현재가</th>
                                <th className="px-4 py-3 font-semibold text-right">수익</th>
                                <th className="px-4 py-3 font-semibold text-center w-24">관리</th>
                            </tr>
                        ) : activeTab === 'gold' ? (
                            <tr>
                                <th className="px-4 py-3 font-semibold w-24">유형</th>
                                <th className="px-4 py-3 font-semibold w-24">날짜</th>
                                <th className="px-4 py-3 font-semibold min-w-[150px]">이름</th>
                                <th className="px-4 py-3 font-semibold text-right">매수 단가 (돈당)</th>
                                <th className="px-4 py-3 font-semibold text-right">수량 (돈)</th>
                                <th className="px-4 py-3 font-semibold text-right">총액</th>
                                <th className="px-4 py-3 font-semibold text-center w-24">관리</th>
                            </tr>
                        ) : activeTab === 'car' ? (
                            <tr>
                                <th className="px-4 py-3 font-semibold w-24 text-left">날짜</th>
                                <th className="px-4 py-3 font-semibold w-24 text-left">차량번호</th>
                                <th className="px-4 py-3 font-semibold min-w-[150px] text-left">이름</th>
                                <th className="px-4 py-3 font-semibold text-right">매수가</th>
                                <th className="px-4 py-3 font-semibold text-center w-24">관리</th>
                            </tr>
                        ) : activeTab === 'liability' ? (
                            <tr>
                                <th className="px-4 py-3 font-semibold w-20 text-center">구분</th>
                                <th className="px-4 py-3 font-semibold w-24 text-left">날짜</th>
                                <th className="px-4 py-3 font-semibold min-w-[150px] text-left">부채명</th>
                                <th className="px-4 py-3 font-semibold text-right">금액</th>
                                <th className="px-4 py-3 font-semibold text-right">이자율</th>
                                <th className="px-4 py-3 font-semibold text-center w-24">관리</th>
                            </tr>
                        ) : (
                            <tr>
                                <th className="px-4 py-3 font-semibold text-center w-16">국가</th>
                                <th className="px-4 py-3 font-semibold w-24 text-left">구분</th>
                                <th className="px-4 py-3 font-semibold w-24 text-left">유형</th>
                                <th className="px-4 py-3 font-semibold w-24 text-left">날짜</th>
                                <th className="px-4 py-3 font-semibold w-24 text-left">종목코드</th>
                                <th className="px-4 py-3 font-semibold min-w-[150px] text-left">이름</th>
                                <th className="px-4 py-3 font-semibold text-right text-left">체결 단가</th>
                                <th className="px-4 py-3 font-semibold text-right text-left">수량</th>
                                <th className="px-4 py-3 font-semibold text-right text-left">총액</th>
                                <th className="px-4 py-3 font-semibold text-center w-24">관리</th>
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {activeTab === 'real_estate' ? (
                            filteredAssets.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-500">부동산 현황이 없습니다.</td>
                                </tr>
                            ) : (
                                filteredAssets.map(asset => (
                                    <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-slate-800 font-bold">{asset.name}</td>
                                        <td className="px-4 py-3 text-slate-500">
                                            {transactions.find(t => t.asset_id === asset.id)?.date || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-900 font-mono">{formatCurrency(asset.principal, asset.region)}</td>
                                        <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(asset.expense || 0, asset.region)}</td>
                                        <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(asset.deposit || 0, asset.region)}</td>
                                        <td className="px-4 py-3 text-right text-[#0d7ff2] font-bold font-mono">{formatCurrency(asset.netInvestment || 0, asset.region)}</td>
                                        <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(asset.currentPrice || asset.avgPrice, asset.region)}</td>
                                        <td className={`px-4 py-3 text-right font-bold font-mono ${asset.profitGain >= 0 ? 'text-[#ff4d4f]' : 'text-[#0d7ff2]'}`}>
                                            {asset.profitGain > 0 ? '+' : ''}{formatCurrency(asset.profitGain || 0, asset.region)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {(() => {
                                                const trx = transactions.find(t => t.asset_id === asset.id);
                                                if (!trx) return null;
                                                return deletingId === trx.id ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <span className="text-xs text-red-500 font-bold mr-1">삭제콜?</span>
                                                        <button onClick={() => confirmDelete(trx.id)} className="px-2 py-1 text-white bg-red-500 hover:bg-red-600 rounded text-xs font-bold transition-colors">Y</button>
                                                        <button onClick={cancelDelete} className="px-2 py-1 text-slate-500 bg-slate-200 hover:bg-slate-300 rounded text-xs transition-colors">N</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => handleRealEstateEdit(asset, trx)} className="p-1.5 text-slate-400 hover:text-[#0d7ff2] hover:bg-blue-50 rounded transition-colors" title="수정"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDeleteClick(trx.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="삭제"><Trash2 size={16} /></button>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))
                            )
                        ) : (
                            filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'cash' ? "6" : activeTab === 'car' ? "5" : "10"} className="p-8 text-center text-slate-500">해당 카테고리의 거래 내역이 없습니다. (No Transactions)</td>
                                </tr>
                            ) : (
                                filteredTransactions.slice(0, visibleCount).map(trx => (
                                    <Fragment key={trx.id}>
                                        <tr
                                            className={`transition-colors ${activeTab === 'liability' && trx.action === 'buy' ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-slate-50'}`}
                                            onClick={activeTab === 'liability' && trx.action === 'buy' ? () => {
                                                setRepayingId(prev => prev === trx.id ? null : trx.id);
                                                setRepaymentForm({ date: new Date().toISOString().split('T')[0], price: '' });
                                            } : undefined}
                                        >
                                            {activeTab === 'cash' ? (
                                                <>
                                                    <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-bold">{trx.name}</td>
                                                    <td className="px-4 py-3 font-bold text-slate-700 bg-slate-50/50">{trx.region === 'US' ? '달러 (USD)' : '원 (KRW)'}</td>
                                                    <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.quantity, trx.region)}</td>
                                                    <td className={`px-4 py-3 font-bold text-center ${trx.action === 'buy' ? 'text-green-500' : 'text-[#ff4d4f]'}`}>{trx.action === 'buy' ? '증가' : '감소'}</td>
                                                </>
                                            ) : activeTab === 'car' ? (
                                                <>
                                                    <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                    <td className="px-4 py-3 font-medium text-slate-900">{trx.symbol || '-'}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-bold">{trx.name}</td>
                                                    <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.price * trx.quantity, trx.region)}</td>
                                                </>
                                            ) : activeTab === 'liability' ? (
                                                <>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trx.action === 'sell' ? 'bg-blue-100 text-[#0d7ff2]' : 'bg-red-100 text-[#ff4d4f]'}`}>
                                                            {trx.action === 'sell' ? '상환' : '대출'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-bold">{trx.name}</td>
                                                    <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.price, trx.region || 'KR')}</td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">{trx.interestRate ? `${trx.interestRate}%` : '-'}</td>
                                                </>
                                            ) : activeTab === 'gold' ? (
                                                <>
                                                    <td className={`px-4 py-3 font-bold ${trx.action === 'buy' ? 'text-red-500' : 'text-blue-500'}`}>{trx.action === 'buy' ? '매수' : '매도'}</td>
                                                    <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-bold">{trx.name}</td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(trx.price, 'KR')}</td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">{trx.quantity.toLocaleString()} 돈</td>
                                                    <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.price * trx.quantity, 'KR')}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-3 font-bold text-center text-slate-700 bg-slate-50/50">
                                                        {(() => {
                                                            const invCountry = trx.investmentCountry || trx.region;
                                                            const isUSInvest = invCountry === 'US';
                                                            const isKRW = trx.region === 'KR';
                                                            if (isUSInvest && isKRW) return '🇺🇸(KRW)';
                                                            if (isUSInvest && !isKRW) return '🇺🇸(USD)';
                                                            if (!isUSInvest && isKRW) return '🇰🇷(KRW)';
                                                            return trx.region === 'US' ? '🇺🇸' : trx.region === 'KR' ? '🇰🇷' : '-';
                                                        })()}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700 font-medium">{trx.account || '일반'}</td>
                                                    <td className={`px-4 py-3 font-bold ${trx.action === 'buy' ? 'text-red-500' : 'text-blue-500'}`}>{trx.action === 'buy' ? '매수' : '매도'}</td>
                                                    <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                    <td className="px-4 py-3 font-medium text-slate-900">{trx.symbol || '-'}</td>
                                                    <td className="px-4 py-3 text-slate-600 font-medium">{trx.name}</td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(trx.price, trx.region)}</td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">{trx.quantity.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.price * trx.quantity, trx.region)}</td>
                                                </>
                                            )}
                                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                {deletingId === trx.id ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <span className="text-xs text-red-500 font-bold mr-1">삭제콜?</span>
                                                        <button onClick={() => confirmDelete(trx.id)} className="px-2 py-1 text-white bg-red-500 hover:bg-red-600 rounded text-xs font-bold transition-colors">Y</button>
                                                        <button onClick={cancelDelete} className="px-2 py-1 text-slate-500 bg-slate-200 hover:bg-slate-300 rounded text-xs transition-colors">N</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => handleEdit(trx)} className="p-1.5 text-slate-400 hover:text-[#0d7ff2] hover:bg-blue-50 rounded transition-colors" title="수정"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDeleteClick(trx.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="삭제"><Trash2 size={16} /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {activeTab === 'liability' && trx.action === 'buy' && repayingId === trx.id && (
                                            <tr className="bg-blue-50">
                                                <td colSpan="6" className="px-4 py-3">
                                                    <div className="flex items-end gap-3">
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-xs font-semibold text-slate-500">상환일</label>
                                                            <input
                                                                type="date"
                                                                value={repaymentForm.date}
                                                                onChange={e => setRepaymentForm(p => ({ ...p, date: e.target.value }))}
                                                                onClick={e => e.stopPropagation()}
                                                                className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-xs font-semibold text-slate-500">상환 금액</label>
                                                            <input
                                                                type="number"
                                                                value={repaymentForm.price}
                                                                onChange={e => setRepaymentForm(p => ({ ...p, price: e.target.value }))}
                                                                onClick={e => e.stopPropagation()}
                                                                placeholder="Ex: 10000000"
                                                                className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono bg-white"
                                                            />
                                                        </div>
                                                        <button onClick={e => { e.stopPropagation(); handleRepaymentSubmit(trx); }} className="px-4 py-1.5 bg-[#0d7ff2] text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors">상환 저장</button>
                                                        <button onClick={e => { e.stopPropagation(); setRepayingId(null); }} className="px-4 py-1.5 bg-slate-200 text-slate-600 text-sm font-semibold rounded hover:bg-slate-300 transition-colors">취소</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))
                            )
                        )}
                    </tbody>
                </table>
            </div>

            {/* 더보기 버튼 */}
            {activeTab !== 'real_estate' && (visibleCount < filteredTransactions.length || (!allTransactionsLoaded && transactions.length >= 20)) && (
                <div className="flex justify-center mt-6 mb-2">
                    <button
                        onClick={() => {
                            if (!allTransactionsLoaded && visibleCount + 10 > filteredTransactions.length) {
                                fetchTransactions(true);
                            }
                            setVisibleCount(prev => prev + 10);
                        }}
                        className="px-6 py-2 bg-white border border-slate-300 text-sm font-bold text-slate-600 rounded-full hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all"
                    >
                        더보기
                    </button>
                </div>
            )}
        </div>
    );
}
