export type BridgeConfig = {
  url: string
  token: string
}

export function loadConfig(): BridgeConfig {
  const rawUrl = process.env['SKILLAI_URL'] ?? 'http://localhost:3000'
  const token = process.env['SKILLAI_TOKEN']

  if (!token || token.trim() === '') {
    console.error(
      '[skillai-mcp] FATAL: SKILLAI_TOKEN environment variable is required but not set.',
    )
    console.error(
      '[skillai-mcp] Generate a token at: https://<your-skillai-host>/settings/api-tokens',
    )
    process.exit(1)
  }

  let parsedUrl: URL | undefined
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    console.error(
      `[skillai-mcp] FATAL: SKILLAI_URL is not a valid URL: "${rawUrl}"`,
    )
    process.exit(1)
  }

  // parsedUrl is always set here if we didn't exit above; the cast is safe.
  const url = parsedUrl as URL

  if (!['http:', 'https:'].includes(url.protocol)) {
    console.error(
      `[skillai-mcp] FATAL: SKILLAI_URL must use http or https. Got: "${url.protocol}"`,
    )
    process.exit(1)
  }

  // Strip trailing slashes
  const cleanUrl = rawUrl.replace(/\/+$/, '')

  return { url: cleanUrl, token: token.trim() }
}
