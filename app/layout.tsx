import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./academic.css";
import "./home.css";
import "./contact.css";
import "./education.css";
import "./people-overviews.css";
import "./detail-pages.css";

export const metadata: Metadata = {
  title: "数据驱动的科学工程建模与计算团队",
  description: "西安工程大学数据驱动的科学工程建模与计算团队。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
