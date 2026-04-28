/**
 * Language directive helper — single source of truth for the
 * "RESPONSE LANGUAGE: ..." prompt block injected into AI helpers
 * (interview pack generation, transcript analysis, etc.)
 *
 * Pattern mirrors src/lib/ai/priorities.ts: helper returns '' for the
 * default/no-op case so prompts on default-language work are byte-identical
 * to the pre-feature baseline (regression-safe).
 *
 * Architectural note (per Epic #85 plan): the directive returned by this
 * helper goes in the UNCACHED per-candidate block of AI prompts. Putting
 * it in the cached system prompt or role block would fragment the prompt
 * cache per language. Keep it where it is.
 */

export const SUPPORTED_LANGUAGES = [
  'en',  // English
  'pl',  // Polish
  'de',  // German
  'fr',  // French
  'es',  // Spanish
  'it',  // Italian
  'pt',  // Portuguese
  'nl',  // Dutch
  'cs',  // Czech
  'sv',  // Swedish
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/**
 * Resolve a human-readable display name for a language code, in the
 * given UI locale.
 *
 * @param language    BCP 47 short code (e.g. 'pl')
 * @param displayIn   The locale to resolve the name in (default 'en')
 * @returns           Display name (e.g. 'Polish' or 'polski')
 */
export function getDisplayName(language: SupportedLanguage, displayIn = 'en'): string {
  try {
    const dn = new Intl.DisplayNames([displayIn], { type: 'language' })
    return dn.of(language) ?? language
  } catch {
    return language
  }
}

/**
 * Build the language directive prompt block for a given language.
 *
 * Returns '' for English — prompts on English packs are byte-identical
 * to the pre-feature baseline (regression-safe; preserves existing
 * prompt-cache hits).
 *
 * For other languages, returns a leading-newline-separated block that
 * tells Claude/Gemini to emit values in the target language while
 * preserving English JSON field names. Polish gets an additional
 * formal-register clause (Pan/Pani) — Claude defaults to neutral
 * register and drifts informal otherwise. German gets a similar Sie
 * clause; other Tier-1 languages don't need it (English-equivalent
 * formal register defaults are already correct).
 */
export function formatLanguageDirective(language: SupportedLanguage): string {
  if (language === 'en') return ''

  const displayName = getDisplayName(language, 'en')

  // Per-language formal-register clause for languages with a strong
  // formal/informal distinction. Empty string for languages where the
  // default register is already correct.
  const formalClause = (() => {
    switch (language) {
      case 'pl':
        return '- Use formal register throughout (Pan/Pani forms, formal verb conjugations). Never use informal "ty".\n'
      case 'de':
        return '- Use formal register throughout (Sie / Ihr forms). Never use informal "du".\n'
      case 'fr':
        return '- Use formal register throughout (vous). Never use informal "tu".\n'
      case 'it':
        return '- Use formal register throughout (Lei). Never use informal "tu".\n'
      case 'es':
      case 'pt':
        return '- Use formal register throughout (usted / o senhor / a senhora). Avoid informal "tú/tu".\n'
      default:
        return ''
    }
  })()

  return `

RESPONSE LANGUAGE: Generate ALL output in ${displayName} (${language}).
- Field names stay in English (the JSON schema field names you submit).
- All field VALUES — question text, rationale, follow-ups, scoring rubric signals, summary — must be in ${displayName}.
${formalClause}- Keep proper nouns and established technical terms in English (Kubernetes, GraphQL, REST, CI/CD, AWS, Postgres).
- Translate generic concepts (e.g. scalability → the equivalent term in ${displayName}; deployment → equivalent).`
}

/**
 * Reinforcement clause for Anthropic tool descriptions. Append to the
 * existing tool description so the model has TWO signals: one in the
 * user message (formatLanguageDirective) and one in the tool spec.
 */
export const TOOL_LANGUAGE_REINFORCEMENT =
  'Field NAMES are in English (do not translate). Field VALUES must match the language directive in the user message.'
