/**
 * 기존 시황 문서에 `marketDate`(지수·뉴스의 실제 기준일 = 직전 거래일) 소급 추가
 *
 * 07시 브리핑은 문서 ID(생성일)와 데이터 기준일이 하루 어긋난다.
 * 2026-08-13 이후 생성분은 함수가 직접 기록하지만, 그 이전 문서에는 필드가 없어 여기서 채운다.
 *
 * 사용 (web_app 디렉터리에서):
 *   node scripts/backfill-briefing-market-date.mjs            # 미리보기(쓰기 없음)
 *   node scripts/backfill-briefing-market-date.mjs --apply    # 실제 반영
 *   node scripts/backfill-briefing-market-date.mjs --apply --overwrite  # 이미 있는 값도 덮어씀
 *
 * 필요 환경: .env.local 의 FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import admin from 'firebase-admin';

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
const overwrite = process.argv.includes('--overwrite');

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
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 브리핑 생성일(문서 ID) → 그 브리핑이 담고 있는 데이터의 기준일(직전 거래일)
 * - 월요일 07시: 금요일 종가 (주말 휴장) → 3일 전
 * - 일요일 07시: 토요일이 전 시장 휴장이라 지수가 금요일 종가 그대로 → 2일 전
 *   (2026-08-03 평일 축소 이전에 생성된 문서에만 해당)
 * - 그 외(화~토): 전날
 * 공휴일은 한쪽 시장만 쉬는 경우가 대부분이라 반영하지 않고 요일 규칙만 적용한다.
 */
function resolveMarketDate(date) {
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    const weekday = d.getUTCDay();
    const back = weekday === 1 ? 3 : weekday === 0 ? 2 : 1;
    d.setUTCDate(d.getUTCDate() - back);
    return { marketDate: d.toISOString().split('T')[0], weekday };
}

// market_briefings 전체를 훑어 marketDate 가 없는 문서에 값을 채운다
async function backfill() {
    const snap = await db.collection('market_briefings').orderBy('date').get();
    if (snap.empty) {
        console.log('market_briefings 에 문서가 없습니다.');
        return;
    }

    const targets = [];
    let skipped = 0;

    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.marketDate && !overwrite) {
            skipped++;
            continue;
        }
        const resolved = resolveMarketDate(data.date || doc.id);
        if (!resolved) {
            console.warn(`[warn] ${doc.id}: 날짜를 해석할 수 없어 건너뜁니다.`);
            continue;
        }
        targets.push({ id: doc.id, ...resolved });
    }

    for (const t of targets) {
        console.log(`  ${t.id}(${DAY_LABELS[t.weekday]}) → marketDate ${t.marketDate}`);
    }
    console.log(`\n전체 ${snap.size}건 / 대상 ${targets.length}건 / 이미 있음 ${skipped}건`);

    if (!apply) {
        console.log('미리보기 모드입니다. 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
        return;
    }
    if (targets.length === 0) {
        console.log('반영할 문서가 없습니다.');
        return;
    }

    // 문서 수가 많지 않지만 500건 배치 상한은 지킨다
    let batch = db.batch();
    let ops = 0;
    const commits = [];
    for (const t of targets) {
        batch.set(db.collection('market_briefings').doc(t.id), { marketDate: t.marketDate }, { merge: true });
        if (++ops >= 450) {
            commits.push(batch.commit());
            batch = db.batch();
            ops = 0;
        }
    }
    if (ops > 0) commits.push(batch.commit());
    await Promise.all(commits);
    console.log(`반영 완료: ${targets.length}건`);
}

backfill()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('실패:', error);
        process.exit(1);
    });
