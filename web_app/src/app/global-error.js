'use client';

import { useEffect } from 'react';
import './globals.css';

// 루트 레이아웃까지 무너지는 최악의 오류를 받아내는 최종 방어막
// (global-error는 layout.js를 대체하므로 html/body를 직접 렌더링해야 한다)
export default function GlobalError({ error, reset }) {
    // 원인 추적을 위해 원본 오류를 콘솔에 남긴다
    useEffect(() => {
        console.error('[Asset Manager] 치명적 오류:', error);
    }, [error]);

    return (
        <html lang="ko" translate="no" className="notranslate">
            <body>
                <div className="min-h-screen bg-[#f5f7f8] flex items-center justify-center p-6">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
                        <h1 className="text-lg font-bold text-slate-900">앱을 불러오지 못했습니다</h1>

                        <p className="text-sm text-slate-500 leading-relaxed">
                            브라우저의 자동 번역이나 확장 프로그램이 화면 구성을 변경하면 이런 오류가 발생할 수 있습니다.
                            자동 번역을 끈 뒤 다시 시도해 주세요.
                        </p>

                        <pre className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                            {error?.message || '알 수 없는 오류'}
                            {error?.digest ? `\n(digest: ${error.digest})` : ''}
                        </pre>

                        <button
                            onClick={() => reset()}
                            className="px-4 py-2.5 bg-[#0d7ff2] text-white font-bold rounded-xl hover:bg-blue-600 transition-colors"
                        >
                            다시 시도
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
