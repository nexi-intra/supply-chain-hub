import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WarehouseUser } from '@/types/warehouse'
import { WarehouseHome } from './WarehouseHome'

const user = (tools: WarehouseUser['tools']): WarehouseUser => ({ email: 'a@b.dk', fullName: 'A B', role: 'user', team: 'TCD', storageLocations: [], tools })

describe('WarehouseHome', () => {
  beforeAll(() => {
    // A bridge without methods: the page must not call anything the team has no tool for. framer-motion needs the listeners.
    globalThis.window = { electronWarehouse: {}, addEventListener: () => {}, removeEventListener: () => {} } as unknown as Window & typeof globalThis
  })
  afterAll(() => { Reflect.deleteProperty(globalThis, 'window') })

  it("shows only the team's tools", () => {
    const html = renderToStaticMarkup(<WarehouseHome user={user(['finland'])} onOpen={() => {}} />)
    expect(html).toContain('Finlandsforsendelser')
    expect(html).not.toContain('Optælling')
  })

  it('says when the team has no tools', () => {
    const html = renderToStaticMarkup(<WarehouseHome user={user([])} onOpen={() => {}} />)
    expect(html).toContain('Dit team har ingen værktøjer i Arbejdsværktøjer endnu.')
  })
})
