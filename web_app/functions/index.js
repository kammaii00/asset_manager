import { onSchedule } from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import { default as YahooFinance } from "yahoo-finance2";

admin.initializeApp();
const db = admin.firestore();

// 매일 오전 7시 국내외 증시 브리핑 생성 (투자일기 공용 시황)
export { generateDailyBriefing } from "./briefing.js";

// 매월 1일 종목마스터(DART 고유번호 ↔ 종목코드) 갱신 — 종목분석의 선행 데이터
export { syncStockMasterMonthly } from "./analysis/stockMaster.js";

let priceCache = {};
const getCachedQuote = async (symbol) => {
    if (priceCache[symbol]) {
        return priceCache[symbol];
    }
    const yf = new YahooFinance();
    const data = await yf.quote(symbol);
    if (!data || !data.regularMarketPrice) {
        throw new Error(`No price data for ${symbol}`);
    }
    priceCache[symbol] = data;
    return data;
};

/**
 * users/{uid}/assets 하위 문서만 대상으로 일일 스냅샷을 기록한다.
 * (루트 assets 컬렉션은 사용하지 않음 — 마이그레이션 스크립트로 users 경로로 이전할 것)
 */
export const takeDailySnapshot = onSchedule({
    schedule: "30 23 * * *", // 매일 23시 30분에 실행
    timeZone: "Asia/Seoul",
    memory: "256MiB",
    timeoutSeconds: 300
}, async (event) => {
    try {
        console.log("Starting daily asset snapshot (per-user)...");

        const currentDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();
        const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        const currentDayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

        priceCache = {};

        let exchangeRate = 1400;
        try {
            const quote = await getCachedQuote('KRW=X');
            if (quote && quote.regularMarketPrice) {
                exchangeRate = quote.regularMarketPrice;
            }
        } catch (e) {
            console.error('Failed to fetch exchange rate for history:', e);
        }

        const assetsSnap = await db.collectionGroup('assets').get();
        const byUid = new Map();
        for (const d of assetsSnap.docs) {
            const parts = d.ref.path.split('/');
            if (parts.length < 4 || parts[0] !== 'users' || parts[2] !== 'assets') {
                continue;
            }
            const uid = parts[1];
            if (!byUid.has(uid)) byUid.set(uid, []);
            byUid.get(uid).push(d);
        }

        if (byUid.size === 0) {
            console.log("No users with assets under users/{uid}/assets; nothing to snapshot.");
            return;
        }

        for (const [uid, docs] of byUid) {
            const balances = {
                stock: 0,
                pension: 0,
                cash: 0,
                real_estate: 0,
                gold: 0,
                crypto: 0,
                car: 0,
                liability: 0
            };
            const fetchFailures = [];

            const batchSize = 10;
            for (let i = 0; i < docs.length; i += batchSize) {
                const chunk = docs.slice(i, i + batchSize);
                await Promise.all(chunk.map(async (docSnap) => {
                    const asset = docSnap.data();
                    if (asset.type === 'liability') {
                        const value = asset.quantity * (asset.avgPrice || 0) * (asset.region === 'US' ? exchangeRate : 1);
                        balances['liability'] += value;
                        return;
                    } else if (asset.type === 'real_estate') {
                        const currentPrice = asset.realEstateCurrentPrice || asset.avgPrice || 0;
                        const value = (currentPrice - (asset.deposit || 0)) * (asset.region === 'US' ? exchangeRate : 1);
                        balances['real_estate'] += value;
                        return;
                    } else if (asset.type === 'gold') {
                        try {
                            const [goldQuote, krwQuote] = await Promise.all([
                                getCachedQuote('GC=F'),
                                getCachedQuote('KRW=X')
                            ]);
                            const pricePerOz = goldQuote.regularMarketPrice;
                            const exchangeRateVal = krwQuote.regularMarketPrice;
                            const pricePerDon = (pricePerOz * exchangeRateVal) / 8.29426;
                            balances['gold'] += asset.quantity * pricePerDon;
                        } catch (e) {
                            fetchFailures.push(`gold(GC=F): ${e.message}`);
                            const fallbackPrice = asset.goldCurrentPrice || asset.avgPrice || 0;
                            balances['gold'] += asset.quantity * fallbackPrice;
                        }
                        return;
                    } else if (asset.type === 'car') {
                        balances['car'] += asset.quantity * (asset.avgPrice || 0);
                        return;
                    }

                    let currentPrice = asset.avgPrice || 0;
                    let priceFetched = false;

                    if ((asset.type === 'stock' || asset.type === 'pension' || asset.type === 'crypto') && asset.symbol) {
                        let querySymbol = asset.symbol;
                        if (asset.type === 'crypto') {
                            if (!querySymbol.includes('-') && !querySymbol.includes('=')) {
                                querySymbol = querySymbol + (asset.region === 'US' ? '-USD' : '-KRW');
                            }
                        } else if (asset.region === 'KR' && !querySymbol.includes('.')) {
                            querySymbol = querySymbol + '.KS';
                        }

                        try {
                            const quote = await getCachedQuote(querySymbol);
                            currentPrice = quote.regularMarketPrice;
                            priceFetched = true;
                        } catch (error) {
                            if (asset.region === 'KR' && querySymbol.endsWith('.KS')) {
                                try {
                                    const quote = await getCachedQuote(asset.symbol + '.KQ');
                                    currentPrice = quote.regularMarketPrice;
                                    priceFetched = true;
                                } catch (e) {
                                    fetchFailures.push(`${asset.name}(${asset.symbol}): ${error.message}`);
                                }
                            } else if (asset.type === 'crypto' && asset.region !== 'US' && querySymbol.endsWith('-KRW')) {
                                try {
                                    const fallbackQuery = asset.symbol + '-USD';
                                    const [quote, krwQuote] = await Promise.all([
                                        getCachedQuote(fallbackQuery),
                                        getCachedQuote('KRW=X')
                                    ]);
                                    currentPrice = quote.regularMarketPrice * krwQuote.regularMarketPrice;
                                    priceFetched = true;
                                } catch (e) {
                                    fetchFailures.push(`${asset.name}(${asset.symbol}): ${error.message}`);
                                }
                            } else {
                                fetchFailures.push(`${asset.name}(${querySymbol}): ${error.message}`);
                            }
                        }
                        if (!priceFetched) {
                            console.warn(`[snapshot] Using avgPrice fallback for ${asset.name}(${asset.symbol}): ${currentPrice}`);
                        }
                    } else if (asset.type === 'cash') {
                        currentPrice = 1;
                        if (asset.region === 'US') {
                            try {
                                const quote = await getCachedQuote('KRW=X');
                                currentPrice = quote.regularMarketPrice;
                            } catch (e) {
                                fetchFailures.push(`KRW=X: ${e.message}`);
                            }
                        }
                    }

                    const value = asset.quantity * currentPrice * (asset.region === 'US' && asset.type !== 'cash' ? exchangeRate : 1);
                    balances[asset.type] += value;
                }));
            }

            if (fetchFailures.length > 0) {
                console.error(`[snapshot] ${uid} price fetch failures (${fetchFailures.length}):`, fetchFailures.join(', '));
            }

            const totalValue = Object.entries(balances).reduce((sum, [type, val]) => {
                return type === 'liability' ? sum - (val || 0) : sum + (val || 0);
            }, 0);

            const currentBaseSnapshot = {
                stockValue: balances.stock || 0,
                cashValue: balances.cash || 0,
                pensionValue: balances.pension || 0,
                realEstateValue: balances.real_estate || 0,
                goldValue: balances.gold || 0,
                cryptoValue: balances.crypto || 0,
                carValue: balances.car || 0,
                liabilityValue: balances.liability || 0,
                totalValue: totalValue,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const currentMonthlySnapshot = { ...currentBaseSnapshot, month: currentMonthStr };
            const currentDailySnapshot = { ...currentBaseSnapshot, date: currentDayStr };

            await db.collection('users').doc(uid).collection('monthly_snapshots').doc(currentMonthStr).set(currentMonthlySnapshot, { merge: true });
            await db.collection('users').doc(uid).collection('daily_snapshots').doc(currentDayStr).set(currentDailySnapshot, { merge: true });

            console.log(`Snapshot OK for user ${uid} on ${currentDayStr}`);
        }

        console.log(`Successfully completed daily snapshot for ${currentDayStr}`);
    } catch (error) {
        console.error('Error recording daily snapshot:', error);
    }
});
