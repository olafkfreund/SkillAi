/**
 * Build a Content-Disposition header value that's safe for HTTP transport
 * AND preserves the original Unicode filename for browsers that understand
 * RFC 5987's extended `filename*=UTF-8''…` syntax.
 *
 * Why this exists: HTTP header values are ByteStrings (each char ≤ 255).
 * Interpolating a candidate name like "Łukasz Wójcik" directly into
 * `filename="${name}.pdf"` crashes with a TypeError before the response
 * ever leaves the server (saw `value 380 > 255` from Polish `ż`).
 *
 * The fix is RFC 6266 / RFC 5987:
 *   - `filename="ascii-fallback.pdf"` for legacy clients
 *   - `filename*=UTF-8''<percent-encoded>` for the real Unicode value
 * Modern browsers prefer the extended form; the fallback is sanitised to
 * the printable-ASCII subset so it never trips the ByteString limit.
 */
export function contentDispositionHeader(
  disposition: 'attachment' | 'inline',
  filename: string
): string {
  const sanitised = asciiFallback(filename)
  // Treat empty or just-an-extension (e.g. '.pdf' from all-CJK input) as
  // "no usable fallback" — modern browsers honour filename* anyway.
  const fallback = sanitised && !/^\.[A-Za-z0-9]+$/.test(sanitised) ? sanitised : 'download'
  const encoded = encodeRFC5987(filename) || encodeRFC5987(fallback)
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Strip a string down to characters that survive an HTTP ByteString header.
 * Keeps printable ASCII letters, digits, space, dot, underscore, hyphen.
 * Collapses whitespace + runs of hyphens; trims leading/trailing hyphens.
 */
export function asciiFallback(value: string): string {
  return value
    .normalize('NFKD') // decompose accents so we can drop the combining marks
    .replace(/[^\x20-\x7E]/g, '') // strip non-printable-ASCII
    .replace(/[^A-Za-z0-9 ._-]/g, '') // strip ASCII punctuation we don't want in filenames
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Percent-encode a string per RFC 5987 §3.2.1 (UTF-8 + attr-char allowlist).
 * attr-char = ALPHA / DIGIT / "!" / "#" / "$" / "&" / "+" / "-" / "." /
 *             "^" / "_" / "`" / "|" / "~"
 * Everything else (including space, paren, slash) gets %HH-encoded.
 */
function encodeRFC5987(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%(7C|60|5E)/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}
