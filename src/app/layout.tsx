import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ProjectSessionProvider } from "@/features/project/project-session-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CutMind — AI Content Director",
  description: "从大量视频中找到真正值得剪的那几秒，并把它们组织成值得观看的故事。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><ProjectSessionProvider>{children}</ProjectSessionProvider></body>
    </html>
  );
}
