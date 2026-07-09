'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAssetStore from '@/store/useAssetStore';
import { Wallet, Settings, CandlestickChart, PiggyBank, Banknote, Building, Gem, Bitcoin, Car, AlertTriangle } from 'lucide-react';
import SummaryCards from './_components/SummaryCards';
import ChartsSection from './_components/ChartsSection';
import AssetTable from './_components/AssetTable';
// AI 기능 임시 비활성화
// import AiAdvisor from '@/components/AiAdvisor';
// import AiInsights from '@/components/AiInsights';
// 모든 자산 유형 메타데이터: id -> { label, labelEn, color(hex), bgColor, activeClass, icon }
const ASSET_META = {
  stock: { label: '주식', labelEn: 'Stocks', color: '#3b82f6', bgClass: 'bg-blue-50', activeClass: 'bg-blue-100 text-blue-600', icon: CandlestickChart },
  pension: { label: '연금', labelEn: 'Pension', color: '#a855f7', bgClass: 'bg-purple-50', activeClass: 'bg-purple-100 text-purple-600', icon: PiggyBank },
  cash: { label: '현금', labelEn: 'Cash', color: '#22c55e', bgClass: 'bg-green-50', activeClass: 'bg-green-100 text-green-600', icon: Banknote },
  real_estate: { label: '부동산', labelEn: 'Real Estate', color: '#ff7f50', bgClass: 'bg-orange-50', activeClass: 'bg-orange-100 text-orange-600', icon: Building },
  gold: { label: '금(Gold)', labelEn: 'Gold', color: '#eab308', bgClass: 'bg-amber-50', activeClass: 'bg-amber-100 text-amber-600', icon: Gem },
  crypto: { label: '가상화폐', labelEn: 'Crypto', color: '#06b6d4', bgClass: 'bg-cyan-50', activeClass: 'bg-cyan-100 text-cyan-600', icon: Bitcoin },
  car: { label: '자동차', labelEn: 'Vehicle', color: '#64748b', bgClass: 'bg-slate-100', activeClass: 'bg-slate-200 text-slate-600', icon: Car },
  liability: { label: '부채', labelEn: 'Liability', color: '#ef4444', bgClass: 'bg-red-50', activeClass: 'bg-red-100 text-red-600', icon: AlertTriangle },
};

// Recharts에서 쓰는 색상 맵 (라벨 기반)
const ASSET_COLORS = Object.fromEntries(
  Object.values(ASSET_META).map(m => [m.label, m.color])
);

const DRILLDOWN_COLORS = {
  '한국': '#ef4444',
  '미국': '#3b82f6',
  '원화 (KRW)': '#22c55e',
  '달러 (USD)': '#f59e0b'
};

