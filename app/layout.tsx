import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "学期卷析｜学情分析与个性化学习",
  description: "试卷分析、专属学习计划与递进练习，记录每一步学习进展。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
