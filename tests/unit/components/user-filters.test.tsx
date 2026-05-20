/**
 * Unit tests for the <UserFilters /> component.
 *
 * Covers:
 *   - Role toggle pills: toggling on/off, multi-select, comma-separated param
 *   - Status select: drives the ?status= param
 *   - Last login select: drives the ?lastLogin= param
 *   - Pending invite toggle: drives the ?pendingInvite=1 param
 *   - Clear button: only visible when any filter is active; click resets all
 *   - Accessibility: aria-label, aria-pressed on toggles
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserFilters } from '@/components/settings/user-filters'

// ---------------------------------------------------------------------------
// Mock next/navigation — provide in-memory router
// ---------------------------------------------------------------------------

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/dashboard/users',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLastReplaceUrl(): string {
  const calls = mockReplace.mock.calls
  if (calls.length === 0) return ''
  return calls[calls.length - 1][0] as string
}

function renderFilters(overrides: Partial<Parameters<typeof UserFilters>[0]['currentFilters']> = {}) {
  const defaults = { roles: undefined, status: 'all', lastLogin: 'any', pendingInvite: undefined }
  return render(<UserFilters currentFilters={{ ...defaults, ...overrides }} />)
}

beforeEach(() => {
  mockReplace.mockClear()
})

// ---------------------------------------------------------------------------
// Role pills
// ---------------------------------------------------------------------------

describe('Role filter pills', () => {
  it('renders all four role options', () => {
    renderFilters()
    expect(screen.getByRole('button', { name: /Admin/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recruiter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hiring Manager/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Viewer/i })).toBeInTheDocument()
  })

  it('marks selected roles as aria-pressed=true', () => {
    renderFilters({ roles: 'admin,recruiter' })
    expect(screen.getByRole('button', { name: /Admin/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Recruiter/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Hiring Manager/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('adds a role to the URL param when an unselected pill is clicked', async () => {
    const user = userEvent.setup()
    renderFilters()
    await user.click(screen.getByRole('button', { name: /Admin/i }))
    const url = getLastReplaceUrl()
    expect(url).toContain('role=admin')
  })

  it('removes a role from the URL param when a selected pill is clicked', async () => {
    const user = userEvent.setup()
    renderFilters({ roles: 'admin,recruiter' })
    await user.click(screen.getByRole('button', { name: /Admin/i }))
    const url = getLastReplaceUrl()
    expect(url).toContain('role=recruiter')
    expect(url).not.toContain('admin')
  })

  it('removes the role param entirely when the last selected role is deselected', async () => {
    const user = userEvent.setup()
    renderFilters({ roles: 'viewer' })
    await user.click(screen.getByRole('button', { name: /Viewer/i }))
    const url = getLastReplaceUrl()
    expect(url).not.toContain('role=')
  })
})

// ---------------------------------------------------------------------------
// Status select
// ---------------------------------------------------------------------------

describe('Status filter', () => {
  it('defaults to "All Statuses"', () => {
    renderFilters()
    const select = screen.getByRole('combobox', { name: /Filter by account status/i })
    expect((select as HTMLSelectElement).value).toBe('all')
  })

  it('reflects the current status from props', () => {
    renderFilters({ status: 'deactivated' })
    const select = screen.getByRole('combobox', { name: /Filter by account status/i })
    expect((select as HTMLSelectElement).value).toBe('deactivated')
  })

  it('navigates with ?status=active when active is selected', async () => {
    const user = userEvent.setup()
    renderFilters()
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Filter by account status/i }),
      'active'
    )
    expect(getLastReplaceUrl()).toContain('status=active')
  })

  it('removes ?status from the URL when "All Statuses" is selected', async () => {
    const user = userEvent.setup()
    renderFilters({ status: 'deactivated' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Filter by account status/i }),
      'all'
    )
    const url = getLastReplaceUrl()
    expect(url).not.toContain('status=')
  })
})

// ---------------------------------------------------------------------------
// Last login select
// ---------------------------------------------------------------------------

describe('Last login filter', () => {
  it('defaults to "Any last login"', () => {
    renderFilters()
    const select = screen.getByRole('combobox', { name: /Filter by last login/i })
    expect((select as HTMLSelectElement).value).toBe('any')
  })

  it('navigates with ?lastLogin=7d when 7-day option is selected', async () => {
    const user = userEvent.setup()
    renderFilters()
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Filter by last login/i }),
      '7d'
    )
    expect(getLastReplaceUrl()).toContain('lastLogin=7d')
  })

  it('navigates with ?lastLogin=never when never option is selected', async () => {
    const user = userEvent.setup()
    renderFilters()
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Filter by last login/i }),
      'never'
    )
    expect(getLastReplaceUrl()).toContain('lastLogin=never')
  })

  it('removes ?lastLogin from the URL when "any" is re-selected', async () => {
    const user = userEvent.setup()
    renderFilters({ lastLogin: '30d' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Filter by last login/i }),
      'any'
    )
    expect(getLastReplaceUrl()).not.toContain('lastLogin=')
  })
})

// ---------------------------------------------------------------------------
// Pending invite toggle
// ---------------------------------------------------------------------------

describe('Pending invite toggle', () => {
  it('is not pressed by default', () => {
    renderFilters()
    const btn = screen.getByRole('button', { name: /Pending invite/i })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('is pressed when pendingInvite="1" is passed', () => {
    renderFilters({ pendingInvite: '1' })
    const btn = screen.getByRole('button', { name: /Pending invite/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds ?pendingInvite=1 to the URL when toggled on', async () => {
    const user = userEvent.setup()
    renderFilters()
    await user.click(screen.getByRole('button', { name: /Pending invite/i }))
    expect(getLastReplaceUrl()).toContain('pendingInvite=1')
  })

  it('removes ?pendingInvite from the URL when toggled off', async () => {
    const user = userEvent.setup()
    renderFilters({ pendingInvite: '1' })
    await user.click(screen.getByRole('button', { name: /Pending invite/i }))
    expect(getLastReplaceUrl()).not.toContain('pendingInvite=')
  })
})

// ---------------------------------------------------------------------------
// Clear button
// ---------------------------------------------------------------------------

describe('Clear button', () => {
  it('is not visible when no filters are active', () => {
    renderFilters()
    expect(screen.queryByRole('button', { name: /Clear all user filters/i })).not.toBeInTheDocument()
  })

  it('is visible when a role filter is active', () => {
    renderFilters({ roles: 'admin' })
    expect(screen.getByRole('button', { name: /Clear all user filters/i })).toBeInTheDocument()
  })

  it('is visible when status is not "all"', () => {
    renderFilters({ status: 'deactivated' })
    expect(screen.getByRole('button', { name: /Clear all user filters/i })).toBeInTheDocument()
  })

  it('is visible when lastLogin is not "any"', () => {
    renderFilters({ lastLogin: '7d' })
    expect(screen.getByRole('button', { name: /Clear all user filters/i })).toBeInTheDocument()
  })

  it('is visible when pendingInvite is set', () => {
    renderFilters({ pendingInvite: '1' })
    expect(screen.getByRole('button', { name: /Clear all user filters/i })).toBeInTheDocument()
  })

  it('navigates to the base path without query params when clicked', async () => {
    const user = userEvent.setup()
    renderFilters({ roles: 'admin', status: 'active' })
    await user.click(screen.getByRole('button', { name: /Clear all user filters/i }))
    expect(getLastReplaceUrl()).toBe('/dashboard/users')
  })
})
