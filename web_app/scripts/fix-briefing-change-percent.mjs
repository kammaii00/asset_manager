/**
 * 기존 시황 문서의 지수 등락률(`indices[].changePercent`, `sentiment.changePercent`) 재계산
 *
 * 07시 브리핑은 야후 quote의 전일종가로 등락률을 계산했는데, ^KQ11(코스닥)은 그 값이
 * 며칠 전 종가에 머물러 있는 날이 있어 실제 +0.39%가 +7.39%로 저장된 사례가 있었다.
 * 함수는 일별 종가 시계열로 계산하도록 고쳤고(2026-08-13), 이 스크립트는 그 이전 문서를 바로잡는다.
 *
 * 각 문서의 `marketDate`(데이터 기준일) 종가와 그 직전 거래일 종가로 다시 계산한다.
 * 환율(KRW=X)은 야후 일별 봉이 불규칙해(금요일 봉 결측) 시계열로 검증할 수 없어 건드리지 않는다.
 *
 * 사용 (web_app 디렉터리에서):
 *   node scripts/fix-briefing-change-percent.mjs            # 미리보기(쓰기 없음)
 *   node scripts/fix-briefing-change-percent.mjs --apply    # 실제 반영
 *
 * 필요 환경: .env.local 의 FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';
import { default as YahooFinance } from 'yahoo-finance2';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 을 읽어 환경변수로 주입 (기존 마이그레이션 스크립트와 동일한 방식)
function loadEnvLocal() {
    const p = join(__dirname, '..', '.env.local');
    if (!existsSync(p)) return;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

loadEnvLocal();

const apply = process.argv.includes('--apply');

if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error('FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY 가 필요합니다 (.env.local).');
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'asset-master-jwpark',
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// 시황에 저장된 이름 → 야후 심볼 (원/달러는 일별 봉이 불규칙해 제외)
const SYMBOL_BY_NAME = {
    '코스피': '^KS11',
    '코스닥': '^KQ11',
    '나스닥': '^IXIC',
    'S&P500': '^GSPC',
};
const VIX_SYMBOL = '^VIX';
const EPSILON = 0.02; // 반올림 오차는 수정 대상으로 보지 않는다

// 심볼별 [날짜, 종가] 배열 조회
async function loadSeries(symbol, from) {
    const chart = await yf.chart(symbol, { period1: from, interval: '1d' });
    return (chart?.quotes || [])
        .filter((q) => q?.close != null)
        .map((q) => [q.date.toISOString().slice(0, 10), q.close]);
}

// 기준일 종가와 직전 거래일 종가로 등락률 재계산 (시계열에 기준일이 없으면 null)
function recalc(series, marketDate) {
    const i = series.findIndex(([date]) => date === marketDate);
    if (i < 1) return null;
    const [, price] = series[i];
    const [, prev] = series[i - 1];
    return { price: Number(price.toFixed(2)), changePercent: Number((((price - prev) / prev) * 100).toFixed(2)) };
}

async function run() {
    const snap = await db.collection('market_briefings').orderBy('date').get();
    if (snap.empty) {
        console.log('market_briefings 에 문서가 없습니다.');
        return;
    }

    // 가장 이른 기준일보다 여유 있게 앞에서부터 시세를 받아 직전 거래일까지 확보한다
    const dates = snap.docs.map((d) => d.data().marketDate || d.id).sort();
    const from = new Date(new Date(`${dates[0]}T00:00:00Z`).getTime() - 14 * 24 * 60 * 60 * 1000);

    const series = {};
    for (const [name, symbol] of Object.entries(SYMBOL_BY_NAME)) {
        series[name] = await loadSeries(symbol, from);
    }
    const vixSeries = await loadSeries(VIX_SYMBOL, from);

    const updates = [];
    let fixedCount = 0;

    for (const doc of snap.docs) {
        const data = doc.data();
        const marketDate = data.marketDate;
        if (!marketDate) {
            console.warn(`[warn] ${doc.id}: marketDate 가 없어 건너뜁니다.`);
            continue;
        }

        const patch = {};
        const nextIndices = (data.indices || []).map((idx) => {
            const s = series[idx.name];
            if (!s) return idx; // 원/달러 등 검증 대상 외
            const fixed = recalc(s, marketDate);
            if (!fixed) {
                console.warn(`[warn] ${doc.id} ${idx.name}: ${marketDate} 종가를 찾지 못해 건너뜁니다.`);
                return idx;
            }
            if (idx.price != null && Math.abs(idx.price - fixed.price) > EPSILON) {
                console.warn(`[warn] ${doc.id} ${idx.name}: 저장된 종가 ${idx.price} ≠ 실제 ${fixed.price} — 종가도 함께 보정합니다.`);
            }
            const sameChange = Math.abs((idx.changePercent ?? 0) - fixed.changePercent) <= EPSILON;
            const samePrice = Math.abs((idx.price ?? fixed.price) - fixed.price) <= EPSILON;
            if (sameChange && samePrice) return idx;
            console.log(`  ${doc.id} ${idx.name.padEnd(7)} ${String(idx.changePercent).padStart(6)}% → ${String(fixed.changePercent).padStart(6)}%`);
            fixedCount++;
            return { ...idx, price: fixed.price, changePercent: fixed.changePercent };
        });
        if (nextIndices.some((idx, i) => idx !== (data.indices || [])[i])) {
            patch.indices = nextIndices;
        }

        // 시장 온도의 VIX 등락률도 같은 방식으로 계산돼 있어 함께 검증한다 (level·label은 VIX 값 기준이라 그대로)
        const vixFixed = data.sentiment ? recalc(vixSeries, marketDate) : null;
        if (vixFixed && Math.abs((data.sentiment.changePercent ?? 0) - vixFixed.changePercent) > EPSILON) {
            console.log(`  ${doc.id} ${'VIX'.padEnd(7)} ${String(data.sentiment.changePercent).padStart(6)}% → ${String(vixFixed.changePercent).padStart(6)}%`);
            fixedCount++;
            patch.sentiment = { ...data.sentiment, changePercent: vixFixed.changePercent };
        }

        if (Object.keys(patch).length > 0) updates.push({ id: doc.id, patch });
    }

    console.log(`\n전체 ${snap.size}건 문서 / 수정 대상 ${updates.length}건 문서, ${fixedCount}개 값`);

    if (!apply) {
        console.log('미리보기 모드입니다. 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
        return;
    }
    if (updates.length === 0) {
        console.log('반영할 문서가 없습니다.');
        return;
    }

    const batch = db.batch();
    for (const u of updates) {
        batch.set(db.collection('market_briefings').doc(u.id), u.patch, { merge: true });
    }
    await batch.commit();
    console.log(`반영 완료: ${updates.length}건 문서`);
}

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('실패:', error);
        process.exit(1);
    });
