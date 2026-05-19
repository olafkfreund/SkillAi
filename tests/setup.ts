import '@testing-library/jest-dom'

// Polyfill Promise.try for Node < 23. unpdf (a transitive dep of pdf-parse)
// uses Promise.try, which is gated behind --harmony-promise-try in Node 22
// and only enabled by default in Node 23+. The container ships Node 22.22,
// so we shim the standard semantics: Promise.try(fn, ...args) ≡
// new Promise((resolve) => resolve(fn(...args))).
if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
  ;(Promise as unknown as { try: typeof Promise.try }).try = function tryPolyfill<T, A extends unknown[]>(
    fn: (...args: A) => T | PromiseLike<T>,
    ...args: A
  ): Promise<Awaited<T>> {
    return new Promise<Awaited<T>>((resolve) => resolve(fn(...args) as Awaited<T>))
  }
}
