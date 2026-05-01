import { redirect } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// DO NOT REMOVE `export const dynamic = 'force-dynamic'`
// ─────────────────────────────────────────────────────────────────────────────
// Removing this directive will break `next build` — the home page is the
// canonical reproducer for the Next 16.2 / React 19 prerender bug
// (`Cannot read properties of null (reading 'useContext')`) tracked in #41
// and confirmed fixed-by-workaround.
//
// The bug fires whenever Next.js statically prerenders a route whose layout
// transitively renders a client component that reads React context at module
// scope (the root layout's `<ThemeProvider>` from next-themes is the trigger
// here). React's context machinery is null during static prerender, so the
// `useContext` call inside next-themes throws.
//
// Marking the page `force-dynamic` skips static prerender entirely. Cost: zero
// — this page only redirects to `/dashboard` and renders no visible content.
//
// If you're tempted to "fix" this by removing the directive, re-read #41 first.
// The upstream Next/React fix is not in 16.2.x. Keep the directive until then.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic'

export default function RootPage() {
  redirect('/dashboard')
}
