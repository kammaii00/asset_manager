'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAssetStore from '@/store/useAssetStore';
import { Wallet, Settings, CandlestickChart, PiggyBank, Banknote, Building, Gem, Bitcoin, Car, GripVertical, Plus, X, Check, ArrowLeft, PieChart, Target, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

// 앱에서 지원하는 모든 자산 유형 정의
const ALL_ASSET_TYPES = [
    { id: 'stock', icon: CandlestickChart, label: '주식', labelEn: 'Stocks', color: 'blue' },
    { id: 'crypto', icon: Bitcoin, label: '가상화폐', labelEn: 'Crypto', color: 'cyan' },
    { id: 'cash', icon: Banknote, label: '현금', labelEn: 'Cash', color: 'green' },
    { id: 'pension', icon: PiggyBank, label: '연금', labelEn: 'Pension', color: 'purple' },
    { id: 'gold', icon: Gem, label: '금', labelEn: 'Gold', color: 'amber' },
    { id: 'real_estate', icon: Building, label: '부동산', labelEn: 'Real Estate', color: 'orange' },
    { id: 'car', icon: Car, label: '자동차', labelEn: 'Vehicle', color: 'slate' },
    { id: 'liability', icon: TrendingDown, label: '부채', labelEn: 'Liability', color: 'red' },
];

const COLOR_CLASSES = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', ring: 'ring-blue-400' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', ring: 'ring-purple-400' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', ring: 'ring-green-400' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', ring: 'ring-orange-400' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', ring: 'ring-amber-400' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', ring: 'ring-cyan-400' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300', ring: 'ring-slate-400' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', ring: 'ring-red-400' },
};

