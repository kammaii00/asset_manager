import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const useAssetStore = create(
    persist(
        (set, get) => ({
            assets: [],
            history: [],
            dailyHistory: [],
            transactions: [],
            allTransactionsLoaded: false,
            accountTypes: [],
            cashInstitutions: [],
            savedStockItems: [],
            savedPensionItems: [],
            savedCryptoItems: [],
            enabledAssetTypes: ['stock', 'crypto', 'cash', 'pension', 'gold', 'real_estate', 'car', 'liability'],
            isPro: false, // 유료 구독 여부
            isLoggedIn: false, // 로그인 여부
            user: null, // 유저 정보
            maxFreeAssets: 5, // 무료 유저 최대 자산 개수
            aiUsageCount: 0, // AI 사용 횟수 (오늘)
            preferredIncludeMap: {}, // 대시보드 포함/불포함 설정값 (로컬 저장용)
            targetAssetRatios: {},  // 목표 자산 비중 (Phase 3)
            targetTotalAmount: 0,   // 목표 자산 총액 (Phase 3 추가)
            cashUpdateDate: null,   // 현금 최신화 알림 기준일 (Phase 3 추가)
            loading: false,
            error: null,

            // 인증 헤더 가져오기 헬퍼
            // onAuthStateChanged Promise 래핑으로 세션 복원이 완료될 때까지 안전하게 대기
            getAuthHeaders: async () => {
                const headers = { 'Content-Type': 'application/json' };
                const user = await new Promise((resolve) => {
                    const unsubscribe = onAuthStateChanged(auth, (u) => {
                        unsubscribe();
                        resolve(u);
                    });
                });
                if (user) {
                    const token = await user.getIdToken();
                    headers['Authorization'] = `Bearer ${token}`;
                }
                return headers;
            },

            // 인증 관련 액션
            login: async () => {
                try {
                    set({ loading: true });
                    const result = await signInWithPopup(auth, googleProvider);
                    const user = result.user;
                    
                    // 로그인 성공 시 Pro 상태로 승격 (사용자 요청: 로그인 = Pro 백업 전용)
                    set({ user, isLoggedIn: true, isPro: true, loading: false });
                    
                    // 로그인 성공 시 로컬 데이터를 서버로 마이그레이션 시도
                    await get().syncWithCloud(user.uid);
                    await get().fetchAssets();
                } catch (error) {
                    set({ error: error.message, loading: false });
                    console.error("Login failed:", error);
                }
            },

            logout: async () => {
                try {
                    await signOut(auth);
                    // 로그아웃 시 모든 데이터 및 Pro 상태 초기화
                    set({ 
                        user: null, 
                        isLoggedIn: false, 
                        isPro: false, 
                        assets: [], 
                        transactions: [], 
                        history: [], 
                        dailyHistory: [] 
                    });
                } catch (error) {
                    console.error("Logout failed:", error);
                }
            },

            // 인증 상태 초기화
            initAuth: () => {
                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        // 기존 로그인 유저라면 Pro 상태 유지
                        set({ user, isLoggedIn: true, isPro: true });
                    } else {
                        set({ user: null, isLoggedIn: false, isPro: false });
                    }
                });
            },

            // 로컬 데이터를 클라우드로 마이그레이션 (동기화 엔진)
            syncWithCloud: async (uid) => {
                const state = get();
                const localAssets = state.assets.filter(a => a.id.startsWith('local_'));
                
                if (localAssets.length === 0) return;

                console.log(`Syncing ${localAssets.length} local assets to cloud for user ${uid}...`);
                
                try {
                    const headers = await get().getAuthHeaders();
                    // 순차적으로 로컬 자산을 서버로 전송
                    for (const asset of localAssets) {
                        const res = await fetch('/api/assets', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(asset),
                        });
                        if (!res.ok) console.warn(`Failed to sync asset: ${asset.name}`);
                    }
                    
                    // 동기화 완료 후 로컬 데이터 제거 (서버에서 다시 불러올 예정)
                    set(prev => ({
                        assets: prev.assets.filter(a => !a.id.startsWith('local_')),
                        transactions: prev.transactions.filter(t => !t.id.startsWith('tx_'))
                    }));
                    
                    await get().fetchAssets();
                    await get().fetchTransactions();
                    
                    console.log("Cloud sync completed and local data cleaned up!");
                } catch (error) {
                    console.error("Cloud sync failed:", error);
                }
            },

            fetchAssets: async () => {
                const state = get();
                if (state.loading) return; 
                
                set({ loading: true, error: null });
                try {
                    const headers = await get().getAuthHeaders();

                    const res = await fetch('/api/assets', { headers });
                    if (!res.ok) throw new Error('Failed to fetch assets');
                    const data = await res.json();
                    
                    // ... (rest of the logic remains the same)

                    // Generate savedStockItems and savedPensionItems from existing assets if not exist
                    const currentState = get();
                    const currentStockItems = [...(currentState.savedStockItems || [])];
                    const currentPensionItems = [...(currentState.savedPensionItems || [])];
                    let hasNewStockItem = false;
                    let hasNewPensionItem = false;
                    const updatePayload = {};

                    data.forEach(asset => {
                        if (asset.type === 'stock' && asset.symbol && asset.name) {
                            const exists = currentStockItems.some(i => i.symbol === asset.symbol && i.name === asset.name);
                            if (!exists) {
                                currentStockItems.push({ symbol: asset.symbol, name: asset.name });
                                hasNewStockItem = true;
                            }
                        } else if (asset.type === 'pension' && asset.symbol && asset.name) {
                            const exists = currentPensionItems.some(i => i.symbol === asset.symbol && i.name === asset.name);
                            if (!exists) {
                                currentPensionItems.push({ symbol: asset.symbol, name: asset.name });
                                hasNewPensionItem = true;
                            }
                        } else if (asset.type === 'crypto' && asset.symbol && asset.name) {
                            const exists = (currentState.savedCryptoItems || []).some(i => i.symbol === asset.symbol && i.name === asset.name);
                            if (!exists) {
                                if (!updatePayload.savedCryptoItems) updatePayload.savedCryptoItems = [...(currentState.savedCryptoItems || [])];
                                const payloadExists = updatePayload.savedCryptoItems.some(i => i.symbol === asset.symbol && i.name === asset.name);
                                if (!payloadExists) {
                                    updatePayload.savedCryptoItems.push({ symbol: asset.symbol, name: asset.name });
                                }
                            }
                        }
                    });

                    if (hasNewStockItem || hasNewPensionItem || updatePayload.savedCryptoItems) {
                        if (hasNewStockItem) updatePayload.savedStockItems = currentStockItems;
                        if (hasNewPensionItem) updatePayload.savedPensionItems = currentPensionItems;

                        // 비동기로 설정 저장 (메인 로직 흐름 방해 안함)
                        fetch('/api/settings', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(updatePayload)
                        }).catch(err => console.error("Failed to update settings silently", err));
                        
                        set({ 
                            ...(hasNewStockItem && { savedStockItems: currentStockItems }),
                            ...(hasNewPensionItem && { savedPensionItems: currentPensionItems }),
                            ...(updatePayload.savedCryptoItems && { savedCryptoItems: updatePayload.savedCryptoItems })
                        });
                    }

                    set({ assets: data, loading: false });
                } catch (error) {
                    set({ error: error.message, loading: false });
                }
            },

            addAsset: async (assetData) => {
                const state = get();
                
                // 무료 유저 개수 제한 체크
                if (!state.isPro && state.assets.length >= state.maxFreeAssets) {
                    throw new Error(`무료 플랜은 최대 ${state.maxFreeAssets}개의 자산만 등록할 수 있습니다. 무제한 등록을 위해 Pro로 업그레이드하세요!`);
                }

                set({ loading: true, error: null });
                
                // 비로그인 시 로컬에만 저장
                if (!state.isLoggedIn) {
                    const newAsset = {
                        ...assetData,
                        id: `local_${Date.now()}`,
                        totalValue: (assetData.quantity || 0) * (assetData.currentPrice || assetData.avgPrice || 0),
                        profitGain: 0,
                        profitRate: 0,
                        principal: (assetData.quantity || 0) * (assetData.avgPrice || 0)
                    };
                    const updatedAssets = [...state.assets, newAsset];
                    set({ assets: updatedAssets, loading: false });
                    
                    // 트랜잭션도 로컬 기록 (간소화)
                    const newTx = { id: `tx_${Date.now()}`, asset_id: newAsset.id, ...assetData, date: new Date().toISOString().split('T')[0] };
                    set({ transactions: [newTx, ...state.transactions] });
                    return;
                }

                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch('/api/assets', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(assetData),
                    });
                    if (!res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.error || 'Failed to process transaction');
                    }
                    set({ loading: false });
                    await get().fetchAssets();
                    await get().fetchTransactions();
                } catch (error) {
                    set({ error: error.message, loading: false });
                    throw error;
                }
            },

            deleteTransaction: async (id) => {
                set({ loading: true, error: null });
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/transactions/${id}`, {
                        method: 'DELETE',
                        headers
                    });
                    if (!res.ok) throw new Error('Failed to delete transaction');
                    set({ loading: false });
                    await get().fetchAssets();
                    await get().fetchTransactions();
                } catch (error) {
                    set({ error: error.message, loading: false });
                    throw error;
                }
            },

            deleteAsset: async (id) => {
                set({ loading: true, error: null });
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/assets/${id}`, {
                        method: 'DELETE',
                        headers
                    });
                    if (!res.ok) throw new Error('Failed to delete asset');
                    set({ loading: false });
                    await get().fetchAssets();
                    await get().fetchTransactions();
                } catch (error) {
                    set({ error: error.message, loading: false });
                    throw error;
                }
            },

            updateTransaction: async (id, updatedData) => {
                set({ loading: true, error: null });
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/transactions/${id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(updatedData),
                    });
                    if (!res.ok) throw new Error('Failed to update transaction');
                    set({ loading: false });
                    await get().fetchAssets();
                    await get().fetchTransactions();
                } catch (error) {
                    set({ error: error.message, loading: false });
                    throw error;
                }
            },

            updateAsset: async (id, updatedData) => {
                set({ loading: true, error: null });
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/assets/${id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(updatedData),
                    });
                    if (!res.ok) throw new Error('Failed to update asset');
                    set({ loading: false });
                    await get().fetchAssets();
                    await get().fetchTransactions();
                } catch (error) {
                    set({ error: error.message, loading: false });
                    throw error;
                }
            },

            fetchHistory: async () => {
                try {
                    const headers = await get().getAuthHeaders();
                    const [monthlyRes, dailyRes] = await Promise.all([
                        fetch('/api/history?type=monthly', { headers }),
                        fetch('/api/history?type=daily', { headers })
                    ]);
                    let historyData = [];
                    let dailyHistoryData = [];
                    if (monthlyRes.ok) historyData = await monthlyRes.json();
                    if (dailyRes.ok) dailyHistoryData = await dailyRes.json();

                    set({ history: historyData, dailyHistory: dailyHistoryData });
                } catch (error) {
                    console.error(error);
                }
            },

            fetchTransactions: async (forceAll = false) => {
                try {
                    const headers = await get().getAuthHeaders();
                    const shouldLoadAll = forceAll || get().allTransactionsLoaded;
                    const limit = shouldLoadAll ? 'all' : '20';
                    const txRes = await fetch(`/api/transactions?limit=${limit}`, { headers });
                    if (!txRes.ok) throw new Error('Failed to fetch transactions');
                    const data = await txRes.json();
                    set({ transactions: data, allTransactionsLoaded: shouldLoadAll });
                } catch (error) {
                    console.error(error);
                }
            },

            fetchSettings: async () => {
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch('/api/settings', { headers });
                    if (!res.ok) throw new Error('Failed to fetch settings');
                    const data = await res.json();
                    set({
                        accountTypes: data.accountTypes || ['키움증권', 'NH투자증권', '미래에셋', 'IRP', 'ISA', '일반'],
                        cashInstitutions: data.cashInstitutions || ['NH투자증권', '토스뱅크', '카카오뱅크', 'KB국민은행', '신한은행'],
                        savedStockItems: data.savedStockItems || [],
                        savedPensionItems: data.savedPensionItems || [],
                        savedCryptoItems: data.savedCryptoItems || [],
                        enabledAssetTypes: (() => {
                            let types = data.enabledAssetTypes || ['stock', 'pension', 'cash', 'real_estate', 'gold', 'crypto', 'car', 'liability'];
                            // Force append crypto, car, liability if they are entirely missing from a legacy user's config
                            if (!data.hasMigratedV2) {
                                if (!types.includes('crypto')) types.push('crypto');
                                if (!types.includes('car')) types.push('car');
                                if (!types.includes('liability')) types.push('liability');
                            }
                            return [...new Set(types)];
                        })(),
                        targetAssetRatios: data.targetAssetRatios || {},
                        targetTotalAmount: data.targetTotalAmount || 0,
                        cashUpdateDate: data.cashUpdateDate || null,
                    });
                } catch (error) {
                    console.error('Failed to load settings:', error);
                }
            },

            updateSettings: async (newSettings) => {
                try {
                    const headers = await get().getAuthHeaders();
                    const settingsToSave = { ...newSettings, hasMigratedV2: true };
                    // Optimistically update local state
                    set((state) => ({ ...state, ...settingsToSave }));

                    const res = await fetch('/api/settings', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(settingsToSave),
                    });
                    if (!res.ok) throw new Error('Failed to update settings');
                } catch (error) {
                    console.error('Failed to save settings:', error);
                    // Revert might be needed here ideally, but for now we log it.
                }
            },

            setPreferredIncludeMap: (includeMap) => {
                set({ preferredIncludeMap: includeMap });
            },

            journals: [],          // 투자일기 목록 (최근순)
            todayJournal: null,    // 오늘의 시황 카드 + 메모
            journalLoading: false,

            // 오늘의 AI 시황 카드 조회(없으면 서버가 지연 생성). refresh=true면 강제 재생성
            fetchTodayJournal: async (refresh = false) => {
                set({ journalLoading: true });
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/journal/today${refresh ? '?refresh=1' : ''}`, { headers });
                    if (!res.ok) throw new Error('Failed to fetch today journal');
                    const data = await res.json();
                    set({ todayJournal: data, journalLoading: false });
                    return data;
                } catch (error) {
                    set({ journalLoading: false });
                    console.error(error);
                    return null;
                }
            },

            // 투자일기 목록 조회
            fetchJournals: async (limit = 30) => {
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/journal?limit=${limit}`, { headers });
                    if (!res.ok) throw new Error('Failed to fetch journals');
                    const data = await res.json();
                    set({ journals: data });
                    return data;
                } catch (error) {
                    console.error(error);
                    return [];
                }
            },

            // 특정 날짜의 주관 메모(매매 이유·감정·공부) 저장
            saveJournalNote: async ({ date, text, emotion }) => {
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch('/api/journal', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ date, text, emotion }),
                    });
                    if (!res.ok) throw new Error('Failed to save journal note');
                    const saved = await res.json();
                    // 로컬 상태 동기화
                    set((state) => ({
                        todayJournal: state.todayJournal?.date === date
                            ? { ...state.todayJournal, userNote: saved.userNote }
                            : state.todayJournal,
                        journals: (() => {
                            const exists = state.journals.some((j) => j.date === date);
                            if (exists) {
                                return state.journals.map((j) => j.date === date ? { ...j, userNote: saved.userNote } : j);
                            }
                            return [{ id: date, date, userNote: saved.userNote }, ...state.journals];
                        })(),
                    }));
                    return saved;
                } catch (error) {
                    console.error(error);
                    throw error;
                }
            },

            // 특정 날짜의 주관 메모 삭제
            deleteJournalNote: async (date) => {
                try {
                    const headers = await get().getAuthHeaders();
                    const res = await fetch(`/api/journal?date=${date}`, { method: 'DELETE', headers });
                    if (!res.ok) throw new Error('Failed to delete journal note');
                    // 로컬 상태 동기화: 메모 제거, 시황·메모 둘 다 없으면 목록에서 제외
                    set((state) => ({
                        todayJournal: state.todayJournal?.date === date
                            ? { ...state.todayJournal, userNote: null }
                            : state.todayJournal,
                        journals: state.journals
                            .map((j) => (j.date === date ? { ...j, userNote: null } : j))
                            .filter((j) => j.userNote || j.aiContext),
                    }));
                } catch (error) {
                    console.error(error);
                    throw error;
                }
            },

            getSummary: (exchangeRate = 1400) => {
                const { assets } = get();

                const convert = (val, asset) => (asset.region === 'US' && asset.type !== 'cash' ? (val || 0) * exchangeRate : (val || 0));

                // overall
                const totalAssets = assets.reduce((sum, a) => a.type !== 'liability' ? sum + convert(a.totalValue, a) : sum, 0);
                const totalPrincipal = assets.reduce((sum, a) => a.type !== 'liability' ? sum + convert(a.netInvestment !== undefined ? a.netInvestment : a.principal, a) : sum, 0);
                const totalProfit = assets.reduce((sum, a) => a.type !== 'liability' ? sum + convert(a.profitGain, a) : sum, 0);
                const profitRate = totalPrincipal > 0 ? (totalProfit / totalPrincipal) * 100 : 0;
                const dayChange = assets.reduce((sum, a) => a.type !== 'liability' ? sum + convert(a.dayChange, a) : sum, 0);

                // stock
                const stockAssets = assets.filter(a => a.type === 'stock');
                const totalStock = stockAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const stockPrincipal = stockAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const stockProfit = totalStock - stockPrincipal;
                const stockRate = stockPrincipal > 0 ? (stockProfit / stockPrincipal) * 100 : 0;

                // pension
                const pensionAssets = assets.filter(a => a.type === 'pension');
                const totalPension = pensionAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const pensionPrincipal = pensionAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const pensionProfit = totalPension - pensionPrincipal;
                const pensionRate = pensionPrincipal > 0 ? (pensionProfit / pensionPrincipal) * 100 : 0;

                // cash
                const cashAssets = assets.filter(a => a.type === 'cash');
                const totalCash = cashAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const cashPrincipal = cashAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const cashProfit = totalCash - cashPrincipal;
                const cashRate = cashPrincipal > 0 ? (cashProfit / cashPrincipal) * 100 : 0;

                // real_estate
                const realEstateAssets = assets.filter(a => a.type === 'real_estate');
                const totalRealEstate = realEstateAssets.reduce((sum, a) => sum + convert((a.netInvestment || 0) + (a.profitGain || 0), a), 0);
                const realEstatePrincipal = realEstateAssets.reduce((sum, a) => sum + convert(a.netInvestment || 0, a), 0);
                const realEstateProfit = realEstateAssets.reduce((sum, a) => sum + convert(a.profitGain || 0, a), 0);
                const realEstateRate = realEstatePrincipal > 0 ? (realEstateProfit / realEstatePrincipal) * 100 : 0;

                // gold
                const goldAssets = assets.filter(a => a.type === 'gold');
                const totalGold = goldAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const goldPrincipal = goldAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const goldProfit = totalGold - goldPrincipal;
                const goldRate = goldPrincipal > 0 ? (goldProfit / goldPrincipal) * 100 : 0;

                // crypto
                const cryptoAssets = assets.filter(a => a.type === 'crypto');
                const totalCrypto = cryptoAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const cryptoPrincipal = cryptoAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const cryptoProfit = totalCrypto - cryptoPrincipal;
                const cryptoRate = cryptoPrincipal > 0 ? (cryptoProfit / cryptoPrincipal) * 100 : 0;

                // car
                const carAssets = assets.filter(a => a.type === 'car');
                const totalCar = carAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const carPrincipal = carAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const carProfit = totalCar - carPrincipal;
                const carRate = carPrincipal > 0 ? (carProfit / carPrincipal) * 100 : 0;

                // liability
                const liabilityAssets = assets.filter(a => a.type === 'liability');
                const totalLiability = liabilityAssets.reduce((sum, a) => sum + convert(a.totalValue, a), 0);
                const liabilityPrincipal = liabilityAssets.reduce((sum, a) => sum + convert(a.principal, a), 0);
                const liabilityProfit = totalLiability - liabilityPrincipal;
                const liabilityRate = liabilityPrincipal > 0 ? (liabilityProfit / liabilityPrincipal) * 100 : 0;

                return {
                    totalAssets, totalPrincipal, totalProfit, profitRate, dayChange,
                    totalStock, stockProfit, stockRate, stockPrincipal,
                    totalPension, pensionProfit, pensionRate, pensionPrincipal,
                    totalCash, cashProfit, cashRate, cashPrincipal,
                    totalRealEstate, realEstateProfit, realEstateRate, realEstatePrincipal,
                    totalGold, goldProfit, goldRate, goldPrincipal,
                    totalCrypto, cryptoProfit, cryptoRate, cryptoPrincipal,
                    totalCar, carProfit, carRate, carPrincipal,
                    totalLiability, liabilityProfit, liabilityRate, liabilityPrincipal
                };
            },
        }),
        {
            name: 'asset-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                assets: state.assets,
                history: state.history,
                dailyHistory: state.dailyHistory,
                transactions: state.transactions.slice(0, 50), // Cache only latest 50 for speed
                accountTypes: state.accountTypes,
                cashInstitutions: state.cashInstitutions,
                savedStockItems: state.savedStockItems,
                savedPensionItems: state.savedPensionItems,
                savedCryptoItems: state.savedCryptoItems,
                enabledAssetTypes: state.enabledAssetTypes,
                preferredIncludeMap: state.preferredIncludeMap,
                targetAssetRatios: state.targetAssetRatios,
                targetTotalAmount: state.targetTotalAmount,
                cashUpdateDate: state.cashUpdateDate
            }),
        }
    )
);

export default useAssetStore;
