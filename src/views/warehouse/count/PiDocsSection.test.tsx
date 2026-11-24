import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { PiDoc, SapStatus } from '@/types/warehouse'

const sap = vi.hoisted(() => ({ status: null as SapStatus | null }))

vi.mock('@/components/warehouse/SapStatusContext', () => ({ useSapStatus: () => ({ status: sap.status, checking: false, refresh: vi.fn() }) }))
vi.mock('@/components/ui/tooltip', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react')
  const Frame = ({ children }: { children?: ReactNode }) => createElement('span', null, children)
  return { Tooltip: Frame, TooltipContent: () => null, TooltipTrigger: Frame }
})

import { PiDocsSection } from './PiDocsSection'

const by = { email: 'a@example.test', name: 'A', at: 0 }
const base = { reference: 'CP-1', sloc: '0001', stockType: 'unrestricted' as const, kind: 'new' as const, lines: [], createdBy: by, canNext: true, canDelete: false, canResolve: false }
const docs: PiDoc[] = [
  { ...base, id: 'print', docNo: '100000001', status: 'created', next: 'print', canDelete: true },
  { ...base, id: 'count', docNo: '100000002', status: 'printed', next: 'count' },
  { ...base, id: 'post', docNo: '100000003', status: 'counted', next: 'post' },
  { ...base, id: 'unknown', docNo: '100000004', status: 'unknown', next: null, canNext: false, canResolve: true },
]

function render(ready: boolean, busy: string | null = null) {
  sap.status = { state: ready ? 'ready' : 'not-logged-in', ready, system: 'QS4', client: '100', user: null }
  const html = renderToStaticMarkup(
    <PiDocsSection list={{ system: 'QS4', writeEnabled: true, role: 'manager', canCreate: false, docs }} selected={null} busy={busy} figuresAt={null}
      onCreate={vi.fn()} onPrint={vi.fn()} onCount={vi.fn()} onPost={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} qtyOf={() => null} />,
  )
  return (label: string) => {
    const match = new RegExp(`<button([^>]*)>(?:(?!</button>).)*${label}`).exec(html)
    expect(match, label).not.toBeNull()
    return match![1]
  }
}

describe('PiDocsSection SAP buttons', () => {
  it('disables the SAP steps while SAP is not ready, but not resolving', () => {
    const button = render(false)
    for (const label of ['Print', 'Læg antal på', 'Bogfør', 'Slet i SAP']) expect(button(label), label).toContain('disabled=""')
    expect(button('Afklar')).not.toContain('disabled=""')
  })

  it('keeps the busy document loading when SAP is ready', () => {
    const button = render(true, 'print')
    expect(button('Print')).toContain('aria-busy="true"')
    expect(button('Afklar')).not.toContain('aria-busy="true"')
  })
})
