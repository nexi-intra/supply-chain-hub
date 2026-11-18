import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Warehouse as WarehouseIcon } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SapIndicator } from '@/components/warehouse/SapIndicator'
import { SapStatusProvider } from '@/components/warehouse/SapStatusContext'
import { TableSelection } from '@/components/warehouse/TableSelection'
import { consumeNavigationParams } from '@/lib/appNavigation'
import { useLanguage } from '@/contexts/LanguageContext'
import { isAnyModalOpen } from '@/lib/modalStack'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/warehouse/errors'
import { t, useWarehouseLanguage } from '@/lib/warehouse/text'
import { getWarehouseLabels } from '@/lib/warehouseLabels'
import { targetFromItem, type LocationsTarget } from '@/lib/warehouse/locations'
import type { Language } from '@/lib/translations'
import type { AppRole, WarehouseUser } from '@/types/warehouse'
import { Archive } from './Archive'
import { CountView, type CountTab } from './count/CountView'
import { Counts } from './Counts'
import { NewCount } from './NewCount'
import { Rules } from './Rules'
import { SapCheck } from './SapCheck'
import { SerialRules } from './SerialRules'
import { StatusView } from './StatusView'
import { WarehouseHome, type WarehouseTool } from './WarehouseHome'
import { Locations } from './locations/Locations'

export type View = { kind: 'list' } | { kind: 'new' } | { kind: 'count'; id: string; tab?: CountTab } | { kind: 'status'; id: string; from?: 'archive' } | { kind: 'archive' } | { kind: 'rules' } | { kind: 'serial-rules' } | { kind: 'sap-check' }

const TOP_LEVEL = new Set<View['kind']>(['list', 'archive', 'rules', 'serial-rules', 'sap-check'])

type Tool = 'home' | WarehouseTool

/**
 * Without params Lagerstyring opens on its own hub page. Deep links (Hubert, notifications) go straight into Optælling:
 * tab = counts|archive|rules|serial-rules|sap-check, itemId = count id or "status:<id>". A count from a notification
 * opens on its tab: tab = count-members|count-approval (or count).
 */
function initialState(): { tool: Tool; view: View; locations: LocationsTarget } {
  const params = consumeNavigationParams()
  if (!params?.tab && !params?.itemId) return { tool: 'home', view: { kind: 'list' }, locations: { kind: 'home' } }
  // tab = locations: Placeringer, itemId = material:X | location:Y | pallet:Z | refill | …
  if (params.tab === 'locations') return { tool: 'locations', view: { kind: 'list' }, locations: targetFromItem(params.itemId) }
  return { tool: 'counts', view: countsView(params.tab, params.itemId || ''), locations: { kind: 'home' } }
}

const COUNT_TABS: Record<string, CountTab> = { 'count-members': 'members', 'count-approval': 'approval' }

function countsView(tab: string | undefined, item: string): View {
  if (item.startsWith('status:')) return { kind: 'status', id: item.slice(7), from: tab === 'archive' ? 'archive' : undefined }
  if (item) return tab && COUNT_TABS[tab] ? { kind: 'count', id: item, tab: COUNT_TABS[tab] } : { kind: 'count', id: item }
  if (tab === 'archive' || tab === 'rules' || tab === 'serial-rules' || tab === 'sap-check') return { kind: tab }
  return { kind: 'list' }
}

/** Warehouse Management (Lagerstyring) for TCD and TRR: a hub of warehouse tools. Today it holds one tool: Optælling (stock counting). */
export function Warehouse({ onNavigateBack }: { onNavigateBack: () => void }) {
  const [user, setUser] = useState<WarehouseUser | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [start] = useState(initialState)
  const [tool, setTool] = useState<Tool>(start.tool)
  const [view, setView] = useState<View>(start.view)
  const toHome = useCallback(() => { setTool('home'); setView({ kind: 'list' }) }, [])
  // Keeps t() in step with the Hub language; the whole module re-renders below this component when it changes.
  const language = useWarehouseLanguage()
  const { language: hubLanguage } = useLanguage()

  useEffect(() => {
    const bridge = window.electronWarehouse
    if (!bridge) { setFailed(t('Lagerstyring kræver Supply Chain Hub-programmet.', 'Warehouse Management needs the Supply Chain Hub program.')); return }
    bridge.me().then(setUser).catch(error => setFailed(errorMessage(error)))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isAnyModalOpen()) return
      // Escape goes one level up: from a tool to the Lagerstyring page, from there to the front page.
      if (tool === 'home') onNavigateBack()
      else if (TOP_LEVEL.has(view.kind)) toHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool, view.kind, onNavigateBack, toHome])

  const page = (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 shadow-sm backdrop-blur-sm">
        <div className="container mx-auto flex flex-wrap items-center gap-4 px-4 py-6 sm:px-6">
          <Button variant="outline" size="lg" onClick={tool === 'home' ? onNavigateBack : toHome} className="gap-2 px-4 font-semibold">
            <ArrowLeft size={20} />
            {t('Tilbage', 'Back')}
          </Button>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            <WarehouseIcon size={26} weight="duotone" className="text-primary" />
            {getWarehouseLabels(hubLanguage as Language).title}
            {tool === 'counts' && <><span className="text-muted-foreground">·</span><span className="text-muted-foreground">{t('Optælling', 'Stock count')}</span></>}
            {tool === 'locations' && <><span className="text-muted-foreground">·</span><span className="text-muted-foreground">{t('Placeringer', 'Locations')}</span></>}
          </h1>
          {user && <Badge variant="secondary" className="font-mono">{user.team}</Badge>}
          {user && tool !== 'home' && <div className="ml-auto"><SapIndicator /></div>}
        </div>
      </div>
      {failed && (
        <div className="container mx-auto px-4 py-8 sm:px-6">
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>
        </div>
      )}
      {!failed && !user && <div className="container mx-auto px-4 py-8 sm:px-6"><Skeleton className="h-64 rounded-xl" /></div>}
      {user && tool === 'home' && <WarehouseHome key={language} user={user} onOpen={setTool} />}
      {user && tool === 'locations' && <Locations key={language} user={user} initial={start.locations} />}
      {user && tool === 'counts' && (
        <>
          <WarehouseContent key={language} user={user} view={view} onNavigate={setView} />
          <TableSelection />
        </>
      )}
    </div>
  )
  // SAP is polled only inside a tool for a TCD/TRR person; the Lagerstyring page and other hubs never reach SAP.
  return user && tool !== 'home' ? <SapStatusProvider>{page}</SapStatusProvider> : page
}

