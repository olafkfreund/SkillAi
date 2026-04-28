/**
 * substituteTemplate — replaces {{key}} and {{ key }} placeholders in a
 * template string with values from a flat vars map.
 *
 * Rules:
 *   - `{{key}}` and `{{ key }}` (optional whitespace) are replaced.
 *   - Keys containing dots (e.g. `candidate.firstName`) are looked up as
 *     flat string keys in `vars` — no nested object traversal.
 *   - Missing keys are replaced with an empty string.
 *   - A literal `\{{` (backslash-escaped) is emitted as `{{` without substitution.
 *
 * Pure function — no I/O, no side effects.
 */
export function substituteTemplate(
  text: string,
  vars: Record<string, string>
): string {
  // Step 1: replace escaped \{{ with a sentinel to protect from the substitution pass
  const ESCAPED_SENTINEL = '\x00ESCAPED_BRACE\x00'
  let result = text.replaceAll('\\{{', ESCAPED_SENTINEL)

  // Step 2: replace {{ key }} / {{key}} patterns
  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ''
  })

  // Step 3: restore escaped braces
  result = result.replaceAll(ESCAPED_SENTINEL, '{{')

  return result
}
