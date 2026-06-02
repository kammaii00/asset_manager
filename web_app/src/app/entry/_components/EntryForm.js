import { Check, ChevronDown, Edit2, Plus, Trash, X } from 'lucide-react';

const formatCurrency = (val, region = 'KR') => {
    if (region === 'US') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KRW' }).format(val);
};

export default function EntryForm({
    activeTab,
    editingId,
    formData,
    handleInputChange,
    handleSubmit,
    cancelEdit,
    loading,
    cashAssets,
    currentExchangeRate,
    accountTypes,
    cashInstitutions,
    savedStockItems,
    savedPensionItems,
    savedCryptoItems,
    isAccountDropdownOpen, setIsAccountDropdownOpen, newAccountType, setNewAccountType,
    addAccountType, removeAccountType, handleAccountSelect,
    isDropdownOpen, setIsDropdownOpen, newInstitution, setNewInstitution,
    addInstitution, removeInstitution, handleInstitutionSelect,
    isStockItemDropdownOpen, setIsStockItemDropdownOpen, newStockSymbol, setNewStockSymbol, newStockName, setNewStockName,
    addStockItem, removeStockItem, handleStockItemSelect,
}) {
    return (
        <div className="p-4 sm:p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-md font-bold mb-3 text-slate-800">
                {activeTab === 'cash' ? '현금 현황 입력' : '새로운 거래 기록 추가'}
            </h3>
            <div className="flex flex-wrap items-end gap-3 bg-white p-4 rounded border border-slate-200 shadow-sm">

                {/* 현금 입력 폼 */}
                {activeTab === 'cash' && !editingId ? (
                    <>
                        <div className="flex flex-col gap-1 min-w-[130px]">
                            <label className="text-xs font-semibold text-slate-500">날짜</label>
                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[200px] relative">
                            <label className="text-xs font-semibold text-slate-500">금융 기관명 (자산 이름)</label>
                            <div className="border border-slate-300 rounded px-2 py-1.5 text-sm flex justify-between items-center cursor-pointer bg-white" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                                <span className={formData.name ? "text-slate-900" : "text-slate-400"}>{formData.name || "기관 선택..."}</span>
                                <ChevronDown size={16} className="text-slate-400" />
                            </div>
                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                                    {cashInstitutions.map((inst, idx) => (
                                        <div key={idx} className="flex justify-between items-center px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => handleInstitutionSelect(inst)}>
                                            <span className="text-sm font-medium text-slate-700">{inst}</span>
                                            <button onClick={(e) => removeInstitution(inst, e)} className="text-slate-300 hover:text-red-500 p-1" title="삭제"><Trash size={14} /></button>
                                        </div>
                                    ))}
                                    <div className="p-2 flex gap-2 border-t border-slate-200 bg-slate-50">
                                        <input type="text" value={newInstitution} onChange={(e) => setNewInstitution(e.target.value)} placeholder="새 기관 입력..." className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm bg-white" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Enter' && addInstitution()} />
                                        <button onClick={addInstitution} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded transition-colors"><Plus size={16} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-1 min-w-[100px]">
                            <label className="text-xs font-semibold text-slate-500">통화</label>
                            <select name="region" value={formData.region} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-slate-50">
                                <option value="KR">KRW (원화)</option>
                                <option value="US">USD (달러)</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 min-w-[150px]">
                            <label className="text-xs font-semibold text-slate-500">현재 총 잔고 (예상 금액)</label>
                            <input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} placeholder="Ex: 5000000" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                    </>

                ) : activeTab === 'real_estate' ? (
                    <>
                        <div className="flex flex-col gap-1 min-w-[130px]">
                            <label className="text-xs font-semibold text-slate-500">부동산명</label>
                            <input name="name" value={formData.name} onChange={handleInputChange} placeholder="Ex: 반포자이" className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[130px]">
                            <label className="text-xs font-semibold text-slate-500">매수일</label>
                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[120px]">
                            <label className="text-xs font-semibold text-slate-500">매수가</label>
                            <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder="Ex: 500000000" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[100px]">
                            <label className="text-xs font-semibold text-slate-500">비용 (취등록세 등)</label>
                            <input type="number" name="expense" value={formData.expense || ''} onChange={handleInputChange} placeholder="0" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[100px]">
                            <label className="text-xs font-semibold text-slate-500">보증금 (선택)</label>
                            <input type="number" name="deposit" value={formData.deposit || ''} onChange={handleInputChange} placeholder="0" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[120px]">
                            <label className="text-xs font-semibold text-slate-500">현재가</label>
                            <input type="number" name="realEstateCurrentPrice" value={formData.realEstateCurrentPrice || ''} onChange={handleInputChange} placeholder="0" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                    </>

                ) : activeTab === 'liability' ? (
                    <>
                        <div className="flex flex-col gap-1 min-w-[130px]">
                            <label className="text-xs font-semibold text-slate-500">부채명 (대출명 등)</label>
                            <input name="name" value={formData.name} onChange={handleInputChange} placeholder="Ex: 주택담보대출" className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[130px]">
                            <label className="text-xs font-semibold text-slate-500">날짜</label>
                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[120px]">
                            <label className="text-xs font-semibold text-slate-500">부채 금액</label>
                            <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder="Ex: 50000000" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[100px]">
                            <label className="text-xs font-semibold text-slate-500">이자율 (%)</label>
                            <input type="number" step="0.01" name="interestRate" value={formData.interestRate || ''} onChange={handleInputChange} placeholder="Ex: 4.5" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>
                    </>

                ) : (
                    // 주식·연금·코인·금·차량 공통 폼
                    <>
                        {activeTab !== 'car' && (
                            <>
                                <div className="flex flex-col gap-1 min-w-[120px]">
                                    <label className="text-xs font-semibold text-slate-500">거래 조건 (매수/매도)</label>
                                    <select name="action" value={formData.action} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
                                        <option value="buy">매수 (Buy)</option>
                                        <option value="sell">매도 (Sell)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1 min-w-[130px]">
                                    <label className="text-xs font-semibold text-slate-500">날짜</label>
                                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                </div>
                                {/* 계좌 드롭다운 */}
                                <div className="flex flex-col gap-1 min-w-[130px] relative">
                                    <label className="text-xs font-semibold text-slate-500">구분 (계좌)</label>
                                    <div className="border border-slate-300 rounded px-2 py-1.5 text-sm flex justify-between items-center cursor-pointer bg-white" onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}>
                                        <span className={formData.account ? "text-slate-900" : "text-slate-400"}>{formData.account || "일반"}</span>
                                        <ChevronDown size={16} className="text-slate-400" />
                                    </div>
                                    {isAccountDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                                            {accountTypes.map((type, idx) => (
                                                <div key={idx} className="flex justify-between items-center px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => handleAccountSelect(type)}>
                                                    <span className="text-sm font-medium text-slate-700">{type}</span>
                                                    <button onClick={(e) => removeAccountType(type, e)} className="text-slate-300 hover:text-red-500 p-1" title="삭제"><Trash size={14} /></button>
                                                </div>
                                            ))}
                                            <div className="p-2 flex gap-2 border-t border-slate-200 bg-slate-50">
                                                <input type="text" value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)} placeholder="새 항목..." className="flex-1 w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Enter' && addAccountType()} />
                                                <button onClick={(e) => { e.preventDefault(); addAccountType(); }} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded transition-colors"><Plus size={16} /></button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        {activeTab === 'car' && (
                            <div className="flex flex-col gap-1 min-w-[130px]">
                                <label className="text-xs font-semibold text-slate-500">구입일자</label>
                                <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                            </div>
                        )}

                        {/* 통화 / 투자국가 선택 */}
                        <div className="flex flex-col md:flex-row gap-3">
                            {['stock', 'cash'].includes(activeTab) && (
                                <div className="flex flex-col gap-1 min-w-[100px]">
                                    <label className="text-xs font-semibold text-slate-500">결제 통화</label>
                                    <select name="region" value={formData.region} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-slate-50">
                                        <option value="KR">KRW (원화)</option>
                                        <option value="US">USD (달러)</option>
                                    </select>
                                </div>
                            )}
                            {activeTab === 'gold' && (
                                <div className="flex flex-col gap-1 min-w-[100px]">
                                    <label className="text-xs font-semibold text-slate-500">통화</label>
                                    <select name="region" value="KR" readOnly className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-slate-50 text-slate-500 cursor-not-allowed">
                                        <option value="KR">KRW (원화)</option>
                                    </select>
                                </div>
                            )}
                            {(activeTab === 'stock' || activeTab === 'pension') && (
                                <div className="flex flex-col gap-1 min-w-[100px]">
                                    <label className="text-xs font-semibold text-slate-500">투자 국가</label>
                                    <select name="investmentCountry" value={formData.investmentCountry || formData.region} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-slate-50">
                                        <option value="KR">한국 (KR)</option>
                                        <option value="US">미국 (US)</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* 종목 선택 드롭다운 (주식·연금·코인) */}
                        {(activeTab === 'stock' || activeTab === 'pension' || activeTab === 'crypto') ? (
                            <div className="flex flex-col gap-1 min-w-[200px] flex-1 relative">
                                <label className="text-xs font-semibold text-slate-500">
                                    {activeTab === 'crypto' ? '자산 명칭 (티커 - 이름)' : '자산 종목 (코드 - 이름)'}
                                </label>
                                <div className="border border-slate-300 rounded px-2 py-1.5 text-sm flex justify-between items-center cursor-pointer bg-white" onClick={() => setIsStockItemDropdownOpen(!isStockItemDropdownOpen)}>
                                    <span className={(formData.symbol || formData.name) ? "text-slate-900" : "text-slate-400"}>
                                        {formData.symbol && formData.name ? `${formData.symbol} - ${formData.name}` : formData.name || formData.symbol || (activeTab === 'crypto' ? "코인 선택 또는 추가..." : "종목 선택 또는 추가...")}
                                    </span>
                                    <ChevronDown size={16} className="text-slate-400" />
                                </div>
                                {isStockItemDropdownOpen && (
                                    <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-64 overflow-y-auto w-[280px] sm:w-[340px] md:w-[380px] min-w-full">
                                        {(activeTab === 'pension' ? (savedPensionItems || []) : activeTab === 'crypto' ? (savedCryptoItems || []) : (savedStockItems || [])).map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => handleStockItemSelect(item)}>
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className="text-sm font-bold text-slate-700 uppercase whitespace-nowrap">{item.symbol}</span>
                                                    <span className="text-xs text-slate-400">-</span>
                                                    <span className="text-sm font-medium text-slate-600 truncate">{item.name}</span>
                                                </div>
                                                <button onClick={(e) => removeStockItem(item, e)} className="text-slate-300 hover:text-red-500 p-1.5 ml-2 flex-shrink-0" title="삭제"><Trash size={14} /></button>
                                            </div>
                                        ))}
                                        <div className="p-3 flex flex-col sm:flex-row gap-2 border-t border-slate-200 bg-slate-50">
                                            <input type="text" value={newStockSymbol} onChange={(e) => setNewStockSymbol(e.target.value)} placeholder={activeTab === 'crypto' ? "티커(BTC)" : "코드(AAPL)"} className="w-full sm:w-[90px] min-w-0 border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white uppercase" onClick={(e) => e.stopPropagation()} />
                                            <input type="text" value={newStockName} onChange={(e) => setNewStockName(e.target.value)} placeholder={activeTab === 'crypto' ? "이름(비트코인)" : "이름(애플)"} className="flex-1 min-w-0 border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStockItem(); } }} />
                                            <button onClick={(e) => { e.preventDefault(); addStockItem(); }} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-1.5 rounded transition-colors whitespace-nowrap text-sm font-bold h-[34px] sm:h-auto shrink-0">추가</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {activeTab !== 'gold' && activeTab !== 'liability' && (
                                    <div className="flex flex-col gap-1 min-w-[120px]">
                                        <label className="text-xs font-semibold text-slate-500">{activeTab === 'car' ? '차량 번호 / 관리 코드' : '종목코드 (선택)'}</label>
                                        <input name="symbol" value={formData.symbol} onChange={handleInputChange} placeholder={activeTab === 'car' ? "12가 3456" : "Ex: NH"} className="border border-slate-300 rounded px-2 py-1.5 text-sm uppercase" />
                                    </div>
                                )}
                                <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                                    <label className="text-xs font-semibold text-slate-500">{activeTab === 'gold' ? '자산 이름 (금)' : activeTab === 'car' ? '차량 모델명' : '자산 이름'}</label>
                                    <input name="name" value={formData.name} onChange={handleInputChange} placeholder={activeTab === 'gold' ? "Ex: 골드바, 돌반지" : activeTab === 'car' ? "Ex: 쏘나타 (Hybrid)" : "Ex: 삼성전자"} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                </div>
                            </>
                        )}

                        {/* 단가 */}
                        <div className="flex flex-col gap-1 min-w-[120px]">
                            <label className="text-xs font-semibold text-slate-500">
                                {activeTab === 'gold' ? '매수 단가 (1돈당)' : activeTab === 'car' ? '차량 매수가' : activeTab === 'liability' ? '부채 금액' : ['stock', 'pension', 'crypto'].includes(activeTab) ? '체결 단가' : '체결 단가 (환율)'}
                            </label>
                            <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder={activeTab === 'cash' ? "원화는 1" : "0"} className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                        </div>

                        {/* 수량 */}
                        {activeTab !== 'car' && activeTab !== 'liability' && (
                            <div className="flex flex-col gap-1 min-w-[100px]">
                                <label className="text-xs font-semibold text-slate-500">{activeTab === 'gold' ? '거래 수량 (돈)' : '거래 수량'}</label>
                                <input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} placeholder="0" step="any" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                            </div>
                        )}

                        {/* 이자율 (부채) */}
                        {activeTab === 'liability' && (
                            <div className="flex flex-col gap-1 min-w-[100px]">
                                <label className="text-xs font-semibold text-slate-500">이자율 (%)</label>
                                <input type="number" name="interestRate" value={formData.interestRate} onChange={handleInputChange} placeholder="0.00" step="0.01" className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                            </div>
                        )}
                    </>
                )}

                {/* 연동 현금결제 계좌 */}
                {activeTab !== 'cash' && activeTab !== 'liability' && (
                    <div className="flex flex-col gap-1 w-full mt-2 pt-3 border-t border-slate-100">
                        <label className="text-xs font-semibold text-slate-700">
                            <span className="text-[#0d7ff2]">연동 현금결제 계좌</span> (자동 증감 처리)
                        </label>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <select name="linkedCashAssetId" value={formData.linkedCashAssetId || ''} onChange={handleInputChange} className="border border-slate-300 rounded px-3 py-2 text-sm max-w-sm focus:border-[#0d7ff2] focus:ring-1 focus:ring-[#0d7ff2] outline-none transition-shadow">
                                <option value="">선택 안함 (연동 끄기)</option>
                                {cashAssets.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} ({c.region === 'US' ? 'USD ' : 'KRW '}{c.quantity.toLocaleString('ko-KR')})
                                    </option>
                                ))}
                            </select>
                            <div className="text-xs text-slate-500 max-w-lg bg-slate-50 p-2 rounded">
                                {formData.region === 'US' && currentExchangeRate ? (
                                    <>저장 시 <strong>적용 환율({currentExchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원)</strong>을 곱한 총 금액이 선택한 현금 자산에 자동 {formData.action === 'buy' ? '차감' : '추가'}됩니다.</>
                                ) : (
                                    <>저장 시 거래 총 금액만큼 선택한 현금 자산에 자동으로 {formData.action === 'buy' ? '차감' : '추가'}됩니다.</>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 저장/수정 버튼 */}
                <div className="flex flex-col justify-end gap-2 flex-row w-full sm:w-auto mt-2 sm:mt-0 sm:ml-auto items-end">
                    {editingId && (
                        <button onClick={cancelEdit} disabled={loading} className="h-[34px] px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold rounded shadow-sm transition-colors flex items-center justify-center gap-1">
                            <X size={16} /> 취소
                        </button>
                    )}
                    <button onClick={handleSubmit} disabled={loading} className="h-[34px] px-4 bg-[#0d7ff2] hover:bg-blue-600 disabled:bg-blue-300 text-white font-bold rounded shadow-sm transition-colors flex items-center justify-center gap-1">
                        {editingId ? <><Edit2 size={16} /> 수정하기</> : <><Check size={16} /> 추가하기</>}
                    </button>
                </div>
            </div>
            {loading && <div className="text-sm mt-2 text-[#0d7ff2] animate-pulse">요청을 처리중입니다...</div>}
        </div>
    );
}
