import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
    __FIREBASE_ADMIN_EMBEDDED_JSON,
    __FIREBASE_ADMIN_EMBEDDED_CLIENT_EMAIL,
    __FIREBASE_ADMIN_EMBEDDED_PRIVATE_KEY,
} from './firebaseAdminEmbedded.generated.js';

// Admin SDK의 기본 앱 이름. 이름이 다른 앱은 남의 앱이므로 재사용하지 않는다.
const DEFAULT_APP_NAME = '[DEFAULT]';

/**
 * 런타임 env(로컬 next dev) 우선, 없으면 prebuild가 만든 firebaseAdminEmbedded.generated.js 값 사용.
 * Cloud Run에는 .env가 없어 process.env만으로는 비어 있음 → 생성 파일에 박힌 상수로 Admin 초기화.
 *
 * 재사용은 **기본 앱일 때만** 한다. Firebase Hosting의 Next.js 런타임(firebase-frameworks)이
 * 서버 부팅 시 'firebase-frameworks'라는 이름 붙은 Admin 앱을 먼저 만들어 두는데,
 * 예전처럼 getApps()[0]을 그대로 쓰면 기본 앱이 끝내 만들어지지 않아
 * 앱을 인자로 받지 않는 SDK 호출(getFunctions() 등)이
 * "The default Firebase app does not exist"로 실패한다(로컬 dev에서는 재현되지 않음).
 */
function getOrInitApp() {
    const existingDefault = getApps().find((it) => it.name === DEFAULT_APP_NAME);
    if (existingDefault) {
        return existingDefault;
    }

    const projectId =
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'asset-master-jwpark';

    const json =
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON || __FIREBASE_ADMIN_EMBEDDED_JSON;
    if (json?.trim()) {
        try {
            const sa = JSON.parse(json);
            return initializeApp({
                credential: cert(sa),
                projectId: sa.project_id || projectId,
            });
        } catch (e) {
            console.error('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패:', e);
        }
    }

    const clientEmail = (
        process.env.FIREBASE_CLIENT_EMAIL || __FIREBASE_ADMIN_EMBEDDED_CLIENT_EMAIL
    )?.trim();
    const rawKey =
        process.env.FIREBASE_PRIVATE_KEY || __FIREBASE_ADMIN_EMBEDDED_PRIVATE_KEY;
    const privateKey =
        typeof rawKey === 'string' ? rawKey.replace(/\\n/g, '\n').trim() : '';

    if (clientEmail && privateKey.includes('BEGIN PRIVATE KEY')) {
        return initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }

    if (process.env.FIREBASE_CONFIG?.trim()) {
        try {
            return initializeApp();
        } catch (e) {
            console.error('[firebase-admin] FIREBASE_CONFIG 기반 initializeApp() 실패:', e);
        }
    }

    return initializeApp({
        credential: applicationDefault(),
        projectId,
    });
}

const app = getOrInitApp();
const adminDb = getFirestore(app);
const adminAuth = getAuth(app);

/** 서버 API Route에서만 사용. 클라이언트 SDK로는 rules의 request.auth가 비어 사용자 데이터 읽기가 거부됨. */
/** adminApp은 앱을 인자로 요구하는 SDK(getFunctions 등)에 명시적으로 넘기기 위해 내보낸다. */
export { app as adminApp, adminDb, adminAuth, FieldValue };

export async function getUserIdFromRequest(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        return decodedToken.uid;
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        return null;
    }
}
