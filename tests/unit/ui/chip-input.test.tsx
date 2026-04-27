/**
 * Unit tests for the generic ChipInput component.
 *
 * Covers controlled-component behaviour: chip rendering, commit triggers
 * (Enter / comma), trimming, case-insensitive dedupe, backspace removal,
 * X-button removal, and the maxChips / maxLength constraints.
 *
 * Uses @testing-library/user-event for realistic keyboard interactions.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ChipInput } from '@/components/ui/chip-input'

/**
 * Tiny harness that lets userEvent drive a controlled ChipInput.
 * Tests assert against `onChange` *and* against rendered chips, so we
 * thread a real state hook through the component.
 */
function Harness({
  initial = [],
  onChange,
  maxChips,
  maxLength,
  placeholder,
}: {
  initial?: string[]
  onChange?: (next: string[]) => void
  maxChips?: number
  maxLength?: number
  placeholder?: string
}) {
  const [chips, setChips] = useState<string[]>(initial)
  return (
    <ChipInput
      value={chips}
      onChange={(next) => {
        setChips(next)
        onChange?.(next)
      }}
      maxChips={maxChips}
      maxLength={maxLength}
      placeholder={placeholder ?? 'Add keyword'}
    />
  )
}

describe('<ChipInput />', () => {
  it('renders no chips when value is empty', () => {
    render(<Harness />)

    // The input is present, no remove buttons exist.
    expect(screen.getByPlaceholderText('Add keyword')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders existing chips passed via value', () => {
    render(<Harness initial={['python', 'kubernetes', 'aws']} />)

    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByText('kubernetes')).toBeInTheDocument()
    expect(screen.getByText('aws')).toBeInTheDocument()
    // One remove button per chip.
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('commits a new chip when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    await user.type(input, 'python{Enter}')

    expect(onChange).toHaveBeenLastCalledWith(['python'])
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('commits a new chip when comma is pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    await user.type(input, 'kubernetes,')

    expect(onChange).toHaveBeenLastCalledWith(['kubernetes'])
    expect(screen.getByText('kubernetes')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('does not commit a whitespace-only draft', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    await user.type(input, '   {Enter}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('rejects duplicate chips case-insensitively', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial={['Python']} onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    await user.type(input, 'python{Enter}')

    expect(onChange).not.toHaveBeenCalled()
    // Only the original chip remains.
    expect(screen.getAllByText(/python/i)).toHaveLength(1)
  })

  it('removes the last chip on Backspace when input is empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial={['python', 'kubernetes']} onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    input.focus()
    await user.keyboard('{Backspace}')

    expect(onChange).toHaveBeenLastCalledWith(['python'])
    expect(screen.queryByText('kubernetes')).not.toBeInTheDocument()
    expect(screen.getByText('python')).toBeInTheDocument()
  })

  it('does not remove a chip on Backspace when the input is non-empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial={['python']} onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    // Type then backspace one char — no chip removal should happen.
    await user.type(input, 'a{Backspace}')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('python')).toBeInTheDocument()
  })

  it('removes a chip when its X button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial={['python', 'kubernetes']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove python' }))

    expect(onChange).toHaveBeenLastCalledWith(['kubernetes'])
    expect(screen.queryByText('python')).not.toBeInTheDocument()
    expect(screen.getByText('kubernetes')).toBeInTheDocument()
  })

  it('hides the input and shows "Max reached" when maxChips is hit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial={['a', 'b']} maxChips={2} onChange={onChange} />)

    expect(screen.queryByPlaceholderText('Add keyword')).not.toBeInTheDocument()
    expect(screen.getByText('Max reached')).toBeInTheDocument()

    // No way to commit a new chip — but also assert defensively that
    // user.click of the existing X still works (i.e. the limit doesn't lock the UI).
    await user.click(screen.getByRole('button', { name: 'Remove b' }))
    expect(onChange).toHaveBeenLastCalledWith(['a'])
  })

  it('passes the maxLength prop through to the underlying input', () => {
    render(<Harness maxLength={50} />)

    const input = screen.getByPlaceholderText('Add keyword') as HTMLInputElement
    expect(input).toHaveAttribute('maxLength', '50')
  })

  it('trims surrounding whitespace before committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByPlaceholderText('Add keyword')
    await user.type(input, '  python  {Enter}')

    expect(onChange).toHaveBeenLastCalledWith(['python'])
  })
})