function WarehouseContent({ user, view, onNavigate }: { user: WarehouseUser; view: View; onNavigate: (view: View) => void }) {
  // Admins and status managers are appointed in Optælling, so the Hub role alone is not enough.
  const [appRole, setAppRole] = useState<AppRole>(user.role === 'user' ? 'user' : 'manager')
  const checkRole = useCallback(() => {
    if (user.role !== 'user') return
    window.electronWarehouse?.roles.me().then(result => setAppRole(result.role)).catch(() => {})
  }, [user.role])
  useEffect(() => {
    checkRole()
    const timer = window.setInterval(checkRole, 60000)
    return () => window.clearInterval(timer)
  }, [checkRole, view.kind])
  const isManager = appRole === 'manager' || appRole === 'status-manager'
  const tabs: { label: string; target: View; active: boolean }[] = [
    { label: t('Optællinger', 'Counts'), target: { kind: 'list' }, active: ['list', 'new', 'count'].includes(view.kind) || (view.kind === 'status' && view.from !== 'archive') },
    { label: t('Arkiv', 'Archive'), target: { kind: 'archive' }, active: view.kind === 'archive' || (view.kind === 'status' && view.from === 'archive') },
    { label: t('Lagerregler', 'Storage rules'), target: { kind: 'rules' }, active: view.kind === 'rules' },
    ...(user.team === 'TCD' ? [{ label: t('Serienummerregler', 'Serial number rules'), target: { kind: 'serial-rules' } as View, active: view.kind === 'serial-rules' }] : []),
    { label: t('Tjek SAP-fejl', 'Check SAP errors'), target: { kind: 'sap-check' }, active: view.kind === 'sap-check' },
  ]
  const toList = () => onNavigate({ kind: 'list' })

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6">
      <nav className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1" aria-label={t('Optælling', 'Stock count')}>
        {tabs.map(tab => (
          <button key={tab.label} type="button" onClick={() => onNavigate(tab.target)} aria-current={tab.active ? 'page' : undefined}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', tab.active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {tab.label}
          </button>
        ))}
        <span className="ml-auto px-2 text-xs text-muted-foreground">Plant D301 · {appRole === 'status-manager' ? 'Status manager' : appRole === 'admin' ? 'Admin' : isManager ? 'Manager' : t('Bruger', 'User')}</span>
      </nav>
      {view.kind === 'list' && <Counts user={user} onNew={() => onNavigate({ kind: 'new' })} onOpen={id => onNavigate({ kind: 'count', id })} onOpenStatus={id => onNavigate({ kind: 'status', id })} onOpenSapCheck={() => onNavigate({ kind: 'sap-check' })} />}
      {view.kind === 'status' && <StatusView key={view.id} id={view.id} onBack={() => onNavigate(view.from === 'archive' ? { kind: 'archive' } : { kind: 'list' })} onOpenCount={id => onNavigate({ kind: 'count', id })} />}
      {view.kind === 'archive' && <Archive user={user} onOpenStatus={id => onNavigate({ kind: 'status', id, from: 'archive' })} />}
      {view.kind === 'new' && <NewCount user={user} onCancel={toList} onCreated={id => onNavigate({ kind: 'count', id })} />}
      {view.kind === 'count' && <CountView key={view.id} id={view.id} user={user} initialTab={view.tab} onBack={toList} />}
      {view.kind === 'rules' && <Rules user={user} onBack={toList} />}
      {view.kind === 'serial-rules' && <SerialRules user={user} onBack={toList} />}
      {view.kind === 'sap-check' && <SapCheck user={user} onBack={toList} />}
    </div>
  )
}
