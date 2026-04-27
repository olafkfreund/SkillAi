/**
 * Unit tests for the <VerifiedProfileChip /> component.
 *
 * Covers:
 *   - source label + truncated URL rendering
 *   - <ConfidencePill /> tier mapping (high / medium / low) shown alongside
 *   - external link safety (target=_blank, rel=noopener)
 *   - conditional Confirm/Dismiss button visibility based on canEdit + showConfirm
 *   - callback wiring on click
 *   - disabled state during the async useTransition
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerifiedProfileChip } from '@/components/candidates/verified-profile-chip'

describe('<VerifiedProfileChip />', () => {
  it('renders the source label and a truncated URL (host + path)', () => {
    render(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane-doe/?utm=spam"
        confidence={92}
        category="high"
        canEdit={false}
      />,
    )

    expect(screen.getByText('LinkedIn:')).toBeInTheDocument()
    // URL is collapsed to host + path, no query string, no trailing slash.
    expect(screen.getByText('www.linkedin.com/in/jane-doe')).toBeInTheDocument()
  })

  it('renders ConfidencePill with the High match label for scores ≥ 85', () => {
    render(
      <VerifiedProfileChip
        source="github"
        url="https://github.com/jane"
        confidence={92}
        category="high"
        canEdit={false}
      />,
    )

    expect(screen.getByText(/High match · 92/)).toBeInTheDocument()
  })

  it('renders ConfidencePill with the Suggested label for medium scores (60–84)', () => {
    render(
      <VerifiedProfileChip
        source="github"
        url="https://github.com/jane"
        confidence={70}
        category="medium"
        canEdit={false}
      />,
    )

    expect(screen.getByText(/Suggested · 70/)).toBeInTheDocument()
  })

  it('renders ConfidencePill with the Weak match label for low scores (40–59)', () => {
    render(
      <VerifiedProfileChip
        source="github"
        url="https://github.com/jane"
        confidence={45}
        category="low"
        canEdit={false}
      />,
    )

    expect(screen.getByText(/Weak match · 45/)).toBeInTheDocument()
  })

  it('opens the external link in a new tab with safe rel attributes', () => {
    render(
      <VerifiedProfileChip
        source="github"
        url="https://github.com/jane"
        confidence={92}
        category="high"
        canEdit={false}
      />,
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://github.com/jane')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders the Confirm button only when canEdit && showConfirm && onConfirm', () => {
    const { rerender } = render(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={true}
        showConfirm={false}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Confirm this profile' })).not.toBeInTheDocument()

    rerender(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={false}
        showConfirm={true}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Confirm this profile' })).not.toBeInTheDocument()

    rerender(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={true}
        showConfirm={true}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Confirm this profile' })).toBeInTheDocument()
  })

  it('renders the Dismiss button when canEdit && onDismiss is provided', () => {
    render(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={true}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Dismiss this profile' })).toBeInTheDocument()
  })

  it('does not render the Dismiss button when canEdit is false', () => {
    render(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={false}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Dismiss this profile' })).not.toBeInTheDocument()
  })

  it('invokes onConfirm when the Confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    render(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={true}
        showConfirm={true}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm this profile' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('invokes onDismiss when the Dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn().mockResolvedValue(undefined)

    render(
      <VerifiedProfileChip
        source="github"
        url="https://github.com/jane"
        confidence={45}
        category="low"
        canEdit={true}
        onDismiss={onDismiss}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Dismiss this profile' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('disables both action buttons while the async transition is pending', async () => {
    const user = userEvent.setup()
    // A promise we hold open so that the useTransition pending state is
    // observable. We resolve it at the end of the test and wait, so React
    // doesn't warn about state updates outside act().
    let resolveConfirm: () => void = () => {}
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve
        }),
    )
    const onDismiss = vi.fn()

    render(
      <VerifiedProfileChip
        source="linkedin"
        url="https://www.linkedin.com/in/jane"
        confidence={70}
        category="medium"
        canEdit={true}
        showConfirm={true}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />,
    )

    const confirmBtn = screen.getByRole('button', { name: 'Confirm this profile' })
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss this profile' })

    await user.click(confirmBtn)

    // While the unresolved promise is in flight, both buttons should be disabled.
    expect(confirmBtn).toBeDisabled()
    expect(dismissBtn).toBeDisabled()

    // Let the transition settle to keep React + testing-library happy.
    resolveConfirm()
    await waitFor(() => expect(confirmBtn).not.toBeDisabled())
  })
})
