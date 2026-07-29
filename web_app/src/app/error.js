'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// 페이지 렌더링 중 발생한 클라이언트 오류를 사용자에게 보여주고 재시도를 제공하는 화면
// (이 파일이 없으면 오류 발생 시 Next.js 기본 문구만 뜨고 원인을 알 수 없다)
export default function Error({ error, reset }) {
    // 원인 추적을 위해 원본 오류를 콘솔에 남긴다
    useEffect(() => {
        console.error('[Asset Manager] 클라이언트 오류:', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-[#f5f7f8] flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-red-50 text-red-500 rounded-xl">
                        <AlertTriangle size={22} />
                    </div>
                    <h1 className="text-lg font-bold text-slate-900">화면을 표시하지 못했습니다</h1>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed">
                    일시적인 오류일 수 있습니다. 아래 버튼으로 다시 시도해 주세요.
                    같은 화면에서 계속 반복된다면 브라우저의{' '}
                    <strong className="text-slate-700">자동 번역 기능</strong>을 끄고 새로고침해 보세요.
                </p>

                <pre className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                    {error?.message || '알 수 없는 오류'}
                    {error?.digest ? `\n(digest: ${error.digest})` : ''}
                </pre>

                <button
                    onClick={() => reset()}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0d7ff2] text-white font-bold rounded-xl hover:bg-blue-600 transition-colors"
                >
                    <RotateCcw size={16} />
                    다시 시도
                </button>
            </div>
        </div>
    );
}
