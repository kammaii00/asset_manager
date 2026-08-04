'use client';

import { useState, useEffect, useMemo } from 'react';
import useAssetStore from '@/store/useAssetStore';
import JournalBriefing from '@/components/JournalBriefing';
import JournalNoteEditor, { findEmotion } from '@/components/JournalNoteEditor';
import { AppHeader, MobileTabBar } from '@/components/AppNav';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// KST(Asia/Seoul) 기준 오늘 날짜 문자열(YYYY-MM-DD) — 서버 문서 ID와 동일 규칙
function getTodayKST() {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
}

// 'YYYY-MM-DD' → '7월 31일 (금)'
function formatDateLabel(date) {
    const [y, m, d] = date.split('-').map(Number);
    const day = DAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${m}월 ${d}일 (${day})`;
}

// 저장된 내 기록 표시 (감정 이모지 + 본문 + 수정·삭제)
function NoteView({ userNote, onEdit, onDelete }) {
    const emotion = findEmotion(userNote.emotion);
    return (
        <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-sm">
                    ✍️ 나의 기록
                    {emotion && <span className="font-medium text-slate-500">{emotion.emoji} {emotion.label}</span>}
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="수정">
                        <Pencil size={14} />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            {userNote.text && <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{userNote.text}</p>}
        </div>
    );
}

export default function JournalPage() {
    const { isLoggedIn, login, fetchJournals, saveJournalNote, deleteJournalNote, journalFeed, journalLoading } = useAssetStore();
    const [mounted, setMounted] = useState(false);
    const [editingDate, setEditingDate] = useState(null); // 작성·수정 중인 날짜

    useEffect(() => { setMounted(true); }, []);

    // 로그인 시 날짜별 피드(공용 시황 + 내 기록) 로드
    useEffect(() => {
        if (isLoggedIn) fetchJournals();
    }, [isLoggedIn, fetchJournals]);

    const today = getTodayKST();

    // 오늘 줄은 시황·기록이 아직 없어도 항상 보이도록 앞에 끼워 넣는다
    const feed = useMemo(() => {
        if (journalFeed.some((item) => item.date === today)) return journalFeed;
        return [{ id: today, date: today, briefing: null, userNote: null }, ...journalFeed];
    }, [journalFeed, today]);

    // 기록 저장 (신규·수정 공용)
    const handleSave = async (date, { text, emotion }) => {
        try {
            await saveJournalNote({ date, text, emotion });
            setEditingDate(null);
        } catch (_) {
            alert('저장에 실패했습니다.');
        }
    };

    // 기록 삭제
    const handleDelete = async (date) => {
        if (!confirm('이 기록을 삭제할까요?')) return;
        try {
            await deleteJournalNote(date);
            if (editingDate === date) setEditingDate(null);
        } catch (_) {
            alert('삭제에 실패했습니다.');
        }
    };

    if (!mounted) {
        return (
            <div className="flex bg-[#f5f7f8] min-h-screen justify-center items-center">
                <div className="text-[#0d7ff2] animate-pulse font-bold">로딩 중...</div>
            </div>
        );
    }

    // 로그인 게이트 (투자일기는 서버 저장 필수)
    if (!isLoggedIn) {
        return (
            <div className="bg-[#f5f7f8] min-h-screen text-slate-900 font-sans flex flex-col">
                <AppHeader />
                <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-24 md:pb-0 text-center">
                    <BookOpen size={48} className="text-slate-300" />
                    <h1 className="text-xl font-bold">투자일기는 로그인이 필요합니다</h1>
                    <p className="text-slate-500 text-sm max-w-sm">매일 아침 국내외 증시 뉴스를 정리해 드리고, 그날의 판단·감정을 기록으로 남길 수 있습니다.</p>
                    <button onClick={login} className="mt-2 px-5 py-2.5 bg-[#0d7ff2] text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors">
                        Google로 로그인
                    </button>
                </main>

                {/* 모바일 하단 탭바 */}
                <MobileTabBar />
            </div>
        );
    }

    return (
        <div className="bg-[#f5f7f8] min-h-screen text-slate-900 font-sans flex flex-col">
            <AppHeader />
            <main className="flex-1 w-full max-w-[720px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 pb-32">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black leading-tight flex items-center gap-2">
                        <BookOpen size={28} className="text-slate-400" />
                        투자일기
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">매일 아침 7시에 정리된 국내외 시황과 그날의 내 기록을 함께 봅니다.</p>
                </div>

                {journalLoading && journalFeed.length === 0 ? (
                    <p className="text-slate-400 text-sm animate-pulse py-8 text-center">기록을 불러오는 중...</p>
                ) : (
                    <div className="flex flex-col gap-5">
                        {feed.map((item) => (
                            <section key={item.id}>
                                <div className="flex items-center gap-2 mb-2">
                                    <h2 className="font-bold text-slate-800">{formatDateLabel(item.date)}</h2>
                                    {item.date === today && (
                                        <span className="bg-[#0d7ff2] text-white text-[11px] font-bold rounded-full px-2 py-0.5">오늘</span>
                                    )}
                                </div>

                                {item.briefing && <JournalBriefing briefing={item.briefing} />}

                                {editingDate === item.date ? (
                                    <JournalNoteEditor
                                        key={item.date}
                                        initialNote={item.userNote}
                                        onSave={(note) => handleSave(item.date, note)}
                                        onCancel={() => setEditingDate(null)}
                                    />
                                ) : item.userNote ? (
                                    <NoteView
                                        userNote={item.userNote}
                                        onEdit={() => setEditingDate(item.date)}
                                        onDelete={() => handleDelete(item.date)}
                                    />
                                ) : (
                                    <button
                                        onClick={() => setEditingDate(item.date)}
                                        className="mt-2 w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-400 hover:border-[#0d7ff2] hover:text-[#0d7ff2] hover:bg-blue-50/50 transition-colors"
                                    >
                                        <Plus size={15} /> 이 날의 기록 남기기
                                    </button>
                                )}
                            </section>
                        ))}
                    </div>
                )}
            </main>

            {/* 모바일 하단 탭바 */}
            <MobileTabBar />
        </div>
    );
}
