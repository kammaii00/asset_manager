'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * 물음표 아이콘 + 설명 말풍선.
 * 데스크탑은 마우스를 올리면 뜨고, 터치 기기는 hover가 없으므로 탭으로 열고 닫는다.
 * (터치에서 합성되는 mouseenter로 잘못 열리지 않도록 pointerType이 mouse일 때만 hover로 반응한다)
 */
export default function InfoTooltip({ text, label = '지표 설명' }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    // 바깥을 누르면 닫는다 (모바일에서 말풍선이 남아 있지 않도록)
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e) => {
            if (!wrapRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    // 마우스 클릭까지 토글로 처리하면 hover와 충돌하므로 터치·키보드 조작에서만 토글한다
    const handleClick = (e) => {
        if (e.nativeEvent?.pointerType === 'mouse') return;
        setOpen((v) => !v);
    };

    return (
        <span ref={wrapRef} className="relative inline-flex align-middle">
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={handleClick}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                className="text-slate-300 hover:text-slate-500 focus:text-slate-500 focus:outline-none transition-colors"
            >
                <HelpCircle size={13} />
            </button>
            {open && (
                <span
                    role="tooltip"
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 w-44 rounded-lg bg-slate-800 px-2.5 py-2 text-[11px] font-normal leading-relaxed text-white shadow-lg"
                >
                    {text}
                </span>
            )}
        </span>
    );
}
