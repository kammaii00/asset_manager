'use client';

import { useState } from 'react';
import { Save, X } from 'lucide-react';

// 감정 태그 목록 (백데이터용 구조화 필드)
export const EMOTIONS = [
    { key: 'calm', label: '평온', emoji: '😌' },
    { key: 'anxious', label: '불안', emoji: '😨' },
    { key: 'confident', label: '확신', emoji: '😤' },
    { key: 'regret', label: '후회', emoji: '😕' },
    { key: 'greedy', label: '욕심', emoji: '🤑' },
    { key: 'neutral', label: '무덤덤', emoji: '😐' },
];

// 감정 키로 이모지 찾기 (목록 표시용)
export function findEmotion(key) {
    return EMOTIONS.find((e) => e.key === key);
}

// 감정 태그 선택 버튼 그룹
function EmotionPicker({ value, onChange }) {
    return (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
            {EMOTIONS.map((e) => (
                <button
                    key={e.key}
                    onClick={() => onChange(value === e.key ? null : e.key)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${value === e.key ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                    {e.emoji} {e.label}
                </button>
            ))}
        </div>
    );
}

// 기록 작성·수정 에디터 (신규 입력과 수정에서 공용, 자체 상태 보유)
export default function JournalNoteEditor({ initialNote, onSave, onCancel }) {
    const [text, setText] = useState(initialNote?.text || '');
    const [emotion, setEmotion] = useState(initialNote?.emotion || null);
    const [saving, setSaving] = useState(false);

    // 저장 버튼 처리 (중복 클릭 방지)
    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({ text, emotion });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-2">
            <EmotionPicker value={emotion} onChange={setEmotion} />
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="오늘 매매한 이유, 시황을 보며 든 감정, 새로 공부한 것을 자유롭게 남겨보세요."
                rows={4}
                autoFocus
                className="w-full border border-slate-200 rounded-xl p-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="flex justify-end gap-1.5 mt-2">
                <button
                    onClick={onCancel}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
                >
                    <X size={13} /> 취소
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0d7ff2] text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                    <Save size={13} /> {saving ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    );
}
