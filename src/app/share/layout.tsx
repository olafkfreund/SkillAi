import type { Metadata } from 'next'

// Public, unauthenticated customer-facing pages. The root layout
// (src/app/layout.tsx) already provides <html>, <body>, fonts, and the
// ThemeProvider — duplicating them here causes nested html tags AND a
// nested next-themes ThemeProvider, the latter of which renders its
// FOUC-prevention <script> from inside a React subtree where it fails
// to execute (the "Encountered a script tag while rendering React
// component" warning).
//
// /share/* is NOT a route group (parens) so its layout NESTS inside the
// root layout — that's exactly what we want. No sidebar / dashboard
// chrome is inherited because those live under (dashboard)/layout.tsx,
// not the root.

export const metadata: Metadata = {
  title: 'Submission update',
  description: 'Update a candidate submission status',
  robots: { index: false, follow: false },
}

// force-dynamic prevents any accidental caching of token-scoped content.
export const dynamic = 'force-dynamic'

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
