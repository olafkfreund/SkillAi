import { hash } from '@node-rs/argon2'

/**
 * Token format: skl_<env>_<24-char-base62>
 *
 * Examples:
 *   skl_dev_4xQz9kLmN2pRsT7vWbYcH3j8  (development)
 *   skl_prod_4xQz9kLmN2pRsT7vWbYcH3j8 (production)
 *
 * Prefix = first 12 characters of the full token (includes env discriminator),
 * used as a fast lookup key in the DB before argon2 verification.
 */

const BASE62_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const SECRET_LENGTH = 24

function generateBase62(length: number): string {
  const bytes = new Uint8Array(length)
  // Use Node.js crypto for server-side secure random
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomFillSync } = require('crypto') as typeof import('crypto')
  randomFillSync(bytes)
  return Array.from(bytes)
    .map((b) => BASE62_CHARS[b % 62])
    .join('')
}

export type GeneratedToken = {
  /** Full raw token — visible to caller once; never stored */
  rawToken: string
  /** First 12 characters of rawToken — stored in DB for O(1) lookup */
  prefix: string
  /** argon2id hash of rawToken — stored in DB */
  hash: string
}

/**
 * generateApiToken — creates a new API token with prefix + argon2 hash.
 *
 * The caller is responsible for persisting prefix + hash and returning
 * rawToken to the end-user exactly once.
 */
export async function generateApiToken(): Promise<GeneratedToken> {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
  const secret = generateBase62(SECRET_LENGTH)
  const rawToken = `skl_${env}_${secret}`

  // Prefix = first 12 chars: e.g. "skl_dev_4xQz" or "skl_prod_4xQz"
  const prefix = rawToken.slice(0, 12)

  // argon2id with default cost params — on typical hardware ~20-70ms
  const tokenHash = await hash(rawToken)

  return {
    rawToken,
    prefix,
    hash: tokenHash,
  }
}
