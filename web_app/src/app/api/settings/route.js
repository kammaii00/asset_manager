import { NextResponse } from 'next/server';
import { adminDb, getUserIdFromRequest } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const docRef = adminDb.collection('users').doc(uid).collection('settings').doc('general');
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            return NextResponse.json(docSnap.data());
        }
        return NextResponse.json({
            accountTypes: ['키움증권', 'NH투자증권', '미래에셋', 'IRP', 'ISA', '일반'],
            cashInstitutions: ['NH투자증권', '토스뱅크', '카카오뱅크', 'KB국민은행', '신한은행']
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            accountTypes,
            cashInstitutions,
            savedStockItems,
            savedPensionItems,
            savedCryptoItems,
            enabledAssetTypes,
            hasMigratedV2,
            targetAssetRatios,
            targetTotalAmount,
            cashUpdateDate,
            pensionRealizedAdjustment
        } = body;

        const docRef = adminDb.collection('users').doc(uid).collection('settings').doc('general');

        const updateData = {};
        if (accountTypes !== undefined) updateData.accountTypes = accountTypes;
        if (cashInstitutions !== undefined) updateData.cashInstitutions = cashInstitutions;
        if (savedStockItems !== undefined) updateData.savedStockItems = savedStockItems;
        if (savedPensionItems !== undefined) updateData.savedPensionItems = savedPensionItems;
        if (savedCryptoItems !== undefined) updateData.savedCryptoItems = savedCryptoItems;
        if (enabledAssetTypes !== undefined) updateData.enabledAssetTypes = enabledAssetTypes;
        if (hasMigratedV2 !== undefined) updateData.hasMigratedV2 = hasMigratedV2;
        if (targetAssetRatios !== undefined) updateData.targetAssetRatios = targetAssetRatios;
        if (targetTotalAmount !== undefined) updateData.targetTotalAmount = targetTotalAmount;
        if (cashUpdateDate !== undefined) updateData.cashUpdateDate = cashUpdateDate;
        // 연금 실현손익 보정 — 앱 도입 이전 매매분은 거래 이력이 없어 계산되지 않으므로 직접 더해준다
        if (pensionRealizedAdjustment !== undefined) updateData.pensionRealizedAdjustment = pensionRealizedAdjustment;

        await docRef.set(updateData, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
