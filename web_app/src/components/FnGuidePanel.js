'use client';

import { ExternalLink } from 'lucide-react';

/**
 * FnGuide Company Guide(스냅샷) 주소.
 * `cmp_cd`에 6자리 종목코드만 바꿔 넣으면 되고, 나머지 파라미터는 화면 종류를 고른다
 * (c_id=AA·menu_type=01 = 기업정보 Snapshot).
 */
export function fnGuideUrl(ticker) {
    return `https://wcomp.fnguide.com/?c_id=AA&menu_type=01&cmp_cd=${ticker}`;
}

/**
 * 리포트 옆에 띄우는 FnGuide 비교 패널.
 *
 * FnGuide는 X-Frame-Options·CSP를 보내지 않아 iframe 임베드가 가능하고, 자체 반응형
 * 분기(860px·767px)가 있어 좁은 폭에서도 레이아웃이 깨지지 않는다. 다만 언제든 차단될 수 있고
 * 좁은 폭에서는 표가 접히므로, 데스크탑 레이아웃 그대로 크게 보는 '새 창' 경로를 항상 함께 둔다.
 */
export default function FnGuidePanel({ ticker, stockName }) {
    const url = fnGuideUrl(ticker);

    // 화면 오른쪽 절반에 별도 창으로 띄운다. 창 이름을 고정해 두면 종목을 바꿔도 같은 창을 재사용한다.
    const openInWindow = (e) => {
        e.preventDefault();
        const width = Math.round(window.screen.availWidth / 2);
        const height = window.screen.availHeight;
        const left = (window.screen.availLeft ?? 0) + width;
        const top = window.screen.availTop ?? 0;
        const win = window.open(url, 'fnguide', `width=${width},height=${height},left=${left},top=${top}`);
        win?.focus();
    };

    return (
        <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
                <span className="text-xs font-semibold text-slate-500 truncate">FnGuide · {stockName}</span>
                <a
                    href={url}
                    onClick={openInWindow}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 shrink-0 text-xs font-semibold text-slate-500 hover:text-[#0d7ff2] transition-colors"
                >
                    새 창으로 열기 <ExternalLink size={12} />
                </a>
            </div>
            <iframe
                key={ticker}
                src={url}
                title={`FnGuide ${stockName}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="flex-1 w-full bg-white"
            />
            <p className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100 shrink-0">
                화면이 비어 있으면 FnGuide가 외부 삽입을 막은 것입니다. 위의 &lsquo;새 창으로 열기&rsquo;를 이용하세요.
            </p>
        </div>
    );
}
