import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

const harness = vi.hoisted(() => ({
  state: [] as unknown[], refs: [] as Array<{ current: unknown }>, stateIndex: 0, refIndex: 0,
  buttons: [] as Array<{ onClick?: () => Promise<void> | void; loading?: boolean }>,
  inputs: [] as Array<{ onChange: (event: { target: { value: string } }) => void }>,
}))

vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++
    if (!(index in harness.state)) harness.state[index] = initial
    return [harness.state[index], (next: unknown) => { harness.state[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(harness.state[index]) : next }]
  },
  useRef(initial: unknown) {
    const index = harness.refIndex++
    if (!(index in harness.refs)) harness.refs[index] = { current: initial }
    return harness.refs[index]
  },
}))
vi.mock('@/hooks/useKV', () => ({ useKV: () => [[], vi.fn()] }))
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'da' }) }))
vi.mock('@/lib/kvArrays', () => ({ appendToKvArray: vi.fn(), removeFromKvArray: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/ui/button', () => ({ Button: (props: { children: ReactNode; onClick?: () => Promise<void> | void; disabled?: boolean; loading?: boolean }) => {
  harness.buttons.push(props)
  return <button disabled={props.disabled || props.loading} aria-busy={props.loading || undefined}>{props.children}</button>
} }))
vi.mock('@/components/ui/input', () => ({ Input: (props: { onChange: (event: { target: { value: string } }) => void }) => { harness.inputs.push(props); return <input /> } }))
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props: { onChange: (event: { target: { value: string } }) => void }) => { harness.inputs.push(props); return <textarea /> } }))
vi.mock('@/components/ui/dialog', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react')
  const Frame = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  return { Dialog: Frame, DialogContent: Frame, DialogFooter: Frame, DialogHeader: Frame, DialogTitle: Frame }
})

import { appendToKvArray } from '@/lib/kvArrays'
import { toast } from 'sonner'
import { AnnouncementsBoard } from './AnnouncementsBoard'

function render() {
  harness.stateIndex = 0
  harness.refIndex = 0
  harness.buttons = []
  harness.inputs = []
  return renderToStaticMarkup(<AnnouncementsBoard userEmail="user@example.test" userName="User" canPost />)
}

function enterAnnouncement() {
  render()
  harness.inputs[0].onChange({ target: { value: 'Status' } })
  harness.inputs[1].onChange({ target: { value: 'Team update' } })
  render()
  return harness.buttons[harness.buttons.length - 1].onClick!
}

beforeEach(() => {
  harness.state = []
  harness.refs = []
  vi.clearAllMocks()
})

describe('announcement save while the shared storage is slow', () => {
  it('accepts only one click until the pending save completes', async () => {
    let resolve!: (value: unknown[]) => void
    vi.mocked(appendToKvArray).mockReturnValueOnce(new Promise<unknown[]>(done => { resolve = done }) as never)
    const save = enterAnnouncement()
    const first = save()
    const second = save()
    expect(appendToKvArray).toHaveBeenCalledTimes(1)
    expect(render()).toContain('aria-busy="true"')
    resolve([])
    await Promise.all([first, second])
    expect(toast.success).toHaveBeenCalledOnce()
    expect(harness.state[2]).toBe('')
  })

  it('retains the draft and retries with the same identity after an uncertain failure', async () => {
    vi.mocked(appendToKvArray).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce([] as never)
    const save = enterAnnouncement()
    await save()
    expect(toast.error).toHaveBeenCalledOnce()
    expect(harness.state[2]).toBe('Status')
    render()
    await harness.buttons[harness.buttons.length - 1].onClick!()
    const first = vi.mocked(appendToKvArray).mock.calls[0][1]
    const retried = vi.mocked(appendToKvArray).mock.calls[1][1]
    expect(retried).toEqual(first)
    expect(toast.success).toHaveBeenCalledOnce()
  })
})