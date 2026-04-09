import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-secret-key-for-unit-tests-only'
})

describe('encrypt / decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'sk-ant-test-api-key-12345'
    const ciphertext = encrypt(original)
    expect(decrypt(ciphertext)).toBe(original)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const original = 'same-plaintext'
    const a = encrypt(original)
    const b = encrypt(original)
    expect(a).not.toBe(b)
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(original)
    expect(decrypt(b)).toBe(original)
  })

  it('produces ivHex:authTagHex:ciphertextHex format', () => {
    const ciphertext = encrypt('hello')
    const parts = ciphertext.split(':')
    expect(parts).toHaveLength(3)
    // IV: 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24)
    // AuthTag: 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32)
  })

  it('throws on invalid encrypted format', () => {
    expect(() => decrypt('not-valid')).toThrow('Invalid encrypted value format')
  })

  it('round-trips unicode and special characters', () => {
    const original = 'key with ñ unicode: 日本語 & "quotes"'
    expect(decrypt(encrypt(original))).toBe(original)
  })
})
