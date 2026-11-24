import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { PiDoc, PiDocCheck } from '@/types/warehouse'

const harness = vi.hoisted(() => ({
  state: [] as unknown[], stateIndex: 0,
  sapButtons: [] as Array<{ onAction: () => Promise<void> | void; children?: ReactNode }>,
  inputs: [] as Array<{ value?: string; 'aria-label'?: string }>,
}))

vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++
    if (!(index in harness.state)) harness.state[index] = initial
    return [harness.state[index], (next: unknown) => { harness.state[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(harness.state[index]) : next }]
  },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/warehouse/SapActionButton', () => ({ SapActionButton: (props: { onAction: () => Promise<void> | void; children?: ReactNode }) => {
  harness.sapButtons.push(props)
  return <button>{props.children}</button>
} }))
vi.mock('@/components/ui/input', () => ({ Input: (props: { value?: string; 'aria-label'?: string }) => { harness.inputs.push(props); return <input aria-label={props['aria-label']} defaultValue={props.value} /> } }))
vi.mock('@/components/ui/dialog', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react')
  const Frame = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  return { Dialog: Frame, DialogContent: Frame, DialogDescription: Frame, DialogFooter: Frame, DialogHeader: Frame, DialogTitle: Frame }
})

import { ResolveDialog } from './DocPanel'

const doc: PiDoc = {
  id: 'doc-1', reference: 'CP-ABC', status: 'unknown', sloc: '0001', stockType: 'unrestricted', kind: 'new', lines: [],
  createdBy: { email: 'a@example.test', name: 'A', at: 0 }, next: null, canNext: false, canDelete: false, canResolve: true,
  sapUnknown: { step: 'create', status: 'creating', by: { email: 'a@example.test', name: 'A', at: 0 }, detail: '' },
}
const check = vi.fn<(request: { id: string; docId: string }) => Promise<PiDocCheck>>()

function render() {
  harness.stateIndex = 0
  harness.sapButtons = []
  harness.inputs = []
  return renderToStaticMarkup(<ResolveDialog countId="count-1" item={doc} onCancel={vi.fn()} onResolve={vi.fn()} />)
}

async function pressCheck() {
  render()
  const button = harness.sapButtons.find(props => props.children === 'Tjek i SAP')
  expect(button).toBeDefined()
  await button!.onAction()
  return render()
}

const input = (label: string) => harness.inputs.find(props => props['aria-label'] === label)

beforeEach(() => {
  harness.state = []
  check.mockReset()
  vi.stubGlobal('window', { electronWarehouse: { piDocs: { check } } })
})

describe('ResolveDialog "Tjek i SAP"', () => {
  it('asks SAP about the document and fills the choice, number and reason, with the summary shown', async () => {
    check.mockResolvedValue({ outcome: 'saved', docNo: '100000123', reason: 'Tjek i SAP 24-11-2026 11:40: MI22 viser dokument 100000123.', summary: 'SAP har oprettet dokument 100000123.' })
    const html = await pressCheck()
    expect(check).toHaveBeenCalledWith({ id: 'count-1', docId: 'doc-1' })
    expect(html).toContain('SAP har oprettet dokument 100000123.')
    expect(html.indexOf('SAP har oprettet dokument')).toBeLessThan(html.indexOf('Oprettet i SAP'))
    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Oprettet i SAP/)
    expect(input('SAP-dokumentnummer')?.value).toBe('100000123')
    expect(input('Begrundelse')?.value).toBe('Tjek i SAP 24-11-2026 11:40: MI22 viser dokument 100000123.')
  })

  it('selects nothing when SAP cannot tell, and fills only the reason', async () => {
    check.mockResolvedValue({ outcome: null, docNo: null, reason: 'Tjek i SAP 24-11-2026 11:40: MI22 viser 2 dokumenter.', summary: 'SAP har 2 dokumenter på referencen.' })
    const html = await pressCheck()
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toContain('SAP har 2 dokumenter på referencen.')
    expect(input('SAP-dokumentnummer')).toBeUndefined()
    expect(input('Begrundelse')?.value).toBe('Tjek i SAP 24-11-2026 11:40: MI22 viser 2 dokumenter.')
  })

  it('shows a failed check in the dialog and fills nothing', async () => {
    check.mockRejectedValue(new Error("Error invoking remote method 'warehouse': Error: PIDOC_SAP_FAILED: MI22 svarede ikke"))
    const html = await pressCheck()
    expect(html).toMatch(/role="alert"[^>]*>MI22 svarede ikke</)
    expect(html).not.toContain('aria-pressed="true"')
    expect(input('Begrundelse')?.value).toBe('')
  })
})
