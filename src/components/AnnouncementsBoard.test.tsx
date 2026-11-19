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

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('announcement save while the shared storage is slow', () => {
  it('closes the dialog and confirms at once while the write runs in the background, and saves only once on double click', async () => {
    vi.mocked(appendToKvArray).mockReturnValue(new Promise<unknown[]>(() => {}) as never)
    const save = enterAnnouncement()
    expect(save()).toBeUndefined()
    save()
    expect(appendToKvArray).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledOnce()
    expect(harness.state[0]).toBe(false)
    expect(harness.state[1]).toBe('')
    expect(harness.state[2]).toBe('')
    expect(render()).not.toContain('aria-busy="true"')
  })

  it('brings the text back and retries with the same identity after a failed write', async () => {
    vi.mocked(appendToKvArray).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce([] as never)
    const save = enterAnnouncement()
    save()
    expect(toast.success).toHaveBeenCalledOnce()
    await flush()
    expect(toast.error).toHaveBeenCalledOnce()
    expect(harness.state[0]).toBe(true)
    expect(harness.state[1]).toBe('Status')
    expect(harness.state[2]).toBe('Team update')
    render()
    harness.buttons[harness.buttons.length - 1].onClick!()
    await flush()
    const first = vi.mocked(appendToKvArray).mock.calls[0][1]
    const retried = vi.mocked(appendToKvArray).mock.calls[1][1]
    expect(retried).toEqual(first)
    expect(toast.error).toHaveBeenCalledOnce()
  })
})