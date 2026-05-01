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
      <body className="min-h-screen flex items-center justify-center bg-[var(--color-bg-app)] text-[var(--color-fg)] p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mb-4">
            An unexpected error has occurred. The team has been notified.
          </p>
          {error.digest && (
            <p className="text-xs text-[var(--color-fg-subtle)] mb-4 font-mono">
              Error ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-4 py-2 text-sm text-[var(--color-fg)] hover:bg-[var(--color-border)]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
