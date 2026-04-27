'use client'

// Custom global-error component — replaces Next 16's built-in /_global-error
// page. The framework default page currently has a Next 16.2 / React 19 bug
// that throws `Cannot read properties of null (reading 'useContext')` during
// static prerender (#41). Even with this override the framework wrapper still
// fails on prerender — but the runtime path uses our component, so users
// see this UI when an actual error occurs at runtime.
//
// global-error.tsx must be a client component and must include its own
// <html> and <body> because it replaces the root layout.

export const dynamic = 'force-dynamic'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-200 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-zinc-400 mb-4">
            An unexpected error has occurred. The team has been notified.
          </p>
          {error.digest && (
            <p className="text-xs text-zinc-500 mb-4 font-mono">
              Error ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
