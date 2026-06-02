import { NextResponse } from 'next/server';
import { adminDb, FieldValue, getUserIdFromRequest } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const uid = await getUserIdFromRequest(request);
        if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const {
            stockValue = 0, cashValue = 0, pensionValue = 0,
            realEstateValue = 0, goldValue = 0, cryptoValue = 0,
            carValue = 0, liabilityValue = 0, totalValue = 0
        } = body;

        const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const y = kstDate.getFullYear();
        const m = String(kstDate.getMonth() + 1).padStart(2, '0');
        const d = String(kstDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const monthStr = `${y}-${m}`;

        const snapshotData = {
            stockValue, cashValue, pensionValue,
            realEstateValue, goldValue, cryptoValue, carValue,
            liabilityValue, totalValue,
            updatedAt: FieldValue.serverTimestamp(),
        };

        const userRef = adminDb.collection('users').doc(uid);
        await Promise.all([
            userRef.collection('daily_snapshots').doc(dateStr).set(
                { ...snapshotData, date: dateStr },
                { merge: true }
            ),
            userRef.collection('monthly_snapshots').doc(monthStr).set(
                { ...snapshotData, month: monthStr },
                { merge: true }
            ),
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving snapshot:', error);
        return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 });
    }
}
