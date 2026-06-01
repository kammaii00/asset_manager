'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import useAssetStore from '@/store/useAssetStore';
import { Wallet, TrendingUp, TrendingDown, Bell, Search, PlusCircle, User, CandlestickChart, PiggyBank, Banknote, Building, Check, Edit2, X, Trash2, ChevronDown, Plus, Trash, Gem, Bitcoin, Car, Settings } from 'lucide-react';

const ASSET_META = {
    stock: { label: '주식', labelEn: 'Stocks', icon: CandlestickChart },
    pension: { label: '연금', labelEn: 'Pension', icon: PiggyBank },
    cash: { label: '현금', labelEn: 'Cash', icon: Banknote },
    real_estate: { label: '부동산', labelEn: 'Real Est.', icon: Building },
    gold: { label: '금', labelEn: 'Gold', icon: Gem },
    crypto: { label: '가상화폐', labelEn: 'Crypto', icon: Bitcoin },
    car: { label: '자동차', labelEn: 'Vehicle', icon: Car },
    liability: { label: '부채', labelEn: 'Liability', icon: TrendingDown },
};

export default function EntryPage() {
    const { assets, fetchAssets, transactions, fetchTransactions, allTransactionsLoaded, addAsset, updateTransaction, deleteTransaction, accountTypes, cashInstitutions, savedStockItems, savedPensionItems, savedCryptoItems, fetchSettings, updateSettings, loading, enabledAssetTypes, isPro, isLoggedIn, maxFreeAssets } = useAssetStore();
    const [activeTab, setActiveTab] = useState('stock');
    const [editingId, setEditingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [showProModal, setShowProModal] = useState(false); // Pro 업그레이드 모달 상태
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [newInstitution, setNewInstitution] = useState('');
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
    const [newAccountType, setNewAccountType] = useState('');
    const [isStockItemDropdownOpen, setIsStockItemDropdownOpen] = useState(false);
    const [newStockSymbol, setNewStockSymbol] = useState('');
    const [newStockName, setNewStockName] = useState('');
    const [currentExchangeRate, setCurrentExchangeRate] = useState(null);
    const [currentGoldPrice, setCurrentGoldPrice] = useState(null);
    const [visibleCount, setVisibleCount] = useState(10);
    const [mounted, setMounted] = useState(false);
    const [repayingId, setRepayingId] = useState(null);
    const [repaymentForm, setRepaymentForm] = useState({ date: new Date().toISOString().split('T')[0], price: '' });

    const [formData, setFormData] = useState({
        action: 'buy',
        date: new Date().toISOString().split('T')[0],
        region: 'KR',
        investmentCountry: 'KR',
        account: '일반',
        symbol: '',
        name: '',
        quantity: '',
        price: '',
        expense: '',
        deposit: '',
        realEstateCurrentPrice: '',
        goldCurrentPrice: '',
        interestRate: '',
        linkedCashAssetId: ''
    });

    useEffect(() => {
        setMounted(true);
        fetchSettings();
        fetchAssets();
        fetchTransactions(true); // 전체 로드: 연금·금 등 최신 20건 밖의 타입도 표시되어야 함

        // Fetch current exchange rate
        const fetchRate = async () => {
            try {
                const res = await fetch('/api/exchange-rate');
                if (res.ok) {
                    const data = await res.json();
                    if (data.rate) setCurrentExchangeRate(data.rate);
                }
            } catch (error) {
                console.error("Failed to fetch exchange rate", error);
            }
        };
        fetchRate();

        // Fetch current gold price
        const fetchGold = async () => {
            try {
                const res = await fetch('/api/gold-price');
                if (res.ok) {
                    const data = await res.json();
                    if (data.pricePerDon) setCurrentGoldPrice(data.pricePerDon);
                }
            } catch (error) {
                console.error("Failed to fetch gold price", error);
            }
        };
        fetchGold();

        // Initial tab check
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam) {
                setActiveTab(tabParam);
            }
        }
    }, [fetchAssets, fetchTransactions, fetchSettings]);

    // 로그인 상태가 true로 바뀌면 (세션 복원 포함) 클라우드 데이터 재조회
    useEffect(() => {
        if (!isLoggedIn) return;
        fetchSettings();
        fetchAssets();
        fetchTransactions(true); // 전체 로드
    }, [isLoggedIn]);

    // 활성화된 탭이 enabled 리스트에 없으면 첫 번째 활성 탭으로 폴백
    useEffect(() => {
        if (enabledAssetTypes && enabledAssetTypes.length > 0) {
            if (!enabledAssetTypes.includes(activeTab)) {
                setActiveTab(enabledAssetTypes[0]);
            }
        }
    }, [enabledAssetTypes, activeTab]);

    // Reset form when tab changes (or when component finishes mounting to ensure URL is synced)
    useEffect(() => {
        if (!mounted) return;

        let paramAction = null, paramRegion = null, paramInvestmentCountry = null;
        let paramAccount = null, paramSymbol = null, paramName = null;
        let paramTab = null;
        let hasActionOrName = false;

        if (typeof window !== 'undefined' && window.location.search) {
            const urlParams = new URLSearchParams(window.location.search);
            paramTab = urlParams.get('tab');
            paramAction = urlParams.get('action');
            paramRegion = urlParams.get('region');
            paramInvestmentCountry = urlParams.get('investmentCountry');
            paramAccount = urlParams.get('account');
            paramSymbol = urlParams.get('symbol');
            paramName = urlParams.get('name');
            hasActionOrName = !!(paramAction || paramName);
        }

        const isMatchingTab = paramTab === activeTab;
        const shouldUseParams = isMatchingTab && hasActionOrName;

        let defaultLinkedCashId = '';
        if (['stock', 'pension'].includes(activeTab)) {
            const savedLinkedId = typeof window !== 'undefined' ? localStorage.getItem(`lastLinkedCashAssetId_${activeTab}`) : null;
            if (savedLinkedId) {
                defaultLinkedCashId = savedLinkedId === 'NONE' ? '' : savedLinkedId;
            } else {
                // 가장 최근의 같은 자산 유형 거래 중 linkedCashAssetId가 있는 것을 찾음 (transactions는 기본적으로 최신순)
                const recentTxWithLink = transactions.find(t => t.type === activeTab && t.linkedCashAssetId);
                if (recentTxWithLink) {
                    defaultLinkedCashId = recentTxWithLink.linkedCashAssetId;
                }
            }
        }

        setFormData({
            action: shouldUseParams && paramAction ? paramAction : 'buy',
            date: new Date().toISOString().split('T')[0],
            region: shouldUseParams && paramRegion ? paramRegion : 'KR',
            investmentCountry: shouldUseParams && paramInvestmentCountry ? paramInvestmentCountry : 'KR',
            account: shouldUseParams && paramAccount ? paramAccount : '일반',
            symbol: shouldUseParams && paramSymbol ? paramSymbol : '',
            name: shouldUseParams && paramName ? paramName : '',
            quantity: '',
            price: '',
            expense: '',
            deposit: '',
            realEstateCurrentPrice: '',
            goldCurrentPrice: '',
            interestRate: '',
            linkedCashAssetId: defaultLinkedCashId
        });
        setEditingId(null);
        setVisibleCount(10);

        if (typeof window !== 'undefined' && shouldUseParams) {
            // Clean URL after applying params so manual tab clicks don't carry them over
            window.history.replaceState({}, '', `/entry?tab=${activeTab}`);
        }
    }, [activeTab, mounted]);

    // 지난 입력의 연동 계좌 기본값 설정 (transactions 로드 지연 처리)
    useEffect(() => {
        if (['stock', 'pension'].includes(activeTab) && !editingId) {
            const savedLinkedId = typeof window !== 'undefined' ? localStorage.getItem(`lastLinkedCashAssetId_${activeTab}`) : null;
            let targetId = null;
            
            if (savedLinkedId) {
                targetId = savedLinkedId === 'NONE' ? '' : savedLinkedId;
            } else if (transactions.length > 0) {
                const recentTxWithLink = transactions.find(t => t.type === activeTab && t.linkedCashAssetId);
                if (recentTxWithLink) targetId = recentTxWithLink.linkedCashAssetId;
            }

            if (targetId !== null) {
                setFormData(prev => {
                    // 유저가 아직 선택하지 않았거나 초기화 상태일 때만 설정
                    if (prev.linkedCashAssetId === '') {
                        return { ...prev, linkedCashAssetId: targetId };
                    }
                    return prev;
                });
            }
        }
    }, [transactions, activeTab, editingId]);

    const addInstitution = async () => {
        if (newInstitution.trim() && !cashInstitutions.includes(newInstitution.trim())) {
            const updated = [...cashInstitutions, newInstitution.trim()];
            await updateSettings({ cashInstitutions: updated });
            setFormData(prev => ({ ...prev, name: newInstitution.trim(), symbol: newInstitution.trim() }));
            setNewInstitution('');
            setIsDropdownOpen(false);
        }
    };

    const removeInstitution = async (instToRemove, e) => {
        e.stopPropagation();
        const updated = cashInstitutions.filter(inst => inst !== instToRemove);
        await updateSettings({ cashInstitutions: updated });
        if (formData.name === instToRemove) {
            setFormData(prev => ({ ...prev, name: '', symbol: '' }));
        }
    };

    const handleInstitutionSelect = (inst) => {
        setFormData(prev => ({ ...prev, name: inst, symbol: inst }));
        setIsDropdownOpen(false);
    };

    const addAccountType = async () => {
        if (newAccountType.trim() && !accountTypes.includes(newAccountType.trim())) {
            const updated = [...accountTypes, newAccountType.trim()];
            await updateSettings({ accountTypes: updated });
            setFormData(prev => ({ ...prev, account: newAccountType.trim() }));
            setNewAccountType('');
            setIsAccountDropdownOpen(false);
        }
    };

    const removeAccountType = async (typeToRemove, e) => {
        e.stopPropagation();
        const updated = accountTypes.filter(t => t !== typeToRemove);
        await updateSettings({ accountTypes: updated });
        if (formData.account === typeToRemove) {
            setFormData(prev => ({ ...prev, account: '일반' }));
        }
    };

    const handleAccountSelect = (type) => {
        setFormData(prev => ({ ...prev, account: type }));
        setIsAccountDropdownOpen(false);
    };

    const addStockItem = async () => {
        if (newStockSymbol.trim() && newStockName.trim()) {
            const sym = newStockSymbol.trim().toUpperCase();
            const nm = newStockName.trim();
            const isPension = activeTab === 'pension';
            const isCrypto = activeTab === 'crypto';
            const currentItems = isPension ? (savedPensionItems || []) : (isCrypto ? (savedCryptoItems || []) : (savedStockItems || []));
            const exists = currentItems.some(item => item.symbol === sym && item.name === nm);
            if (!exists) {
                const updated = [...currentItems, { symbol: sym, name: nm }];
                if (isPension) {
                    await updateSettings({ savedPensionItems: updated });
                } else if (isCrypto) {
                    await updateSettings({ savedCryptoItems: updated });
                } else {
                    await updateSettings({ savedStockItems: updated });
                }
            }
            setFormData(prev => ({ ...prev, symbol: sym, name: nm }));
            setNewStockSymbol('');
            setNewStockName('');
            setIsStockItemDropdownOpen(false);
        } else {
            alert('종목코드와 자산이름을 모두 입력해주세요.');
        }
    };

    const removeStockItem = async (itemToRemove, e) => {
        e.stopPropagation();
        const isPension = activeTab === 'pension';
        const isCrypto = activeTab === 'crypto';
        const currentItems = isPension ? (savedPensionItems || []) : (isCrypto ? (savedCryptoItems || []) : (savedStockItems || []));
        const updated = currentItems.filter(item => !(item.symbol === itemToRemove.symbol && item.name === itemToRemove.name));
        if (isPension) {
            await updateSettings({ savedPensionItems: updated });
        } else if (isCrypto) {
            await updateSettings({ savedCryptoItems: updated });
        } else {
            await updateSettings({ savedStockItems: updated });
        }
        if (formData.symbol === itemToRemove.symbol && formData.name === itemToRemove.name) {
            setFormData(prev => ({ ...prev, symbol: '', name: '' }));
        }
    };

    const handleStockItemSelect = (item) => {
        setFormData(prev => ({ ...prev, symbol: item.symbol, name: item.name }));
        setIsStockItemDropdownOpen(false);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        if (name === 'linkedCashAssetId' && ['stock', 'pension'].includes(activeTab)) {
            localStorage.setItem(`lastLinkedCashAssetId_${activeTab}`, value || 'NONE');
        }
    };

    const handleEdit = (trx) => {
        setEditingId(trx.id);
        setFormData({
            action: trx.action,
            date: trx.date,
            region: trx.region || 'KR',
            investmentCountry: trx.investmentCountry || trx.region || 'KR',
            account: trx.account || '일반',
            symbol: trx.symbol || '',
            name: trx.name || '',
            quantity: trx.quantity.toString(),
            price: trx.price.toString(),
            expense: trx.expense?.toString() || '',
            deposit: trx.deposit?.toString() || '',
            realEstateCurrentPrice: trx.realEstateCurrentPrice?.toString() || '',
            goldCurrentPrice: trx.goldCurrentPrice?.toString() || '',
            interestRate: trx.interestRate?.toString() || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleRealEstateEdit = (asset, trx) => {
        if (!trx) {
            alert("연결된 거래 내역을 찾을 수 없습니다.");
            return;
        }
        setEditingId(trx.id);
        setFormData({
            action: trx.action || 'buy',
            date: trx.date,
            region: asset.region || 'KR',
            investmentCountry: asset.investmentCountry || asset.region || 'KR',
            account: asset.account || '일반',
            symbol: asset.symbol || '',
            name: asset.name || '',
            quantity: trx.quantity.toString(),
            price: trx.price.toString(),
            expense: asset.expense?.toString() || '',
            deposit: asset.deposit?.toString() || '',
            realEstateCurrentPrice: asset.realEstateCurrentPrice?.toString() || asset.currentPrice?.toString() || asset.avgPrice?.toString() || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setFormData({ action: 'buy', date: new Date().toISOString().split('T')[0], region: 'KR', investmentCountry: 'KR', account: '일반', symbol: '', name: '', quantity: '', price: '', expense: '', deposit: '', realEstateCurrentPrice: '', goldCurrentPrice: '', interestRate: '', linkedCashAssetId: '' });
    };

    const handleDeleteClick = (id) => {
        setDeletingId(id);
    };

    const confirmDelete = async (id) => {
        try {
            await deleteTransaction(id);
            alert("삭제 성공!");
        } catch (e) {
            alert("삭제 실패: " + e.message);
        } finally {
            setDeletingId(null);
        }
    };

    const cancelDelete = () => {
        setDeletingId(null);
    };

    const handleRepaymentSubmit = async (originalTrx) => {
        if (!repaymentForm.date || !repaymentForm.price) {
            alert('날짜와 상환 금액을 입력해주세요.');
            return;
        }
        await addAsset({
            type: 'liability',
            action: 'sell',
            date: repaymentForm.date,
            region: originalTrx.region || 'KR',
            investmentCountry: 'KR',
            account: '일반',
            symbol: '',
            name: originalTrx.name,
            quantity: 1,
            price: parseFloat(repaymentForm.price),
            interestRate: originalTrx.interestRate || 0,
            linkedCashAssetId: null,
            exchangeRate: currentExchangeRate || 1400
        });
        setRepayingId(null);
        setRepaymentForm({ date: new Date().toISOString().split('T')[0], price: '' });
    };

    const handleSubmit = async () => {
        try {
            const isCashBalanceMatch = activeTab === 'cash' && !editingId;

            if (isCashBalanceMatch) {
                if (!formData.name || !formData.quantity || !formData.date) {
                    alert("필수 항목을 모두 입력해주세요 (기관명, 현재 잔고, 날짜).");
                    return;
                }
            } else if (activeTab === 'real_estate') {
                if (!formData.name || !formData.date || !formData.price || !formData.expense || !formData.realEstateCurrentPrice) {
                    alert("필수 항목을 모두 입력해주세요 (부동산명, 매수일, 매수가, 비용, 현재가).");
                    return;
                }
            } else if (activeTab === 'gold') {
                if (!formData.name || !formData.quantity || !formData.price || !formData.action || !formData.date) {
                    alert("필수 항목을 모두 입력해주세요 (자산명, 수량(돈), 매수/매도, 날짜, 단가).");
                    return;
                }
            } else if (activeTab === 'car') {
                if (!formData.symbol || !formData.name || !formData.date || !formData.price) {
                    alert("필수 항목을 모두 입력해주세요 (차량 번호/코드, 자산 명칭, 날짜, 체결 단가).");
                    return;
                }
            } else if (activeTab === 'liability') {
                if (!formData.name || !formData.date || !formData.price || !formData.interestRate) {
                    alert("필수 항목을 모두 입력해주세요 (부채명, 발생일, 부채 금액, 이자율).");
                    return;
                }
            } else {
                if (!formData.name || !formData.quantity || !formData.price || !formData.action || !formData.date) {
                    alert("필수 항목을 모두 입력해주세요 (종목명, 수량, 단가, 날짜, 매수/매도).");
                    return;
                }
            }

            if (editingId) {
                const updatePayload = {
                    type: activeTab,
                    region: formData.region,
                    investmentCountry: activeTab === 'stock' || activeTab === 'pension' ? formData.investmentCountry : formData.region,
                    account: formData.account || '일반',
                    symbol: formData.symbol.toUpperCase(),
                    name: formData.name,
                    action: formData.action,
                    date: formData.date,
                    quantity: parseFloat(formData.quantity) || 1,
                    price: parseFloat(formData.price)
                };
                if (activeTab === 'real_estate') {
                    updatePayload.expense = parseFloat(formData.expense) || 0;
                    updatePayload.deposit = parseFloat(formData.deposit) || 0;
                    updatePayload.realEstateCurrentPrice = parseFloat(formData.realEstateCurrentPrice) || 0;
                } else if (activeTab === 'gold') {
                    updatePayload.goldCurrentPrice = parseFloat(formData.goldCurrentPrice) || parseFloat(formData.price) || 0;
                } else if (activeTab === 'liability') {
                    updatePayload.interestRate = parseFloat(formData.interestRate) || 0;
                }
                await updateTransaction(editingId, updatePayload);
                cancelEdit();
            } else if (isCashBalanceMatch) {
                const targetBalance = parseFloat(formData.quantity);
                const exchangeRate = formData.region === 'US' ? (currentExchangeRate || 1400) : 1;

                // Find existing asset to get current balance
                const existingAsset = assets.find(a => a.type === 'cash' && a.region === formData.region && a.name === formData.name);
                const currentBalance = existingAsset ? existingAsset.quantity : 0;

                const diff = targetBalance - currentBalance;

                if (diff === 0) {
                    return;
                }

                const action = diff > 0 ? 'buy' : 'sell';
                const transactionQuantity = Math.abs(diff);

                await addAsset({
                    type: 'cash',
                    action: action,
                    date: formData.date,
                    region: formData.region,
                    investmentCountry: formData.region,
                    symbol: formData.symbol || formData.name, // Use name as symbol
                    name: formData.name,
                    quantity: transactionQuantity,
                    price: exchangeRate
                });

                setFormData(prev => ({ ...prev, name: '', quantity: '', price: '' }));
            } else if (activeTab === 'real_estate') {
                await addAsset({
                    type: activeTab,
                    action: 'buy', // default to buy for real estate addition
                    date: formData.date,
                    region: formData.region || 'KR',
                    investmentCountry: formData.region || 'KR',
                    account: formData.account || '일반',
                    symbol: '',
                    name: formData.name,
                    quantity: 1, // Real estate is treated as 1 unit
                    price: parseFloat(formData.price),
                    expense: parseFloat(formData.expense) || 0,
                    deposit: parseFloat(formData.deposit) || 0,
                    realEstateCurrentPrice: parseFloat(formData.realEstateCurrentPrice) || parseFloat(formData.price),
                    linkedCashAssetId: formData.linkedCashAssetId || null,
                    exchangeRate: currentExchangeRate || 1400
                });
                setFormData(prev => ({ ...prev, name: '', price: '', expense: '', deposit: '', realEstateCurrentPrice: '', linkedCashAssetId: prev.linkedCashAssetId }));
            } else if (activeTab === 'car') {
                await addAsset({
                    type: activeTab,
                    action: 'buy',
                    date: formData.date,
                    region: 'KR',
                    investmentCountry: 'KR',
                    account: '일반',
                    symbol: formData.symbol.toUpperCase(),
                    name: formData.name,
                    quantity: 1,
                    price: parseFloat(formData.price),
                    linkedCashAssetId: formData.linkedCashAssetId || null,
                    exchangeRate: currentExchangeRate || 1400
                });
                setFormData(prev => ({ ...prev, symbol: '', name: '', quantity: '', price: '', linkedCashAssetId: prev.linkedCashAssetId }));
            } else if (activeTab === 'liability') {
                await addAsset({
                    type: activeTab,
                    action: 'buy',
                    date: formData.date,
                    region: 'KR',
                    investmentCountry: 'KR',
                    account: '일반',
                    symbol: '',
                    name: formData.name,
                    quantity: 1,
                    price: parseFloat(formData.price),
                    interestRate: parseFloat(formData.interestRate) || 0,
                    linkedCashAssetId: formData.linkedCashAssetId || null,
                    exchangeRate: currentExchangeRate || 1400
                });
                setFormData(prev => ({ ...prev, name: '', quantity: '', price: '', interestRate: '', linkedCashAssetId: prev.linkedCashAssetId }));
            } else {
                await addAsset({
                    type: activeTab,
                    action: formData.action,
                    date: formData.date,
                    region: formData.region,
                    investmentCountry: activeTab === 'stock' || activeTab === 'pension' ? formData.investmentCountry : formData.region,
                    account: formData.account || '일반',
                    symbol: formData.symbol.toUpperCase(),
                    name: formData.name,
                    quantity: parseFloat(formData.quantity),
                    price: parseFloat(formData.price),
                    goldCurrentPrice: parseFloat(formData.goldCurrentPrice) || parseFloat(formData.price),
                    linkedCashAssetId: formData.linkedCashAssetId || null,
                    exchangeRate: currentExchangeRate || 1400
                });

                setFormData(prev => ({ ...prev, symbol: '', name: '', quantity: '', price: '', goldCurrentPrice: '', linkedCashAssetId: prev.linkedCashAssetId }));
            }
        } catch (e) {
            console.error("오류 발생: " + e.message);
            if (e.message.includes('최대 5개')) {
                setShowProModal(true);
            } else {
                alert("처리 중 오류가 발생했습니다: " + e.message);
            }
        }
    };

    const formatCurrency = (val, region = 'KR') => {
        if (region === 'US') {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
        }
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KRW' }).format(val);
    };

    const filteredTransactions = transactions?.filter(t => t.type === activeTab) || [];
    const filteredAssets = assets.filter(a => a.type === activeTab);
    const totalCategoryValue = filteredAssets.reduce((sum, a) => sum + (a.totalValue || 0), 0);
    const cashAssets = assets.filter(a => a.type === 'cash');

    if (!mounted) {
        return (
            <div className="flex bg-[#f5f7f8] min-h-screen justify-center items-center">
                <div className="text-[#0d7ff2] animate-pulse font-bold">로딩 중...</div>
            </div>
        );
    }

    return (
        <div className="bg-[#f5f7f8] min-h-screen text-slate-900 font-sans flex flex-col">
            <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 px-6 py-4 bg-white sticky top-0 z-50">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3 text-slate-900">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-[#0d7ff2]">
                            <Wallet size={20} />
                        </div>
                        <h2 className="text-lg font-bold leading-tight tracking-tight">Asset Manager</h2>
                    </div>
                    <nav className="hidden md:flex items-center gap-6">
                        <Link href="/" className="text-slate-500 text-sm font-medium hover:text-[#0d7ff2] transition-colors">대시보드</Link>
                        <span className="text-slate-900 text-sm font-semibold cursor-pointer">자산 입력</span>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/settings" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500" title="설정">
                        <Settings size={22} />
                    </Link>
                </div>
            </header>

            <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl sm:text-4xl font-black leading-tight">자산 관리 목록</h1>
                        <p className="text-slate-500 max-w-2xl text-sm">
                            거래 내역을 기록하여 포트폴리오를 관리하세요. (Date 및 Buy/Sell 항목 추가)
                        </p>
                    </div>
                </div>

                <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="border-b border-slate-200">
                        <div className="flex px-6 gap-8 overflow-x-auto border-b border-slate-200">
                            {(() => {
                                const PREFERRED_ORDER = ['stock', 'crypto', 'cash', 'pension', 'gold', 'real_estate', 'car', 'liability'];
                                const sortedTabs = (enabledAssetTypes || []).sort((a, b) => {
                                    return PREFERRED_ORDER.indexOf(a) - PREFERRED_ORDER.indexOf(b);
                                });
                                return sortedTabs.map((typeId) => {
                                    const meta = ASSET_META[typeId];
                                    if (!meta) return null;
                                    return (
                                        <button
                                            key={typeId}
                                            onClick={() => {
                                                if (typeof window !== 'undefined') {
                                                    window.history.replaceState({}, '', `/entry?tab=${typeId}`);
                                                }
                                                setActiveTab(typeId);
                                            }}
                                            className={`flex items-center gap-2 pb-3 pt-4 px-2 border-b-[3px] transition-all whitespace-nowrap ${activeTab === typeId ? 'border-[#0d7ff2] text-[#0d7ff2]' : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'}`}
                                        >
                                            <meta.icon size={20} />
                                            <p className="text-sm font-bold">{meta.label} <span className="text-xs opacity-70 ml-0.5">({meta.labelEn})</span></p>
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    <div className="p-4 sm:p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="text-md font-bold mb-3 text-slate-800">{activeTab === 'cash' ? '현금 현황 입력' : '새로운 거래 기록 추가'}</h3>
                        <div className="flex flex-wrap items-end gap-3 bg-white p-4 rounded border border-slate-200 shadow-sm">
                            {activeTab === 'cash' && !editingId ? (
                                <>
                                    <div className="flex flex-col gap-1 min-w-[130px]">
                                        <label className="text-xs font-semibold text-slate-500">날짜</label>
                                        <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                    </div>
                                    <div className="flex flex-col gap-1 flex-1 min-w-[200px] relative">
                                        <label className="text-xs font-semibold text-slate-500">금융 기관명 (자산 이름)</label>
                                        <div
                                            className="border border-slate-300 rounded px-2 py-1.5 text-sm flex justify-between items-center cursor-pointer bg-white"
                                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        >
                                            <span className={formData.name ? "text-slate-900" : "text-slate-400"}>
                                                {formData.name || "기관 선택..."}
                                            </span>
                                            <ChevronDown size={16} className="text-slate-400" />
                                        </div>
                                        {isDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                                                {cashInstitutions.map((inst, idx) => (
                                                    <div key={idx} className="flex justify-between items-center px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => handleInstitutionSelect(inst)}>
                                                        <span className="text-sm font-medium text-slate-700">{inst}</span>
                                                        <button
                                                            onClick={(e) => removeInstitution(inst, e)}
                                                            className="text-slate-300 hover:text-red-500 p-1"
                                                            title="삭제"
                                                        >
                                                            <Trash size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <div className="p-2 flex gap-2 border-t border-slate-200 bg-slate-50">
                                                    <input
                                                        type="text"
                                                        value={newInstitution}
                                                        onChange={(e) => setNewInstitution(e.target.value)}
                                                        placeholder="새 기관 입력..."
                                                        className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.key === 'Enter' && addInstitution()}
                                                    />
                                                    <button onClick={addInstitution} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded transition-colors">
                                                        <Plus size={16} />
                                                    </button>
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
                                    {/* Removed exchange rate input as per request */}
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
                                            <div className="flex flex-col gap-1 min-w-[130px] relative">
                                                <label className="text-xs font-semibold text-slate-500">구분 (계좌)</label>
                                                <div
                                                    className="border border-slate-300 rounded px-2 py-1.5 text-sm flex justify-between items-center cursor-pointer bg-white"
                                                    onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                                                >
                                                    <span className={formData.account ? "text-slate-900" : "text-slate-400"}>
                                                        {formData.account || "일반"}
                                                    </span>
                                                    <ChevronDown size={16} className="text-slate-400" />
                                                </div>
                                                {isAccountDropdownOpen && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                                                        {accountTypes.map((type, idx) => (
                                                            <div key={idx} className="flex justify-between items-center px-3 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => handleAccountSelect(type)}>
                                                                <span className="text-sm font-medium text-slate-700">{type}</span>
                                                                <button
                                                                    onClick={(e) => removeAccountType(type, e)}
                                                                    className="text-slate-300 hover:text-red-500 p-1"
                                                                    title="삭제"
                                                                >
                                                                    <Trash size={14} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <div className="p-2 flex gap-2 border-t border-slate-200 bg-slate-50">
                                                            <input
                                                                type="text"
                                                                value={newAccountType}
                                                                onChange={(e) => setNewAccountType(e.target.value)}
                                                                placeholder="새 항목..."
                                                                className="flex-1 w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                                                                onClick={(e) => e.stopPropagation()}
                                                                onKeyDown={(e) => e.key === 'Enter' && addAccountType()}
                                                            />
                                                            <button onClick={(e) => { e.preventDefault(); addAccountType(); }} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded transition-colors">
                                                                <Plus size={16} />
                                                            </button>
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
                                    <div className="flex flex-col md:flex-row gap-3">
                                        {(['stock', 'cash'].includes(activeTab)) && (
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
                                        {/* New 투자 국가 (Investment Country) selection for stock & pension */}
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
                                    {(activeTab === 'stock' || activeTab === 'pension' || activeTab === 'crypto') ? (
                                        <div className="flex flex-col gap-1 min-w-[200px] flex-1 relative">
                                            <label className="text-xs font-semibold text-slate-500">
                                                {activeTab === 'crypto' ? '자산 명칭 (티커 - 이름)' : '자산 종목 (코드 - 이름)'}
                                            </label>
                                            <div
                                                className="border border-slate-300 rounded px-2 py-1.5 text-sm flex justify-between items-center cursor-pointer bg-white"
                                                onClick={() => setIsStockItemDropdownOpen(!isStockItemDropdownOpen)}
                                            >
                                                <span className={(formData.symbol || formData.name) ? "text-slate-900" : "text-slate-400"}>
                                                    {formData.symbol && formData.name ? `${formData.symbol} - ${formData.name}` : formData.name || formData.symbol || (activeTab === 'crypto' ? "코인 선택 또는 추가..." : "종목 선택 또는 추가...")}
                                                </span>
                                                <ChevronDown size={16} className="text-slate-400" />
                                            </div>
                                            {isStockItemDropdownOpen && (
                                                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-64 overflow-y-auto w-[280px] sm:w-[340px] md:w-[380px] min-w-full">
                                                    {(activeTab === 'pension' ? (savedPensionItems || []) : (activeTab === 'crypto' ? (savedCryptoItems || []) : (savedStockItems || []))).map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => handleStockItemSelect(item)}>
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className="text-sm font-bold text-slate-700 uppercase whitespace-nowrap">{item.symbol}</span>
                                                                <span className="text-xs text-slate-400">-</span>
                                                                <span className="text-sm font-medium text-slate-600 truncate">{item.name}</span>
                                                            </div>
                                                            <button
                                                                onClick={(e) => removeStockItem(item, e)}
                                                                className="text-slate-300 hover:text-red-500 p-1.5 ml-2 flex-shrink-0"
                                                                title="삭제"
                                                            >
                                                                <Trash size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <div className="p-3 flex flex-col sm:flex-row gap-2 border-t border-slate-200 bg-slate-50">
                                                        <input
                                                            type="text"
                                                            value={newStockSymbol}
                                                            onChange={(e) => setNewStockSymbol(e.target.value)}
                                                            placeholder={activeTab === 'crypto' ? "티커(BTC)" : "코드(AAPL)"}
                                                            className="w-full sm:w-[90px] min-w-0 border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white uppercase"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <input
                                                            type="text"
                                                            value={newStockName}
                                                            onChange={(e) => setNewStockName(e.target.value)}
                                                            placeholder={activeTab === 'crypto' ? "이름(비트코인)" : "이름(애플)"}
                                                            className="flex-1 min-w-0 border border-slate-300 rounded px-2.5 py-1.5 text-sm bg-white"
                                                            onClick={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    addStockItem();
                                                                }
                                                            }}
                                                        />
                                                        <button onClick={(e) => { e.preventDefault(); addStockItem(); }} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-1.5 rounded transition-colors whitespace-nowrap text-sm font-bold h-[34px] sm:h-auto shrink-0">
                                                            추가
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {(activeTab !== 'gold' && activeTab !== 'liability') && (
                                                <div className="flex flex-col gap-1 min-w-[120px]">
                                                    <label className="text-xs font-semibold text-slate-500">
                                                        {activeTab === 'car' ? '차량 번호 / 관리 코드' : '종목코드 (선택)'}
                                                    </label>
                                                    <input name="symbol" value={formData.symbol} onChange={handleInputChange} placeholder={activeTab === 'car' ? "12가 3456" : "Ex: NH"} className="border border-slate-300 rounded px-2 py-1.5 text-sm uppercase" />
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                                                <label className="text-xs font-semibold text-slate-500">
                                                    {activeTab === 'gold' ? '자산 이름 (금)' : activeTab === 'car' ? '차량 모델명' : '자산 이름'}
                                                </label>
                                                <input name="name" value={formData.name} onChange={handleInputChange} placeholder={activeTab === 'gold' ? "Ex: 골드바, 돌반지" : activeTab === 'car' ? "Ex: 쏘나타 (Hybrid)" : "Ex: 삼성전자"} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                            </div>
                                        </>
                                    )}
                                    <div className="flex flex-col gap-1 min-w-[120px]">
                                        <label className="text-xs font-semibold text-slate-500">
                                            {activeTab === 'gold' ? '매수 단가 (1돈당)' : activeTab === 'car' ? '차량 매수가' : activeTab === 'liability' ? '부채 금액' : (['stock', 'pension', 'crypto'].includes(activeTab)) ? '체결 단가' : '체결 단가 (환율)'}
                                        </label>
                                        <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder={activeTab === 'cash' ? "원화는 1" : "0"} className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono" />
                                    </div>
                                    {activeTab !== 'car' && activeTab !== 'liability' && (
                                        <div className="flex flex-col gap-1 min-w-[100px]">
                                            <label className="text-xs font-semibold text-slate-500">
                                                {activeTab === 'gold' ? '거래 수량 (돈)' : '거래 수량'}
                                            </label>
                                            <input
                                                type="number"
                                                name="quantity"
                                                value={formData.quantity}
                                                onChange={handleInputChange}
                                                placeholder="0"
                                                step="any"
                                                className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono"
                                            />
                                        </div>
                                    )}
                                    {activeTab === 'liability' && (
                                        <div className="flex flex-col gap-1 min-w-[100px]">
                                            <label className="text-xs font-semibold text-slate-500">
                                                이자율 (%)
                                            </label>
                                            <input
                                                type="number"
                                                name="interestRate"
                                                value={formData.interestRate}
                                                onChange={handleInputChange}
                                                placeholder="0.00"
                                                step="0.01"
                                                className="border border-slate-300 rounded px-2 py-1.5 text-sm text-right font-mono"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            {activeTab !== 'cash' && activeTab !== 'liability' && (
                                <div className="flex flex-col gap-1 w-full mt-2 pt-3 border-t border-slate-100">
                                    <label className="text-xs font-semibold text-slate-700">
                                        <span className="text-[#0d7ff2]">연동 현금결제 계좌</span> (자동 증감 처리)
                                    </label>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <select
                                            name="linkedCashAssetId"
                                            value={formData.linkedCashAssetId || ''}
                                            onChange={handleInputChange}
                                            className="border border-slate-300 rounded px-3 py-2 text-sm max-w-sm focus:border-[#0d7ff2] focus:ring-1 focus:ring-[#0d7ff2] outline-none transition-shadow"
                                        >
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

                    <div className="p-4 sm:p-6 pb-4 flex justify-between items-center bg-white border-b border-slate-200">
                        <h3 className="text-md font-bold text-slate-800">
                            {activeTab === 'cash' ? '현금 현황' : activeTab === 'real_estate' ? '부동산 현황 리스트' : activeTab === 'gold' ? '금 보유 현황' : '거래 내역 (Transaction History)'}
                        </h3>
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

                    <div className="p-0 sm:p-6 sm:pt-4">
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
                                                    <td className="px-4 py-3 text-right text-slate-900 font-mono">
                                                        {formatCurrency(asset.principal, asset.region)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">
                                                        {formatCurrency(asset.expense || 0, asset.region)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-600 font-mono">
                                                        {formatCurrency(asset.deposit || 0, asset.region)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-[#0d7ff2] font-bold font-mono">
                                                        {formatCurrency(asset.netInvestment || 0, asset.region)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">
                                                        {formatCurrency(asset.currentPrice || asset.avgPrice, asset.region)}
                                                    </td>
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
                                                                    <button
                                                                        onClick={() => handleRealEstateEdit(asset, trx)}
                                                                        className="p-1.5 text-slate-400 hover:text-[#0d7ff2] hover:bg-blue-50 rounded transition-colors"
                                                                        title="수정"
                                                                    >
                                                                        <Edit2 size={16} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteClick(trx.id)}
                                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                                        title="삭제"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
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
                                                        // Cash Table Row Rendering
                                                        <>
                                                            <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                            <td className="px-4 py-3 text-slate-800 font-bold">{trx.name}</td>
                                                            <td className="px-4 py-3 font-bold text-slate-700 bg-slate-50/50">
                                                                {trx.region === 'US' ? '달러 (USD)' : '원 (KRW)'}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">
                                                                {formatCurrency(trx.quantity, trx.region)}
                                                            </td>
                                                            <td className={`px-4 py-3 font-bold text-center ${trx.action === 'buy' ? 'text-green-500' : 'text-[#ff4d4f]'}`}>
                                                                {trx.action === 'buy' ? '증가' : '감소'}
                                                            </td>
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
                                                            <td className={`px-4 py-3 font-bold ${trx.action === 'buy' ? 'text-red-500' : 'text-blue-500'}`}>
                                                                {trx.action === 'buy' ? '매수' : '매도'}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                            <td className="px-4 py-3 text-slate-800 font-bold">{trx.name}</td>
                                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(trx.price, 'KR')}</td>
                                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{trx.quantity.toLocaleString()} 돈</td>
                                                            <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.price * trx.quantity, 'KR')}</td>
                                                        </>
                                                    ) : (
                                                        // Original Table Row Rendering
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
                                                            <td className="px-4 py-3 text-slate-700 font-medium">
                                                                {trx.account || '일반'}
                                                            </td>
                                                            <td className={`px-4 py-3 font-bold ${trx.action === 'buy' ? 'text-red-500' : 'text-blue-500'}`}>
                                                                {trx.action === 'buy' ? '매수' : '매도'}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-500">{trx.date}</td>
                                                            <td className="px-4 py-3 font-medium text-slate-900">{trx.symbol || '-'}</td>
                                                            <td className="px-4 py-3 text-slate-600 font-medium">{trx.name}</td>
                                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{formatCurrency(trx.price, trx.region)}</td>
                                                            <td className="px-4 py-3 text-right text-slate-600 font-mono">{trx.quantity.toLocaleString()}</td>
                                                            <td className="px-4 py-3 text-right text-slate-900 font-bold font-mono">{formatCurrency(trx.price * trx.quantity, trx.region)}</td>
                                                        </>
                                                    )}
                                                    {/* Common Management Actions Column */}
                                                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                        {deletingId === trx.id ? (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <span className="text-xs text-red-500 font-bold mr-1">삭제콜?</span>
                                                                <button onClick={() => confirmDelete(trx.id)} className="px-2 py-1 text-white bg-red-500 hover:bg-red-600 rounded text-xs font-bold transition-colors">Y</button>
                                                                <button onClick={cancelDelete} className="px-2 py-1 text-slate-500 bg-slate-200 hover:bg-slate-300 rounded text-xs transition-colors">N</button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    onClick={() => handleEdit(trx)}
                                                                    className="p-1.5 text-slate-400 hover:text-[#0d7ff2] hover:bg-blue-50 rounded transition-colors"
                                                                    title="수정"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteClick(trx.id)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                                    title="삭제"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
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
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleRepaymentSubmit(trx); }}
                                                                    className="px-4 py-1.5 bg-[#0d7ff2] text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors"
                                                                >
                                                                    상환 저장
                                                                </button>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); setRepayingId(null); }}
                                                                    className="px-4 py-1.5 bg-slate-200 text-slate-600 text-sm font-semibold rounded hover:bg-slate-300 transition-colors"
                                                                >
                                                                    취소
                                                                </button>
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
                </div>
            </main>

            {/* Pro Upgrade Modal */}
            {showProModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all animate-in fade-in zoom-in duration-300">
                        <div className="bg-gradient-to-br from-[#0d7ff2] to-blue-700 p-8 text-white text-center relative">
                            <button 
                                onClick={() => setShowProModal(false)}
                                className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
                                <TrendingUp size={32} className="text-white" />
                            </div>
                            <h3 className="text-2xl font-black mb-2">포트폴리오 확장이 필요한 시점!</h3>
                            <p className="text-blue-100 text-sm leading-relaxed">
                                이미 정성스럽게 5개의 자산을 관리하고 계시네요.<br/>
                                더 넓은 자산의 바다로 나아갈 준비가 되셨습니다.
                            </p>
                        </div>
                        <div className="p-8">
                            <ul className="space-y-4 mb-8">
                                <li className="flex items-start gap-3">
                                    <div className="p-1 bg-green-100 rounded-full mt-0.5">
                                        <Check size={14} className="text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">무제한 자산 등록</p>
                                        <p className="text-xs text-slate-500">갯수 제한 없이 모든 포트폴리오를 관리하세요.</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="p-1 bg-blue-100 rounded-full mt-0.5">
                                        <Check size={14} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">안전한 실시간 클라우드 백업</p>
                                        <p className="text-xs text-slate-500">핸드폰을 바꿔도, 브라우저를 초기화해도 데이터는 영원히 안전합니다.</p>
                                    </div>
                                </li>
                                {/* AI 기능 임시 비활성화
                                <li className="flex items-start gap-3">
                                    <div className="p-1 bg-purple-100 rounded-full mt-0.5">
                                        <Check size={14} className="text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">Personal AI Manager</p>
                                        <p className="text-xs text-slate-500">무제한 AI 어드바이저와 실시간 인사이트를 받으세요.</p>
                                    </div>
                                </li>
                                */}
                            </ul>
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={() => {
                                        alert("결제 및 로그인 시스템 도입 준비 중입니다! (Phase 2에서 구현 예정)");
                                        setShowProModal(false);
                                    }}
                                    className="w-full py-4 bg-[#0d7ff2] hover:bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-200 transition-all transform active:scale-[0.98]"
                                >
                                    지금 Pro로 업그레이드 (한달 무료)
                                </button>
                                <button 
                                    onClick={() => setShowProModal(false)}
                                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold rounded-xl transition-colors text-sm"
                                >
                                    다음에 할게요
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 text-center mt-6 uppercase tracking-widest font-medium">
                                Data Insurance for your Wealth
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
