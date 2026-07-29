import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "자산 관리자 (Asset Manager)",
  description: "개인 자산을 통합해서 관리하는 대시보드 애플리케이션",
  icons: {
    icon: '/icon.png',
  },
  // 크롬 자동 번역 차단: 번역기가 텍스트를 <font>로 감싸면 React DOM 참조가 깨져 화면 전체가 죽는다
  other: {
    google: 'notranslate',
  },
};

import { AuthProvider } from "@/components/AuthProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="ko" translate="no" className="notranslate">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
