'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import useAssetStore from '@/store/useAssetStore';
import { Wallet, TrendingDown, CandlestickChart, PiggyBank, Banknote, Building, Gem, Bitcoin, Car, Settings } from 'lucide-react';
import EntryForm from './_components/EntryForm';
import TransactionTable from './_components/TransactionTable';
import ProModal from './_components/ProModal';

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
    const { assets, fetchAssets, transactions, fetchTransactions, allTransactionsLoaded, addAsset, updateTransaction, deleteTransaction, accountTypes, cashInstitutions, savedStockItems, savedPensionItems, savedCryptoItems, fetchSettings, updateSettings, loading, enabledAssetTypes, isLoggedIn } = useAssetStore();
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

    const filteredTransactions = transactions?.filter(t => t.type === activeTab) || [];
    const filteredAssets = assets.filter(a => a.type === activeTab);
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
                        <Link href="/journal" className="text-slate-500 text-sm font-medium hover:text-[#0d7ff2] transition-colors">투자일기</Link>
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
                    {/* 탭 네비게이션 */}
                    <div className="border-b border-slate-200">
                        <div className="flex px-6 gap-8 overflow-x-auto border-b border-slate-200">
                            {(() => {
                                const PREFERRED_ORDER = ['stock', 'crypto', 'cash', 'pension', 'gold', 'real_estate', 'car', 'liability'];
                                const sortedTabs = (enabledAssetTypes || []).sort((a, b) => PREFERRED_ORDER.indexOf(a) - PREFERRED_ORDER.indexOf(b));
                                return sortedTabs.map((typeId) => {
                                    const meta = ASSET_META[typeId];
                                    if (!meta) return null;
                                    return (
                                        <button
                                            key={typeId}
                                            onClick={() => {
                                                if (typeof window !== 'undefined') window.history.replaceState({}, '', `/entry?tab=${typeId}`);
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

                    {/* 입력 폼 */}
                    <EntryForm
                        activeTab={activeTab}
                        editingId={editingId}
                        formData={formData}
                        handleInputChange={handleInputChange}
                        handleSubmit={handleSubmit}
                        cancelEdit={cancelEdit}
                        loading={loading}
                        cashAssets={cashAssets}
                        currentExchangeRate={currentExchangeRate}
                        accountTypes={accountTypes}
                        cashInstitutions={cashInstitutions}
                        savedStockItems={savedStockItems}
                        savedPensionItems={savedPensionItems}
                        savedCryptoItems={savedCryptoItems}
                        isAccountDropdownOpen={isAccountDropdownOpen} setIsAccountDropdownOpen={setIsAccountDropdownOpen}
                        newAccountType={newAccountType} setNewAccountType={setNewAccountType}
                        addAccountType={addAccountType} removeAccountType={removeAccountType} handleAccountSelect={handleAccountSelect}
                        isDropdownOpen={isDropdownOpen} setIsDropdownOpen={setIsDropdownOpen}
                        newInstitution={newInstitution} setNewInstitution={setNewInstitution}
                        addInstitution={addInstitution} removeInstitution={removeInstitution} handleInstitutionSelect={handleInstitutionSelect}
                        isStockItemDropdownOpen={isStockItemDropdownOpen} setIsStockItemDropdownOpen={setIsStockItemDropdownOpen}
                        newStockSymbol={newStockSymbol} setNewStockSymbol={setNewStockSymbol}
                        newStockName={newStockName} setNewStockName={setNewStockName}
                        addStockItem={addStockItem} removeStockItem={removeStockItem} handleStockItemSelect={handleStockItemSelect}
                    />

                    {/* 거래 내역 테이블 */}
                    <TransactionTable
                        activeTab={activeTab}
                        filteredTransactions={filteredTransactions}
                        filteredAssets={filteredAssets}
                        transactions={transactions}
                        editingId={editingId}
                        deletingId={deletingId}
                        handleEdit={handleEdit}
                        handleRealEstateEdit={handleRealEstateEdit}
                        handleDeleteClick={handleDeleteClick}
                        confirmDelete={confirmDelete}
                        cancelDelete={cancelDelete}
                        repayingId={repayingId} setRepayingId={setRepayingId}
                        repaymentForm={repaymentForm} setRepaymentForm={setRepaymentForm}
                        handleRepaymentSubmit={handleRepaymentSubmit}
                        visibleCount={visibleCount} setVisibleCount={setVisibleCount}
                        allTransactionsLoaded={allTransactionsLoaded}
                        fetchTransactions={fetchTransactions}
                        currentExchangeRate={currentExchangeRate}
                        currentGoldPrice={currentGoldPrice}
                    />
                </div>
            </main>

            <ProModal showProModal={showProModal} setShowProModal={setShowProModal} />
        </div>
    );
}
