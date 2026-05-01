// Polyfill `Promise.try` for runtimes < V8 13.x (Node < 23). `unpdf` (and other
// pdfjs-dist consumers) call `Promise.try` directly; without this shim, PDF CV
// uploads fail with `TypeError: Promise.try is not a function` on Node 22.x.
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  type PromiseWithTry = typeof Promise & {
    try?: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<Awaited<T>>
  }
  const P = Promise as PromiseWithTry
  if (typeof P.try !== 'function') {
    // ts-expect-error: TypeScript's Promise.try overload signature is more
    // sophisticated than this polyfill needs (it carries a generic for the
    // args tuple). Runtime behaviour is correct; the cast keeps the polyfill
    // simple. The directive must be on the line ABOVE the assignment.
    // @ts-expect-error -- intentional polyfill assignment (see comment above)
    P.try = function <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) {
      return new Promise<Awaited<T>>((resolve) => resolve(fn(...args) as Awaited<T>))
    }
    console.log('[instrumentation] polyfilled Promise.try (Node < 23 runtime)')
  }
}
