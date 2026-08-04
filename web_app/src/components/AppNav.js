'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, LayoutDashboard, PlusCircle, BookOpen, Settings } from 'lucide-react';

// 전 화면 공통 메뉴 정의 (헤더와 모바일 탭바가 같은 목록을 공유)
const NAV_ITEMS = [
    { href: '/', label: '대시보드', icon: LayoutDashboard },
    { href: '/entry', label: '자산 입력', icon: PlusCircle },
    { href: '/journal', label: '투자일기', icon: BookOpen },
];

// 모바일 탭바에는 설정까지 포함해 4개 탭으로 노출
const TAB_ITEMS = [...NAV_ITEMS, { href: '/settings', label: '설정', icon: Settings }];

// 현재 경로가 해당 메뉴인지 판별 ('/'는 정확히 일치할 때만 활성)
function isActive(pathname, href) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
}

// 상단 헤더 — 데스크탑(md 이상)에서만 메뉴 링크를 보여주고, 모바일은 MobileTabBar가 대신한다
export function AppHeader() {
    const pathname = usePathname();
    const settingsActive = isActive(pathname, '/settings');

    return (
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 px-4 sm:px-6 py-4 bg-white sticky top-0 z-50">
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-3 text-slate-900">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 text-[#0d7ff2]">
                        <Wallet size={20} />
                    </div>
                    <h2 className="text-lg font-bold leading-tight tracking-tight">Asset Manager</h2>
                </div>
                <nav className="hidden md:flex items-center gap-6">
                    {NAV_ITEMS.map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`text-sm transition-colors ${isActive(pathname, href)
                                ? 'text-slate-900 font-semibold'
                                : 'text-slate-500 font-medium hover:text-[#0d7ff2]'
                                }`}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </div>
            <div className="flex items-center gap-4">
                <Link
                    href="/settings"
                    className={`p-2 rounded-full transition-colors ${settingsActive
                        ? 'bg-blue-50 text-[#0d7ff2]'
                        : 'text-slate-500 hover:bg-slate-100'
                        }`}
                    title="설정"
                >
                    <Settings size={22} />
                </Link>
            </div>
        </header>
    );
}

// 모바일 전용 하단 고정 탭바 — 헤더 메뉴가 숨겨지는 md 미만에서만 표시된다
export function MobileTabBar() {
    const pathname = usePathname();

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-stretch h-16">
                {TAB_ITEMS.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${active ? 'text-[#0d7ff2]' : 'text-slate-400'
                                }`}
                        >
                            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                            {label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
