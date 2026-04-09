import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

// Derive a 32-byte key from the ENCRYPTION_KEY env var
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set')
  // SHA-256 of the raw key to ensure exactly 32 bytes regardless of input length
  return createHash('sha256').update(raw).digest()
}

const ALGO = 'aes-256-gcm'

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns "ivHex:authTagHex:ciphertextHex"
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGO, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a value produced by encrypt().
 * Expects "ivHex:authTagHex:ciphertextHex"
 */
export function decrypt(stored: string): string {
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivHex, authTagHex, ciphertextHex] = parts

  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
