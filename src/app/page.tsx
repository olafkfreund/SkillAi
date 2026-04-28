import { redirect } from 'next/navigation'

// Mark as dynamic so Next.js doesn't attempt a static prerender of a redirect-only
// page. Static prerender of `/` triggers a useContext null in Next 16.2 / React 19
// (#41). Since this page only redirects, dynamic rendering has zero downside.
export const dynamic = 'force-dynamic'

export default function RootPage() {
  redirect('/dashboard')
}