export default function Dashboard() {
  const { assets, fetchAssets, history, dailyHistory, fetchHistory, loading, getSummary, enabledAssetTypes, fetchSettings, transactions, fetchTransactions, preferredIncludeMap, setPreferredIncludeMap, targetAssetRatios, targetTotalAmount, cashUpdateDate, isLoggedIn, getAuthHeaders, login } = useAssetStore();
  const [filter, setFilter] = useState('DAILY');
  // 각 자산 유형의 포함 여부를 동적으로 관리 (저장된 설정 없으면 true)
  const includeMap = {};
  (enabledAssetTypes || []).forEach(type => {
    includeMap[type] = preferredIncludeMap?.[type] ?? true;
  });

  const [currentExchangeRate, setCurrentExchangeRate] = useState(1400); // Default fallback
  const [drillDownCategory, setDrillDownCategory] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [actionMenu, setActionMenu] = useState({ visible: false, x: 0, y: 0, asset: null, assetType: null });

  // 최초 마운트 시 데이터 로드 (auth.authStateReady() 내부에서 대기 후 토큰 첨부)
  useEffect(() => {
    setMounted(true);
    fetchSettings();
    fetchAssets();
    fetchTransactions(true);
    fetchHistory();

    // Fetch current exchange rate with caching
    const fetchRate = async () => {
      try {
        const CACHE_KEY = 'exchange_rate_cache';
        const CACHE_TIME_KEY = 'exchange_rate_time';
        const ONE_HOUR = 60 * 60 * 1000;
        
        const cachedRate = localStorage.getItem(CACHE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        const now = Date.now();

        if (cachedRate && cachedTime && (now - parseInt(cachedTime) < ONE_HOUR)) {
          setCurrentExchangeRate(parseFloat(cachedRate));
          return;
        }

        const res = await fetch('/api/exchange-rate');
        if (res.ok) {
          const data = await res.json();
          if (data.rate) {
            setCurrentExchangeRate(data.rate);
            localStorage.setItem(CACHE_KEY, data.rate.toString());
            localStorage.setItem(CACHE_TIME_KEY, now.toString());
          }
        }
      } catch (error) {
        console.error("Failed to fetch exchange rate", error);
      }
    };
    fetchRate();
  }, [fetchAssets, fetchTransactions, fetchHistory, fetchSettings]);

  // 로그인 상태가 true로 바뀌면 (세션 복원 포함) 클라우드 데이터 재조회
  useEffect(() => {
    if (!isLoggedIn) return;
    fetchSettings();
    fetchAssets();
    fetchTransactions(true);
    fetchHistory();
  }, [isLoggedIn]);

  // 앱 오픈 시 오늘 스냅샷을 라이브 가격으로 자동 저장 (하루 1회, sessionStorage로 중복 방지)
  useEffect(() => {
    if (!isLoggedIn || loading || assets.length === 0) return;
    const snapshotKey = `snapshot_saved_${todayDateStr}`;
    if (sessionStorage.getItem(snapshotKey)) return;

    getAuthHeaders().then(headers =>
      fetch('/api/history/snapshot', {
        method: 'POST',
        headers,
        body: JSON.stringify(currentSummaryData),
      })
    ).then(res => {
      if (res.ok) sessionStorage.setItem(snapshotKey, '1');
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, loading, assets.length]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (actionMenu.visible) setActionMenu(prev => ({ ...prev, visible: false }));
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [actionMenu.visible]);

  const handleRowClick = (e, asset, assetType) => {
    if (['stock', 'crypto', 'pension'].includes(assetType)) {
      e.stopPropagation();
      setActionMenu({
        visible: true,
        x: e.pageX,
        y: e.pageY,
        asset,
        assetType
      });
    }
  };

  // 자산 유형 정렬 순서 정의
  const PREFERRED_ORDER = ['stock', 'crypto', 'cash', 'pension', 'gold', 'real_estate', 'car', 'liability'];

  const toggleInclude = (typeId) => {
    const nextValue = !(preferredIncludeMap?.[typeId] ?? true);
    setPreferredIncludeMap({
      ...preferredIncludeMap,
      [typeId]: nextValue
    });
  };

  const summary = getSummary(currentExchangeRate);
  const formatCurrency = (val, region = 'KR') => {
    if (region === 'US') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KRW' }).format(val);
  };
  const formatPercent = (val) => `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

  const SUMMARY_KEYS = {
    stock: { total: 'totalStock', profit: 'stockProfit', rate: 'stockRate' },
    crypto: { total: 'totalCrypto', profit: 'cryptoProfit', rate: 'cryptoRate' },
    cash: { total: 'totalCash', profit: 'cashProfit', rate: 'cashRate' },
    pension: { total: 'totalPension', profit: 'pensionProfit', rate: 'pensionRate' },
    gold: { total: 'totalGold', profit: 'goldProfit', rate: 'goldRate' },
    real_estate: { total: 'totalRealEstate', profit: 'realEstateProfit', rate: 'realEstateRate' },
    car: { total: 'totalCar', profit: 'carProfit', rate: 'carRate' },
    liability: { total: 'totalLiability', profit: 'liabilityProfit', rate: 'liabilityRate' },
  };

  const HISTORY_KEYS = {
    stock: 'stockValue',
    pension: 'pensionValue',
    cash: 'cashValue',
    real_estate: 'realEstateValue',
    gold: 'goldValue',
    crypto: 'cryptoValue',
    car: 'carValue',
    liability: 'liabilityValue'
  };

  const sortedEnabledTypes = [...(enabledAssetTypes || [])].sort((a, b) => {
    return PREFERRED_ORDER.indexOf(a) - PREFERRED_ORDER.indexOf(b);
  });

  // 순수 자산 합계 (부채 제외)
  const grossAssets = (enabledAssetTypes || []).reduce((sum, type) => {
    if (type === 'liability') return sum;
    const key = SUMMARY_KEYS[type];
    return sum + (key ? (summary[key.total] || 0) : 0);
  }, 0);

  // 부채 합계
  const totalLiabilityAmount = (enabledAssetTypes || []).includes('liability')
    ? (summary[SUMMARY_KEYS.liability.total] || 0)
    : 0;

  // 순자산 = 자산 합계 - 부채 합계
  const displayTotalAssets = grossAssets - totalLiabilityAmount;

  const displayTotalProfit = (enabledAssetTypes || []).reduce((sum, type) => {
    if (type === 'liability') return sum;
    const key = SUMMARY_KEYS[type];
    return sum + (key ? (summary[key.profit] || 0) : 0);
  }, 0);

  const displayTotalPrincipal = displayTotalAssets - displayTotalProfit;
  const displayProfitRate = displayTotalPrincipal > 0 ? (displayTotalProfit / displayTotalPrincipal) * 100 : 0;

  const achievementRate = targetTotalAmount > 0 ? (displayTotalAssets / targetTotalAmount) * 100 : 0;

  // 현금 최신화 알림 계산
  let showCashUpdateAlert = false;
  if (cashUpdateDate) {
    const today = new Date();
    let targetMonth = today.getMonth();
    let targetYear = today.getFullYear();
    const updateDay = parseInt(cashUpdateDate);
    
    // 만약 오늘이 기준일보다 이전이면 저번 달 기준일을 타겟으로 함
    if (today.getDate() < updateDay) {
        targetMonth -= 1;
        if (targetMonth < 0) {
            targetMonth = 11;
            targetYear -= 1;
        }
    }
    
    // JS Date는 날짜 초과 시 자동으로 보정해 줌 (예: 2월 31일 -> 3월 3일)
    const targetDate = new Date(targetYear, targetMonth, updateDay);
    targetDate.setHours(0,0,0,0);
    const targetDateStr = targetDate.getFullYear() + '-' + String(targetDate.getMonth() + 1).padStart(2, '0') + '-' + String(targetDate.getDate()).padStart(2, '0');

    // transactions 중 타입이 'cash'인 가장 최근 거래의 날짜가 targetDateStr 이상이면 업데이트 한 것
    const hasRecentCashUpdate = transactions.some(tx => tx.type === 'cash' && tx.date >= targetDateStr);
    
    if (!hasRecentCashUpdate) {
        showCashUpdateAlert = true;
    }
  }

  // 리밸런싱 알림 계산
  const rebalancingAlerts = [];
  if (targetAssetRatios && Object.keys(targetAssetRatios).length > 0) {
    const totalActualValue = (enabledAssetTypes || []).reduce((sum, type) => {
      if (type === 'liability') return sum;
      const key = SUMMARY_KEYS[type];
      return sum + (key ? (summary[key.total] || 0) : 0);
    }, 0);

    if (totalActualValue > 0) {
      Object.entries(targetAssetRatios).forEach(([type, targetPct]) => {
        if (targetPct > 0) {
          const key = SUMMARY_KEYS[type];
          const actualValue = key ? (summary[key.total] || 0) : 0;
          const actualPct = (actualValue / totalActualValue) * 100;
          const diff = actualPct - targetPct;

          if (Math.abs(diff) >= 5) {
            rebalancingAlerts.push({
              type,
              label: ASSET_META[type]?.label || type,
              actualPct,
              targetPct,
              diff
            });
          }
        }
      });
    }
  }

  // 그래프용 포함된 자산 합계 계산 (부채는 차감)
  const includedTotalAssets = (enabledAssetTypes || []).reduce((sum, typeId) => {
    if (!includeMap[typeId]) return sum;
    const key = SUMMARY_KEYS[typeId];
    const value = key ? (summary[key.total] || 0) : 0;
    return typeId === 'liability' ? sum - value : sum + value;
  }, 0);

  // Process data for charts
  let allocationTitle = '비중 확인 (Allocation)';
  let displayAllocation = [];
  let drillDownTotal = 0;

  if (!drillDownCategory) {
    displayAllocation = (enabledAssetTypes || []).map(type => {
      const meta = ASSET_META[type];
      const key = SUMMARY_KEYS[type];
      if (!meta || !key) return null;
      const value = summary[key.total] || 0;
      if (value <= 0) return null;
      return { name: meta.label, value, typeId: type };
    }).filter(Boolean);

    // 필터링 적용 (실제 차트에 보일 데이터)
    displayAllocation = displayAllocation.filter(item => includeMap[item.typeId]);
  } else {
    allocationTitle = `${drillDownCategory} 상세 비중`;
    let items = [];
    const convert = (val, region) => (region === 'US' ? (val || 0) * currentExchangeRate : (val || 0));

    if (drillDownCategory === '주식' || drillDownCategory === '연금') {
      const typeStr = drillDownCategory === '주식' ? 'stock' : 'pension';
      const categoryAssets = assets.filter(a => a.type === typeStr);

      const krValue = categoryAssets.filter(a => a.investmentCountry === 'KR' || (!a.investmentCountry && a.region === 'KR')).reduce((sum, a) => sum + convert(a.totalValue, a.region), 0);
      const usValue = categoryAssets.filter(a => a.investmentCountry === 'US' || (!a.investmentCountry && a.region === 'US')).reduce((sum, a) => sum + convert(a.totalValue, a.region), 0);

      if (krValue > 0) items.push({ name: '한국', value: krValue });
      if (usValue > 0) items.push({ name: '미국', value: usValue });
    } else if (drillDownCategory === '현금') {
      const categoryAssets = assets.filter(a => a.type === 'cash');
      const krValue = categoryAssets.filter(a => a.region === 'KR').reduce((sum, a) => sum + (a.totalValue || 0), 0);
      const usValue = categoryAssets.filter(a => a.region === 'US').reduce((sum, a) => sum + (a.totalValue || 0), 0);

      if (krValue > 0) items.push({ name: '원화 (KRW)', value: krValue });
      if (usValue > 0) items.push({ name: '달러 (USD)', value: usValue });
    }

    displayAllocation = items;
    drillDownTotal = items.reduce((sum, item) => sum + item.value, 0);
  }

  // 범례 클릭 핸들러
  const handleLegendClick = (data) => {
    let typeId = data.typeId;
    if (!typeId && data.value) {
      // Line 차트 범례에서 온 경우 label로 찾기
      typeId = Object.keys(ASSET_META).find(key => ASSET_META[key].label === data.value);
    }
    if (typeId) toggleInclude(typeId);
  };

  const currentDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const todayDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const currentSummaryData = {
    stockValue: summary.totalStock || 0,
    cashValue: summary.totalCash || 0,
    pensionValue: summary.totalPension || 0,
    realEstateValue: summary.totalRealEstate || 0,
    goldValue: summary.totalGold || 0,
    cryptoValue: summary.totalCrypto || 0,
    carValue: summary.totalCar || 0,
    liabilityValue: summary.totalLiability || 0,
    totalValue: displayTotalAssets
  };

  let processedDailyHistory = [...(dailyHistory || [])];
  if (processedDailyHistory.length > 0 && processedDailyHistory[processedDailyHistory.length - 1].date !== todayDateStr) {
    processedDailyHistory.push({ ...currentSummaryData, date: todayDateStr });
  } else if (processedDailyHistory.length > 0) {
    processedDailyHistory[processedDailyHistory.length - 1] = { ...currentSummaryData, date: todayDateStr };
  } else if (!loading) {
    processedDailyHistory = [{ ...currentSummaryData, date: todayDateStr }];
  }

  let processedMonthlyHistory = [...(history || [])];
  if (processedMonthlyHistory.length > 0 && processedMonthlyHistory[processedMonthlyHistory.length - 1].month !== currentMonthStr) {
    processedMonthlyHistory.push({ ...currentSummaryData, month: currentMonthStr });
  } else if (processedMonthlyHistory.length > 0) {
    processedMonthlyHistory[processedMonthlyHistory.length - 1] = { ...currentSummaryData, month: currentMonthStr };
  } else if (!loading) {
    processedMonthlyHistory = [{ ...currentSummaryData, month: currentMonthStr }];
  }

  let chartHistory = [];
  if (filter === 'DAILY') {
    chartHistory = processedDailyHistory?.length > 0 ? processedDailyHistory.slice(-30).map(d => ({
      ...d,
      displayLabel: d.date ? d.date.substring(5) : '', // MM-DD
    })) : [];
  } else if (filter === 'MONTHLY') {
    chartHistory = processedMonthlyHistory?.length > 0 ? processedMonthlyHistory.slice(-12).map(m => ({
      ...m,
      displayLabel: m.month ? `${m.month.split('-')[0].slice(2)}.${m.month.split('-')[1]}` : '', // YY.MM
    })) : [];
  } else {
    chartHistory = processedMonthlyHistory?.length > 0 ? processedMonthlyHistory.map(m => ({
      ...m,
      displayLabel: m.month ? `${m.month.split('-')[0].slice(2)}.${m.month.split('-')[1]}` : '', // YY.MM
    })) : [];
  }

  // 각 시점의 "포함된 자산 합계" 계산 (부채는 차감)
  const calcIncludedTotal = (item) => (enabledAssetTypes || []).reduce((sum, typeId) => {
    if (!includeMap[typeId]) return sum;
    const value = item[HISTORY_KEYS[typeId]] || 0;
    return typeId === 'liability' ? sum - value : sum + value;
  }, 0);

  chartHistory = chartHistory.map(item => ({ ...item, includedTotal: calcIncludedTotal(item) }));

  // Fallback
  if (chartHistory.length === 0) {
    const includedTotal = calcIncludedTotal(currentSummaryData);
    chartHistory = [
      { ...currentSummaryData, displayLabel: '오늘', includedTotal }
    ];
  }

  if (!mounted) {
    return (
      <div className="flex bg-[#f5f7f8] min-h-screen justify-center items-center">
        <div className="text-[#0d7ff2] animate-pulse font-bold">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f7f8] font-sans text-slate-900 min-h-screen flex flex-col overflow-x-hidden">
      {/* Top Navigation */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 px-6 py-4 bg-white sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 text-slate-900">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-[#339af0]">
              <Wallet size={20} />
            </div>
            <h2 className="text-lg font-bold leading-tight tracking-tight">Asset Manager</h2>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <span className="text-slate-900 text-sm font-semibold hover:text-[#0d7ff2] transition-colors cursor-pointer">대시보드</span>
            <Link href="/entry" className="text-slate-500 text-sm font-medium hover:text-slate-900 transition-colors">자산 입력</Link>
            <Link href="/journal" className="text-slate-500 text-sm font-medium hover:text-slate-900 transition-colors">투자일기</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500" title="설정">
            <Settings size={22} />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6">

        {/* Cloud Backup Notification Banner */}
        {!isLoggedIn && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-4 sm:p-5 text-white shadow-lg shadow-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm border border-white/20">
                <AlertTriangle size={24} className="text-blue-100" />
              </div>
              <div>
                <h4 className="font-black text-lg">데이터가 이 기기에만 저장되어 있습니다</h4>
                <p className="text-blue-100 text-sm font-medium">지금 클라우드에 백업하여 브라우저 초기화나 기기 분실로부터 자산을 안전하게 보호하세요.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={login}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-700/30 text-white font-bold rounded-xl hover:bg-blue-700/50 transition-all border border-white/20 whitespace-nowrap"
              >
                로그인
              </button>
              <button 
                onClick={() => {
                  window.location.href = '/settings';
                }}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-white text-blue-600 font-black rounded-xl hover:bg-blue-50 transition-all shadow-md whitespace-nowrap"
              >
                10초 만에 백업하기
              </button>
            </div>
          </div>
        )}

        {/* 현금 갱신 알림 배너 */}
        {showCashUpdateAlert && (
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-2xl p-4 sm:p-5 text-white shadow-lg shadow-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm border border-white/20">
                <Banknote size={24} className="text-emerald-100" />
              </div>
              <div>
                <h4 className="font-black text-lg">이번 달 현금 자산을 최신화해주세요</h4>
                <p className="text-emerald-100 text-sm font-medium">설정하신 알림 기준일({cashUpdateDate}일)이 지났으나 현금 자산 정보가 아직 갱신되지 않았습니다.</p>
              </div>
            </div>
            <Link 
              href="/entry?tab=cash"
              className="px-6 py-2.5 bg-white text-emerald-600 font-black rounded-xl hover:bg-emerald-50 transition-all shadow-md whitespace-nowrap"
            >
              현금 갱신하기
            </Link>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">내 자산 대시보드</h1>
            <p className="text-slate-500 mt-1">포트폴리오 요약 정보입니다.</p>
          </div>
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              onClick={() => setFilter('DAILY')}
              className={`px-3 py-1.5 rounded text-xs transition-all ${filter === 'DAILY' ? 'bg-white shadow-sm font-semibold text-slate-900' : 'hover:bg-slate-200 font-medium text-slate-500'}`}
            >
              일별 (최근 1달)
            </button>
            <button
              onClick={() => setFilter('MONTHLY')}
              className={`px-3 py-1.5 rounded text-xs transition-all ${filter === 'MONTHLY' ? 'bg-white shadow-sm font-semibold text-slate-900' : 'hover:bg-slate-200 font-medium text-slate-500'}`}
            >
              월별 (1년)
            </button>
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded text-xs transition-all ${filter === 'ALL' ? 'bg-white shadow-sm font-semibold text-slate-900' : 'hover:bg-slate-200 font-medium text-slate-500'}`}
            >
              전체
            </button>
          </div>
        </div>

        {/* 순자산 요약 카드 + 리밸런싱 알림 */}
        <SummaryCards
          sortedEnabledTypes={sortedEnabledTypes}
          ASSET_META={ASSET_META}
          SUMMARY_KEYS={SUMMARY_KEYS}
          summary={summary}
          displayTotalAssets={displayTotalAssets}
          totalLiabilityAmount={totalLiabilityAmount}
          grossAssets={grossAssets}
          displayTotalProfit={displayTotalProfit}
          displayProfitRate={displayProfitRate}
          targetTotalAmount={targetTotalAmount}
          achievementRate={achievementRate}
          rebalancingAlerts={rebalancingAlerts}
          formatCurrency={formatCurrency}
          formatPercent={formatPercent}
        />

        {/* 비중 차트 + 자산 변동 추이 차트 */}
        <ChartsSection
          drillDownCategory={drillDownCategory}
          setDrillDownCategory={setDrillDownCategory}
          displayAllocation={displayAllocation}
          allocationTitle={allocationTitle}
          drillDownTotal={drillDownTotal}
          includeMap={includeMap}
          toggleInclude={toggleInclude}
          ASSET_META={ASSET_META}
          ASSET_COLORS={ASSET_COLORS}
          DRILLDOWN_COLORS={DRILLDOWN_COLORS}
          SUMMARY_KEYS={SUMMARY_KEYS}
          summary={summary}
          enabledAssetTypes={enabledAssetTypes}
          includedTotalAssets={includedTotalAssets}
          chartHistory={chartHistory}
          HISTORY_KEYS={HISTORY_KEYS}
          handleLegendClick={handleLegendClick}
          formatCurrency={formatCurrency}
        />

        {/* 자산별 보유현황 테이블 */}
        <AssetTable
          sortedEnabledTypes={sortedEnabledTypes}
          ASSET_META={ASSET_META}
          SUMMARY_KEYS={SUMMARY_KEYS}
          assets={assets}
          transactions={transactions}
          currentExchangeRate={currentExchangeRate}
          summary={summary}
          handleRowClick={handleRowClick}
          formatCurrency={formatCurrency}
          formatPercent={formatPercent}
        />
      </main>

      {/* Floating Action Menu */}
      {actionMenu.visible && actionMenu.asset && (
        <div
          className="absolute z-[100] bg-white rounded-lg shadow-xl border border-slate-200 p-2 flex gap-2"
          style={{ top: actionMenu.y, left: actionMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/entry?tab=${actionMenu.assetType}&action=buy&name=${encodeURIComponent(actionMenu.asset.name)}&symbol=${encodeURIComponent(actionMenu.asset.symbol || '')}&region=${actionMenu.asset.region || 'KR'}&investmentCountry=${actionMenu.asset.investmentCountry || actionMenu.asset.region || 'KR'}&account=${encodeURIComponent(actionMenu.asset.account || '일반')}`}
            className="px-4 py-2 text-sm font-bold rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            매수
          </Link>
          <Link
            href={`/entry?tab=${actionMenu.assetType}&action=sell&name=${encodeURIComponent(actionMenu.asset.name)}&symbol=${encodeURIComponent(actionMenu.asset.symbol || '')}&region=${actionMenu.asset.region || 'KR'}&investmentCountry=${actionMenu.asset.investmentCountry || actionMenu.asset.region || 'KR'}&account=${encodeURIComponent(actionMenu.asset.account || '일반')}`}
            className="px-4 py-2 text-sm font-bold rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            매도
          </Link>
        </div>
      )}

      {/* AI 어드바이저 챗봇 임시 비활성화 */}
      {/* <AiAdvisor /> */}
    </div>
  );
}
