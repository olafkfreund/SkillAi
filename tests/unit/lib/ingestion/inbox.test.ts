/**
 * Unit tests for src/lib/ingestion/inbox.ts — the pure host-folder helpers.
 *
 * No filesystem or DB touched: these are deterministic string/path functions.
 */

import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_EXTENSIONS,
  PROCESSED_DIRNAME,
  FAILED_DIRNAME,
  isEligibleFile,
  isTenantFolder,
  tenantInboxDir,
  processedDir,
  failedDir,
  archivedFileName,
} from '@/lib/ingestion/inbox'

const TENANT = 'aaaaaaaa-1111-2222-3333-444444444444'

describe('isEligibleFile', () => {
  it('accepts every supported CV extension (case-insensitive)', () => {
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(isEligibleFile(`alice-smith${ext}`)).toBe(true)
      expect(isEligibleFile(`BOB${ext.toUpperCase()}`)).toBe(true)
    }
  })

  it('rejects unsupported extensions', () => {
    expect(isEligibleFile('resume.exe')).toBe(false)
    expect(isEligibleFile('photo.png')).toBe(false)
    expect(isEligibleFile('archive.zip')).toBe(false)
    expect(isEligibleFile('notes')).toBe(false) // no extension
  })

  it('rejects hidden / dot files (incl. quarantine dirs and editor locks)', () => {
    expect(isEligibleFile('.processed')).toBe(false)
    expect(isEligibleFile('.failed')).toBe(false)
    expect(isEligibleFile('.~lock.cv.pdf#')).toBe(false)
    expect(isEligibleFile('.hidden.pdf')).toBe(false)
  })

  it('rejects empty names', () => {
    expect(isEligibleFile('')).toBe(false)
  })
})

describe('isTenantFolder', () => {
  it('accepts UUID-shaped folder names (either case)', () => {
    expect(isTenantFolder(TENANT)).toBe(true)
    expect(isTenantFolder(TENANT.toUpperCase())).toBe(true)
  })

  it('rejects non-UUID folder names', () => {
    expect(isTenantFolder('.processed')).toBe(false)
    expect(isTenantFolder('inbox')).toBe(false)
    expect(isTenantFolder('not-a-uuid')).toBe(false)
    expect(isTenantFolder('aaaaaaaa-1111-2222-3333')).toBe(false) // too short
  })
})

describe('path helpers', () => {
  it('builds the tenant inbox path under the root', () => {
    expect(tenantInboxDir('/data/inbox', TENANT)).toBe(`/data/inbox/${TENANT}`)
  })

  it('builds .processed and .failed dirs inside the tenant inbox', () => {
    const dir = tenantInboxDir('/data/inbox', TENANT)
    expect(processedDir(dir)).toBe(`/data/inbox/${TENANT}/${PROCESSED_DIRNAME}`)
    expect(failedDir(dir)).toBe(`/data/inbox/${TENANT}/${FAILED_DIRNAME}`)
  })
})

describe('archivedFileName', () => {
  it('prefixes the original name with the timestamp stamp (collision-safe)', () => {
    const stamp = '2026-06-20T07-30-00-000Z'
    expect(archivedFileName('alice-smith.pdf', stamp)).toBe(`${stamp}__alice-smith.pdf`)
  })

  it('keeps distinct re-drops of the same filename from colliding', () => {
    const a = archivedFileName('cv.pdf', '2026-06-20T07-30-00-000Z')
    const b = archivedFileName('cv.pdf', '2026-06-20T08-00-00-000Z')
    expect(a).not.toBe(b)
  })
})