export default function SettingsPage() {
    const { enabledAssetTypes, targetAssetRatios, targetTotalAmount, cashUpdateDate, fetchSettings, updateSettings, loading, assets, isLoggedIn, user, login, logout, isPro, maxFreeAssets } = useAssetStore();
    const router = useRouter();
    const [localEnabled, setLocalEnabled] = useState([]);
    const [localRatios, setLocalRatios] = useState({});
    const [localTargetAmount, setLocalTargetAmount] = useState(0);
    const [localCashUpdateDate, setLocalCashUpdateDate] = useState('');
    const [mounted, setMounted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (enabledAssetTypes && enabledAssetTypes.length > 0) {
            setLocalEnabled([...enabledAssetTypes]);
        }
        if (targetAssetRatios) {
            setLocalRatios({ ...targetAssetRatios });
        }
        if (targetTotalAmount !== undefined) {
            setLocalTargetAmount(targetTotalAmount);
        }
        if (cashUpdateDate !== undefined) {
            setLocalCashUpdateDate(cashUpdateDate || '');
        }
    }, [enabledAssetTypes, targetAssetRatios, targetTotalAmount, cashUpdateDate]);

    const toggleAssetType = (id) => {
        setLocalEnabled(prev => {
            if (prev.includes(id)) {
                if (prev.length <= 1) return prev;
                setLocalRatios(r => ({ ...r, [id]: 0 }));
                return prev.filter(t => t !== id);
            } else {
                return [...prev, id];
            }
        });
        setSaved(false);
    };

    const handleRatioChange = (id, value) => {
        const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
        setLocalRatios(prev => ({
            ...prev,
            [id]: numValue
        }));
        setSaved(false);
    };

    const totalRatio = Object.entries(localRatios)
        .filter(([id]) => localEnabled.includes(id))
        .reduce((sum, [_, val]) => sum + val, 0);

    const handleSave = async () => {
        if (totalRatio !== 100 && localEnabled.some(id => (localRatios[id] || 0) > 0)) {
            if (!confirm(`현재 목표 비중의 합이 ${totalRatio}%입니다. 100%가 아니어도 저장하시겠습니까? (정확한 리밸런싱 조언을 위해 100% 설정을 권장합니다)`)) {
                return;
            }
        }

        setSaving(true);
        await updateSettings({
            enabledAssetTypes: localEnabled,
            targetAssetRatios: localRatios,
            targetTotalAmount: localTargetAmount,
            cashUpdateDate: localCashUpdateDate ? parseInt(localCashUpdateDate) : null
        });
        setSaving(false);
        setSaved(true);
        router.push('/');
    };

    const hasChanges =
        JSON.stringify(localEnabled.sort()) !== JSON.stringify([...(enabledAssetTypes || [])].sort()) ||
        JSON.stringify(localRatios) !== JSON.stringify(targetAssetRatios || {}) ||
        localTargetAmount !== targetTotalAmount ||
        (localCashUpdateDate || null) != (cashUpdateDate || null);

    // 로컬 데이터 개수 계산
    const localAssetCount = assets.filter(a => a.id.startsWith('local_')).length;

    if (!mounted) {
        return (
            <div className="flex bg-[#f5f7f8] min-h-screen justify-center items-center">
                <div className="text-[#0d7ff2] animate-pulse font-bold">로딩 중...</div>
            </div>
        );
    }

    return (
        <div className="bg-[#f5f7f8] min-h-screen text-slate-900 font-sans flex flex-col">
            {/* 헤더 */}
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
                        <Link href="/entry" className="text-slate-500 text-sm font-medium hover:text-[#0d7ff2] transition-colors">자산 입력</Link>
                        <Link href="/journal" className="text-slate-500 text-sm font-medium hover:text-[#0d7ff2] transition-colors">투자일기</Link>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-50 rounded-full text-[#0d7ff2]" title="설정">
                        <Settings size={22} />
                    </div>
                </div>
            </header>

            {/* 메인 콘텐츠 */}
            <main className="flex-1 w-full max-w-[800px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8 pb-32">
                {/* 뒤로가기 + 타이틀 */}
                <div className="flex items-center gap-3">
                    <Link href="/" className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black leading-tight flex items-center gap-2">
                            <Settings size={28} className="text-slate-400" />
                            설정
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">데이터 동기화 및 대시보드 표시 설정을 편집합니다.</p>
                    </div>
                </div>

                {/* Pro & Cloud Backup Integration Section (REVISED) */}
                <section className="flex flex-col gap-4">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
                        {isLoggedIn && isPro ? (
                            // 1. Pro 유저 + 로그인 상태: 안전한 백업 상태 표시
                            <div className="p-8 flex flex-col md:flex-row gap-8 items-center bg-gradient-to-br from-blue-50 to-white">
                                <div className="flex-1 text-center md:text-left">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-wider mb-3">
                                        Pro Member
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 mb-2">클라우드 백업 활성화 중</h3>
                                    <p className="text-slate-500 text-sm leading-relaxed">
                                        {user?.displayName}님, 모든 데이터가 실시간으로 안전하게 동기화되고 있습니다. 기기를 바꿔도 안심하세요!
                                    </p>
                                </div>
                                <div className="shrink-0">
                                    <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-blue-100 shadow-sm">
                                        {user?.photoURL && (
                                            <img src={user.photoURL} className="w-10 h-10 rounded-full shadow-sm" alt="profile" />
                                        )}
                                        <div className="flex flex-col pr-4">
                                            <span className="text-xs font-bold text-slate-900">{user?.displayName}</span>
                                            <span className="text-[10px] text-blue-500 font-bold">PRO ACCOUNT</span>
                                        </div>
                                        <button 
                                            onClick={logout}
                                            className="text-xs font-bold text-slate-300 hover:text-red-500 transition-colors pl-2 border-l border-slate-100"
                                        >
                                            로그아웃
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // 2. 무료 유저 (비로그인 포함): Pro 업그레이드 유도
                            <div className="flex flex-col">
                                <div className="p-8 text-center md:text-left">
                                    <h3 className="text-2xl font-black text-slate-900 mb-3">데이터 보험 & 클라우드 백업</h3>
                                    <p className="text-slate-500 text-sm leading-relaxed mb-4">
                                        현재 데이터가 브라우저에만 저장되어 있어 삭제 위험이 있습니다.<br/>
                                        **Pro 플랜**으로 업그레이드하고 로그인을 통해 데이터를 영구히 안전하게 보호하세요.
                                    </p>
                                    
                                    {localAssetCount > 0 && (
                                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-bold border border-amber-100">
                                            <AlertTriangle size={14} /> 현재 {localAssetCount}개의 소중한 자산이 위험에 노출되어 있습니다.
                                        </div>
                                    )}
                                </div>

                                <div className="bg-slate-900 p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                                    <div className="flex-1">
                                        <ul className="space-y-2">
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check size={16} className="text-blue-400" /> 실시간 클라우드 자동 백업 (로그인)
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check size={16} className="text-blue-400" /> 자산 무제한 등록 및 다중 기기 동기화
                                            </li>
                                            {/* AI 기능 임시 비활성화
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check size={16} className="text-blue-400" /> 프리미엄 AI 어드바이저 무제한 사용
                                            </li>
                                            */}
                                        </ul>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            // 1단계: Pro 업그레이드 시뮬레이션 (Phase 2 데모용)
                                            if (confirm("Pro 플랜으로 업그레이드하고 데이터를 백업하시겠습니까? (현재 데모 모드로 바로 로그인이 진행됩니다)")) {
                                                login(); // 로그인 시 자동 Pro 처리 로직 스토어에 추가 필요
                                            }
                                        }}
                                        className="px-8 py-4 bg-[#0d7ff2] hover:bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-900/20 transition-all transform active:scale-95 flex items-center gap-2"
                                    >
                                        <TrendingUp size={20} /> Pro 시작하고 데이터 백업하기
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* 자산 탭 편집 영역 */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-bold text-slate-900">내 자산 탭 편집</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            활성화된 자산만 대시보드와 자산 입력 페이지에 표시됩니다. 최소 1개 이상의 자산이 활성화되어야 합니다.
                        </p>
                    </div>

                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {ALL_ASSET_TYPES.map((assetType) => {
                            const isEnabled = localEnabled.includes(assetType.id);
                            const colorCls = COLOR_CLASSES[assetType.color];
                            const IconComp = assetType.icon;

                            return (
                                <button
                                    key={assetType.id}
                                    onClick={() => toggleAssetType(assetType.id)}
                                    className={`
                                        relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left
                                        ${isEnabled
                                            ? `${colorCls.border} ${colorCls.bg} ring-2 ${colorCls.ring} ring-opacity-30 shadow-sm`
                                            : 'border-slate-200 bg-slate-50 opacity-60 hover:opacity-80 hover:border-slate-300'
                                        }
                                    `}
                                >
                                    {/* 아이콘 */}
                                    <div className={`
                                        w-12 h-12 rounded-lg flex items-center justify-center shrink-0
                                        ${isEnabled ? `${colorCls.bg} ${colorCls.text}` : 'bg-slate-200 text-slate-400'}
                                    `}>
                                        <IconComp size={24} />
                                    </div>

                                    {/* 텍스트 */}
                                    <div className="flex flex-col flex-1">
                                        <span className={`font-bold text-base ${isEnabled ? 'text-slate-900' : 'text-slate-500'}`}>
                                            {assetType.label}
                                        </span>
                                        <span className={`text-xs ${isEnabled ? 'text-slate-500' : 'text-slate-400'}`}>
                                            {assetType.labelEn}
                                        </span>
                                    </div>

                                    {/* 토글 표시 */}
                                    <div className={`
                                        w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all
                                        ${isEnabled ? `bg-white ${colorCls.text} shadow-sm border ${colorCls.border}` : 'bg-slate-300 text-white'}
                                    `}>
                                        {isEnabled ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 목표 자산 설정 영역 (Phase 3 추가) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp size={20} className="text-green-500" />
                            목표 자산 총액 설정
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            자산 관리의 최종 목표액을 설정하세요. 대시보드에서 달성률을 확인할 수 있습니다.
                        </p>
                    </div>
                    <div className="p-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-slate-700">목표 자산 (원)</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={localTargetAmount > 0 ? localTargetAmount.toLocaleString() : ''}
                                    onChange={(e) => {
                                        const cleanValue = e.target.value.replace(/[^0-9]/g, '');
                                        setLocalTargetAmount(parseInt(cleanValue) || 0);
                                    }}
                                    placeholder="예: 1,000,000,000"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-400 transition-all text-right pr-10"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-sans">원</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                {localTargetAmount > 0 ? `(${(localTargetAmount / 100000000).toFixed(2)}억원)` : '목표 금액을 입력하세요.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 목표 자산 비중 설정 영역 (Phase 3) */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Target size={20} className="text-blue-500" />
                                리밸런싱 목표 비중 설정
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                각 자산군별 희망하는 목표 비중(%)을 설정하세요. AI가 이를 바탕으로 리밸런싱을 제안합니다.
                            </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${totalRatio === 100 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            합계: {totalRatio}%
                        </div>
                    </div>

                    <div className="p-6 flex flex-col gap-4">
                        {ALL_ASSET_TYPES.filter(t => localEnabled.includes(t.id)).map((assetType) => {
                            const colorCls = COLOR_CLASSES[assetType.color];
                            const ratio = localRatios[assetType.id] || 0;

                            return (
                                <div key={assetType.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorCls.bg} ${colorCls.text}`}>
                                        <assetType.icon size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-slate-800">{assetType.label}</div>
                                        <div className="text-[10px] text-slate-400 uppercase">{assetType.labelEn}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={ratio}
                                            onChange={(e) => handleRatioChange(assetType.id, e.target.value)}
                                            className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-lg text-right font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                                            placeholder="0"
                                            min="0"
                                            max="100"
                                        />
                                        <span className="text-slate-400 font-medium">%</span>
                                    </div>
                                </div>
                            );
                        })}

                        {localEnabled.length === 0 && (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                활성화된 자산이 없습니다. 위에서 자산 탭을 먼저 선택해주세요.
                            </div>
                        )}
                    </div>

                    {totalRatio !== 100 && (
                        <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-700 flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center font-bold">!</span>
                            정확한 리밸런싱 조언을 위해 비중 합계를 100%로 맞추는 것을 권장합니다.
                        </div>
                    )}
                </div>

                {/* 현금 자산 최신화 알림 설정 */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Banknote size={20} className="text-emerald-500" />
                            현금 자산 최신화 알림 기준일
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            매월 현금 자산을 최신화할 날짜(예: 월급날)를 지정하세요. 해당 일자가 되면 대시보드에서 알림을 띄워드립니다.
                        </p>
                    </div>
                    <div className="p-6 flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-700">매월 알림 일자 (1~31)</label>
                        <div className="relative">
                            <input
                                type="number"
                                min="1"
                                max="31"
                                value={localCashUpdateDate}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || (parseInt(val) >= 1 && parseInt(val) <= 31)) {
                                        setLocalCashUpdateDate(val);
                                    }
                                }}
                                placeholder="예: 21"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-all text-right pr-10"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-sans">일</span>
                        </div>
                        <div className="flex gap-2 mt-2 flex-wrap">
                            <button onClick={() => setLocalCashUpdateDate('10')} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors">매월 10일</button>
                            <button onClick={() => setLocalCashUpdateDate('21')} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors">매월 21일</button>
                            <button onClick={() => setLocalCashUpdateDate('25')} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors">매월 25일</button>
                            <button onClick={() => setLocalCashUpdateDate('')} className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-500 transition-colors ml-auto">알림 끄기</button>
                        </div>
                    </div>
                </div>

                {/* 안내 메시지 */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold">i</span>
                    </div>
                    <div className="text-sm text-blue-800">
                        <p className="font-semibold mb-1">안내</p>
                        <p className="text-blue-700">
                            비활성화한 자산의 데이터가 삭제되지는 않습니다.
                            다시 활성화하면 기존 데이터가 그대로 표시됩니다.
                        </p>
                    </div>
                </div>
            </main>

            {/* 하단 고정 저장 버튼 */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <div className="max-w-[800px] mx-auto flex items-center justify-between">
                    <div className="flex flex-col">
                        <p className="text-xs text-slate-400">
                            {localEnabled.length}개 자산 탭 활성화됨
                        </p>
                        <p className="text-xs font-bold text-slate-600">
                            목표 비중 합계: {totalRatio}%
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {saved && (
                            <span className="text-sm text-green-600 font-medium flex items-center gap-1 animate-pulse">
                                <Check size={16} /> 저장 완료!
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saving || !hasChanges}
                            className={`
                                px-8 py-3 rounded-xl font-bold text-base transition-all
                                ${hasChanges
                                    ? 'bg-[#0d7ff2] hover:bg-blue-600 text-white shadow-md active:scale-95'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                }
                            `}
                        >
                            {saving ? '저장 중...' : '설정 저장하기'}
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
