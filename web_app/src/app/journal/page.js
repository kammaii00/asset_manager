'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import useAssetStore from '@/store/useAssetStore';
import { Wallet, Settings, BookOpen, Sparkles, RefreshCw, TrendingUp, TrendingDown, Newspaper, Save, Check, Clock, Pencil, Trash2, X } from 'lucide-react';

// 감정 태그 목록 (백데이터용 구조화 필드)
const EMOTIONS = [
    { key: 'calm', label: '평온', emoji: '😌' },
    { key: 'anxious', label: '불안', emoji: '😨' },
    { key: 'confident', label: '확신', emoji: '😤' },
    { key: 'regret', label: '후회', emoji: '😕' },
    { key: 'greedy', label: '욕심', emoji: '🤑' },
    { key: 'neutral', label: '무덤덤', emoji: '😐' },
];

// KST(Asia/Seoul) 기준 오늘 날짜 문자열(YYYY-MM-DD) — 서버 문서 ID와 동일 규칙
function getTodayKST() {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().split('T')[0];
}

// 등락률 색상/부호 표시 헬퍼
function ChangeBadge({ value }) {
    if (value == null) return <span className="text-slate-400 text-sm">-</span>;
    const up = value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${up ? 'text-red-500' : 'text-blue-500'}`}>
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {up ? '+' : ''}{value}%
        </span>
    );
}

// 감정 태그 선택 버튼 그룹 (신규 입력·수정에서 공용)
function EmotionPicker({ value, onChange }) {
    return (
        <div className="flex flex-wrap gap-2 mb-3">
            {EMOTIONS.map((e) => (
                <button
                    key={e.key}
                    onClick={() => onChange(value === e.key ? null : e.key)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${value === e.key ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                    {e.emoji} {e.label}
                </button>
            ))}
        </div>
    );
}

export default function JournalPage() {
    const { isLoggedIn, login, fetchTodayJournal, fetchJournals, saveJournalNote, deleteJournalNote, todayJournal, journals, journalLoading } = useAssetStore();
    const [mounted, setMounted] = useState(false);
    const [text, setText] = useState('');
    const [emotion, setEmotion] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [editingDate, setEditingDate] = useState(null); // 수정 중인 기록 날짜
    const [editText, setEditText] = useState('');
    const [editEmotion, setEditEmotion] = useState(null);

    useEffect(() => { setMounted(true); }, []);

    // 로그인 시 오늘 시황 카드 + 과거 목록 로드
    useEffect(() => {
        if (isLoggedIn) {
            fetchTodayJournal();
            fetchJournals();
        }
    }, [isLoggedIn, fetchTodayJournal, fetchJournals]);

    // 오늘 저장된 메모가 있으면 에디터에 반영
    useEffect(() => {
        if (todayJournal?.userNote) {
            setText(todayJournal.userNote.text || '');
            setEmotion(todayJournal.userNote.emotion || null);
        }
    }, [todayJournal]);

    // 오늘의 주관 메모 저장 (시황 카드 유무와 무관하게 오늘 날짜로 저장)
    const handleSave = async () => {
        const date = todayJournal?.date || getTodayKST();
        setSaving(true);
        try {
            await saveJournalNote({ date, text, emotion });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (_) {
            alert('저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    // 지난 기록 수정 시작
    const startEdit = (j) => {
        setEditingDate(j.date);
        setEditText(j.userNote?.text || '');
        setEditEmotion(j.userNote?.emotion || null);
    };

    // 수정 내용 저장
    const submitEdit = async () => {
        try {
            await saveJournalNote({ date: editingDate, text: editText, emotion: editEmotion });
            setEditingDate(null);
        } catch (_) {
            alert('수정에 실패했습니다.');
        }
    };

    // 기록 삭제
    const handleDelete = async (date) => {
        if (!confirm('이 기록을 삭제할까요?')) return;
        try {
            await deleteJournalNote(date);
            if (editingDate === date) setEditingDate(null);
            // 오늘 기록을 지웠으면 상단 에디터가 다시 뜨므로 입력값 초기화
            if (date === (todayJournal?.date || getTodayKST())) {
                setText('');
                setEmotion(null);
            }
        } catch (_) {
            alert('삭제에 실패했습니다.');
        }
    };

    // 메모가 있는 기록만(오늘 포함) 최신순 목록
    const myRecords = journals.filter((j) => j.userNote && (j.userNote.text || j.userNote.emotion));

    // 오늘 이미 기록했는지 여부 (있으면 상단 입력 에디터를 숨김 → 목록에서만 표시)
    const today = todayJournal?.date || getTodayKST();
    const todayRecord = journals.find((j) => j.date === today);
    const hasTodayNote = !!(todayRecord?.userNote && (todayRecord.userNote.text || todayRecord.userNote.emotion));

    const Header = () => (
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
                    <span className="text-slate-900 text-sm font-semibold cursor-pointer">투자일기</span>
                </nav>
            </div>
            <Link href="/settings" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500" title="설정">
                <Settings size={22} />
            </Link>
        </header>
    );

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
                <Header />
                <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                    <BookOpen size={48} className="text-slate-300" />
                    <h1 className="text-xl font-bold">투자일기는 로그인이 필요합니다</h1>
                    <p className="text-slate-500 text-sm max-w-sm">매일 AI가 보유 종목 시황을 정리해 드리고, 그날의 판단·감정을 기록으로 남길 수 있습니다.</p>
                    <button onClick={login} className="mt-2 px-5 py-2.5 bg-[#0d7ff2] text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors">
                        Google로 로그인
                    </button>
                </main>
            </div>
        );
    }

    const ai = todayJournal?.aiContext;

    return (
        <div className="bg-[#f5f7f8] min-h-screen text-slate-900 font-sans flex flex-col">
            <Header />
            <main className="flex-1 w-full max-w-[720px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 pb-32">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black leading-tight flex items-center gap-2">
                        <BookOpen size={28} className="text-slate-400" />
                        투자일기
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">AI가 오늘의 시황을 대신 정리했어요. 당신의 판단과 감정만 한 줄 더해보세요.</p>
                </div>

                {/* 오늘의 AI 시황 카드 */}
                <section className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-bold">
                            <Sparkles size={18} />
                            오늘의 시황 <span className="text-slate-400 font-medium text-sm">{todayJournal?.date}</span>
                            {ai && ai.finalized === false && (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium" title="아직 장이 열려 있어 종가가 아닌 장중 기준입니다. 마감 후 다시 열면 종가로 갱신됩니다.">
                                    <Clock size={11} /> 장중 잠정
                                </span>
                            )}
                        </div>
                        {(!ai || ai.finalized === false) && (
                            <button
                                onClick={() => fetchTodayJournal(true)}
                                disabled={journalLoading}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                                title="새로고침"
                            >
                                <RefreshCw size={16} className={journalLoading ? 'animate-spin' : ''} />
                            </button>
                        )}
                    </div>

                    {journalLoading && !ai ? (
                        <p className="text-slate-400 text-sm animate-pulse py-4">AI가 오늘의 시황을 정리하고 있어요...</p>
                    ) : ai ? (
                        <>
                            {ai.indices?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {ai.indices.map((idx) => (
                                        <span key={idx.name} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                                            <span className="text-slate-500">{idx.name}</span>
                                            <ChangeBadge value={idx.changePercent} />
                                        </span>
                                    ))}
                                </div>
                            )}
                            <p className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-line">{ai.marketSummary}</p>

                            {ai.holdings?.length > 0 && (
                                <div className="mt-4 flex flex-col gap-2">
                                    {ai.holdings.map((h) => (
                                        <div key={h.symbol} className="bg-white/70 border border-slate-100 rounded-xl px-3 py-2">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-sm text-slate-800">{h.name}</span>
                                                <ChangeBadge value={h.changePercent} />
                                            </div>
                                            {h.headline && (
                                                <div className="flex items-start gap-1.5 mt-1 text-slate-500 text-xs">
                                                    <Newspaper size={13} className="mt-0.5 shrink-0" />
                                                    <span className="line-clamp-2">{h.headline}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-slate-400 text-sm py-4">시황을 불러오지 못했어요. 새로고침을 눌러주세요.</p>
                    )}
                </section>

                {/* 오늘 입력 에디터 — 오늘 아직 기록이 없을 때만 표시 */}
                {!hasTodayNote && (
                <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <h2 className="font-bold text-slate-800 mb-3">오늘 나의 기록</h2>
                    <EmotionPicker value={emotion} onChange={setEmotion} />
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="오늘 매매한 이유, 시황을 보며 든 감정, 새로 공부한 것을 자유롭게 남겨보세요."
                        rows={5}
                        className="w-full border border-slate-200 rounded-xl p-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <div className="flex justify-end mt-3">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0d7ff2] text-white rounded-lg font-semibold text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                            {saved ? <><Check size={16} /> 저장됨</> : <><Save size={16} /> {saving ? '저장 중...' : '기록 저장'}</>}
                        </button>
                    </div>
                </section>
                )}

                {/* 나의 기록 목록 (오늘 포함, 수정·삭제 가능) */}
                {myRecords.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <h2 className="font-bold text-slate-800">나의 기록</h2>
                        {myRecords.map((j) => (
                            <div key={j.id} className="bg-white border border-slate-200 rounded-xl p-4">
                                {editingDate === j.date ? (
                                    // 수정 모드
                                    <>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-semibold text-slate-700">{j.date}</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={submitEdit} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0d7ff2] text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors">
                                                    <Save size={13} /> 저장
                                                </button>
                                                <button onClick={() => setEditingDate(null)} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors">
                                                    <X size={13} /> 취소
                                                </button>
                                            </div>
                                        </div>
                                        <EmotionPicker value={editEmotion} onChange={setEditEmotion} />
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            rows={4}
                                            className="w-full border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                        />
                                    </>
                                ) : (
                                    // 표시 모드
                                    <>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-700">{j.date}</span>
                                                {j.userNote?.emotion && (
                                                    <span className="text-sm">{EMOTIONS.find((e) => e.key === j.userNote.emotion)?.emoji}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => startEdit(j)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="수정">
                                                    <Pencil size={15} />
                                                </button>
                                                <button onClick={() => handleDelete(j.date)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                        {j.userNote?.text && (
                                            <p className="text-slate-600 text-sm whitespace-pre-line">{j.userNote.text}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </section>
                )}
            </main>
        </div>
    );
}
