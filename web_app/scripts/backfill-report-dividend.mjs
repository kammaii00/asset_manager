/**
 * 기존 분석 리포트에 배당 지표(`metrics.dividend`)를 소급 적용
 *
 * 배당 기능은 2026-08-13에 추가돼 그 이전 리포트에는 배당 블록이 없다.
 * 주당배당금·배당성향·총액은 사업연도 확정 공시값이라 지금 받아도 분석 시점과 같고,
 * 주가에 따라 달라지는 현재가 기준 수익률만 **리포트에 저장된 `priceAtAnalysis`**로 계산해
 * 당시 기준을 그대로 재현한다(오늘 주가를 쓰면 스냅샷이 왜곡된다).
 *
 * `metrics` 자체가 없는 초기 리포트는 건너뛴다 — 배당만 끼워 넣으면 화면이 나머지 지표를
 * 읽다가 죽는다. 그런 리포트는 재분석하는 것이 맞다.
 *
 * 사용 (web_app 디렉터리에서):
 *   node scripts/backfill-report-dividend.mjs            # 미리보기(쓰기 없음)
 *   node scripts/backfill-report-dividend.mjs --apply    # 실제 반영
 *
 * 필요 환경: .env.local 의 FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, DART_API_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';
import { fetchDividendInfo, fetchFinancialStatements } from '../functions/analysis/clients/dart.js';
import { normalizeAnnual, mergeAnnualSeries } from '../functions/analysis/financials.js';
import { normalizeDividendRows, computeDividend } from '../functions/analysis/dividend.js';

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

if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY || !process.env.DART_API_KEY) {
    console.error('FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, DART_API_KEY 가 필요합니다 (.env.local).');
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
const dartKey = process.env.DART_API_KEY;

// 리포트 날짜 기준 직전 사업연도 — 사업보고서가 확정된 마지막 해다
function baseYearOf(reportDate) {
    const year = Number(String(reportDate).slice(0, 4));
    return (Number.isFinite(year) ? year : new Date().getFullYear()) - 1;
}

// 배당금지급 이력을 얻기 위해 재무제표를 다시 받는다 (한 번 호출에 3개년 → 2회로 6개년)
async function loadSeries(corpCode, baseYear) {
    const responses = [];
    for (const year of [baseYear, baseYear - 3]) {
        try {
            const res = await fetchFinancialStatements(dartKey, corpCode, year, '11011', 'CFS');
            responses.push(normalizeAnnual(res.list || [], year));
        } catch (error) {
            console.warn(`  재무제표 ${year}년 조회 실패 — ${error.message}`);
            responses.push([]);
        }
    }
    return mergeAnnualSeries(responses);
}

async function run() {
    const snap = await db.collectionGroup('reports').get();
    if (snap.empty) {
        console.log('리포트가 없습니다.');
        return;
    }

    const updates = [];

    for (const doc of snap.docs) {
        const data = doc.data();
        const label = `${data.stockName}(${data.ticker}) ${doc.id}`;

        if (data.metrics?.dividend) {
            console.log(`[건너뜀] ${label} — 이미 배당 지표가 있습니다.`);
            continue;
        }
        if (!data.metrics) {
            console.log(`[건너뜀] ${label} — metrics가 없는 초기 리포트입니다. 재분석이 필요합니다.`);
            continue;
        }

        const masterSnap = await db.collection('stock_master').doc(data.ticker).get();
        const corpCode = masterSnap.data()?.corpCode;
        if (!corpCode) {
            console.warn(`[건너뜀] ${label} — 종목마스터에 corpCode가 없습니다.`);
            continue;
        }

        const baseYear = baseYearOf(doc.id);
        const res = await fetchDividendInfo(dartKey, corpCode, baseYear);
        const rows = normalizeDividendRows(res.list || [], baseYear);
        const series = await loadSeries(corpCode, baseYear);

        // 오늘 주가가 아니라 분석 시점 주가로 계산해야 스냅샷이 왜곡되지 않는다
        const dividend = computeDividend(series, rows, { price: data.priceAtAnalysis ?? null });

        console.log(
            `[대상] ${label} — DPS ${dividend.dps ?? '—'}원 / 분석시점가(${data.priceAtAnalysis?.toLocaleString()}원) 기준 ${dividend.currentYieldPct ?? '—'}%` +
            ` / 성향 ${dividend.payoutRatio ?? '—'}% / 연속 ${dividend.consecutiveYears}년 / 추이 ${dividend.trend ?? '—'}`,
        );
        updates.push({ ref: doc.ref, dividend });
    }

    console.log(`\n전체 ${snap.size}건 / 수정 대상 ${updates.length}건`);

    if (!apply) {
        console.log('미리보기 모드입니다. 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
        return;
    }
    if (updates.length === 0) {
        console.log('반영할 리포트가 없습니다.');
        return;
    }

    // metrics의 다른 항목을 덮어쓰지 않도록 중첩 필드 경로로 배당만 갱신한다
    const batch = db.batch();
    for (const u of updates) {
        batch.update(u.ref, { 'metrics.dividend': u.dividend });
    }
    await batch.commit();
    console.log(`반영 완료: ${updates.length}건`);
}

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('실패:', error);
        process.exit(1);
    });
