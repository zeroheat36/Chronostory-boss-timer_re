import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "크로노스토리 보스 타이머",
  description: "크로노스토리 서버별 보스 리스폰 타이머를 관리하는 수동 입력 대시보드입니다."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
