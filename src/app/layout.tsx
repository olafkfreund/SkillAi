import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "SkillAI — Recruiting Portal",
  description: "AI-powered candidate ranking and interview management",
};

// SkillAI is a session-gated internal tool. There are no public-facing pages
// that benefit from static prerendering, and Next 16.2 / React 19 has a framework
// bug that throws `Cannot read properties of null (reading 'useContext')` during
// static prerender of any route under this layout (#41). Marking the segment
// dynamic skips static prerender entirely; pages still render on request.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
