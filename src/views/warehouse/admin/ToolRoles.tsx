import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import type { AppRole, ToolRolesView } from '@/types/warehouse'

/** The tools with roles of their own; Stempelkort and Softwareload follow the Hub role. */
export type RoleTool = 'counts' | 'locations' | 'finland'

type Row = ToolRolesView['users'][number]
type CountRole = Exclude<AppRole, 'manager'>

interface ToolLabels {
  title: string
  intro: string
  /** The row's role in this tool; 'manager' shows the automatic badge. */
  current: (row: Row) => string
  choices: (current: string, view: ToolRolesView) => { value: string; label: string }[]
  help: (current: string) => string
  aria: (name: string) => string
  disabled: (current: string, view: ToolRolesView) => boolean
  /** The new role on the row, the text shown when it is saved and the write to the main process. */
  change: (row: Row, value: string) => { patch: Partial<Row>; saved: string; write: () => Promise<unknown> }
}

const countRoles = (): Record<CountRole, string> => ({ user: t('Bruger', 'User'), admin: 'Admin', 'status-manager': 'Status manager' })
const countHelp = (): Record<CountRole, string> => ({
  user: t('Tæller og scanner', 'Counts and scans'),
  admin: t('Med i alle optællinger, godkender deltagere', 'In every count, approves participants'),
  'status-manager': t('Som manager i Optælling', 'Like a manager in Stock count'),
})

const LABELS: Record<RoleTool, () => ToolLabels> = {
  counts: () => ({
    title: t('Optælling', 'Stock count'),
    intro: t(
      'En admin er med i alle optællinger uden at anmode, godkender deltagere, må lægge antal og serienumre på SAP-dokumenter og lave mailen til SAP-teamet. En status manager har de samme rettigheder som en manager i Optælling.',
      'An admin takes part in every count without asking, approves participants, may enter quantities and serial numbers on SAP documents and create the mail to the SAP team. A status manager has the same rights as a manager in Stock count.',
    ),
    current: row => row.role ?? 'user',
    choices: (current, view) => (view.canGrantStatusManager || current === 'status-manager' ? ['user', 'admin', 'status-manager'] as const : ['user', 'admin'] as const).map(value => ({ value, label: countRoles()[value] })),
    help: current => countHelp()[current as CountRole] ?? '',
    aria: name => t(`Optællingsrolle for ${name}`, `Stock count role for ${name}`),
    disabled: (current, view) => !view.canEdit || (current === 'status-manager' && !view.canGrantStatusManager),
    change: (row, value) => {
      const role = value as CountRole
      const label = countRoles()[role].toLowerCase()
      return {
        patch: { role },
        saved: t(`${row.fullName} er nu ${label} i Optælling`, `${row.fullName} is now ${label} in Stock count`),
        write: () => window.electronWarehouse!.roles.setRole({ email: row.email, role }),
      }
    },
  }),
  locations: () => ({
    title: t('Placeringer', 'Locations'),
    intro: t('En Placerings admin må vedligeholde placeringer og fortryde handlinger i loggen.', 'A Placerings admin may maintain locations and undo actions in the log.'),
    current: row => row.locationRole ?? 'user',
    choices: () => [{ value: 'user', label: t('Bruger', 'User') }, { value: 'location-admin', label: 'Placerings admin' }],
    help: current => (current === 'location-admin' ? t('Vedligeholder og fortryder', 'Maintains and undoes') : t('Bruger placeringerne', 'Uses the locations')),
    aria: name => t(`Placeringsrolle for ${name}`, `Locations role for ${name}`),
    disabled: (_current, view) => !view.canGrantStatusManager,
    change: (row, value) => {
      const admin = value === 'location-admin'
      return {
        patch: { locationRole: admin ? 'location-admin' : 'user' },
        saved: admin ? t(`${row.fullName} er nu Placerings admin`, `${row.fullName} is now a Placerings admin`) : t(`${row.fullName} er ikke længere Placerings admin`, `${row.fullName} is no longer a Placerings admin`),
        write: () => window.electronWarehouse!.roles.setLocationAdmin({ email: row.email, admin }),
      }
    },
  }),
  finland: () => ({
    title: 'Finlandsforsendelser',
    intro: t('Admin kan slette en række i arket for kolli, der ikke blev sendt.', 'An admin can delete a row in the sheet for parcels that were not sent.'),
    current: row => row.finlandRole ?? 'user',
    choices: () => [{ value: 'user', label: t('Bruger', 'User') }, { value: 'admin', label: 'Admin' }],
    help: current => (current === 'admin' ? t('Kan slette rækker for kolli, der ikke blev sendt', 'Can delete rows for parcels that were not sent') : t('Skriver kolli og følger op', 'Writes parcels and follows up')),
    aria: name => t(`Rolle i Finlandsforsendelser for ${name}`, `Finlandsforsendelser role for ${name}`),
    disabled: (_current, view) => !view.canGrantStatusManager,
    change: (row, value) => {
      const admin = value === 'admin'
      return {
        patch: { finlandRole: admin ? 'admin' : 'user' },
        saved: admin ? t(`${row.fullName} er nu admin i Finlandsforsendelser`, `${row.fullName} is now an admin in Finlandsforsendelser`) : t(`${row.fullName} er ikke længere admin i Finlandsforsendelser`, `${row.fullName} is no longer an admin in Finlandsforsendelser`),
        write: () => window.electronWarehouse!.admin.setFinlandAdmin({ email: row.email, admin }),
      }
    },
  }),
}

const SELECT_CLASS = 'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'

/** One tool's roles on the Administration page (moved from the Manager Panel's WarehouseRolesCard): every user of the team with that tool's role. */
export function ToolRoles({ tool, view, onView }: { tool: RoleTool; view: ToolRolesView; onView: Dispatch<SetStateAction<ToolRolesView | null>> }) {
  const labels = LABELS[tool]()

  // The new role shows at once and is saved in the background; a failed save puts the old role back.
  const change = (row: Row, value: string) => {
    const { patch, saved, write } = labels.change(row, value)
    const after = { ...row, ...patch }
    const swap = (from: Row, to: Row) => onView(current => current && { ...current, users: current.users.map(item => (item === from ? to : item)) })
    swap(row, after)
    toast.success(saved)
    void trackPendingWrite(write()).catch(error => {
      swap(after, row)
      toast.error(errorMessage(error, t('Rollen blev ikke gemt', 'The role was not saved')))
    })
  }

  return (
    <Card className="gap-0 p-6" data-tool-roles={tool}>
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{labels.intro}</p>
      <div className="space-y-2">
        {view.users.map(row => {
          const current = labels.current(row)
          return (
            <div key={row.email} className="flex items-center justify-between gap-4 rounded-md border p-4">
              <div className="min-w-0">
                <div className="truncate font-semibold">{row.fullName}</div>
                <div className="truncate text-sm text-muted-foreground">{row.email}</div>
              </div>
              {current === 'manager' ? <Badge variant="secondary">{t('Automatisk via managerrolle', 'Automatic through manager role')}</Badge> : (
                <label className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-muted-foreground sm:inline">{labels.help(current)}</span>
                  <select className={SELECT_CLASS} value={current} aria-label={labels.aria(row.fullName)} disabled={labels.disabled(current, view)} onChange={event => change(row, event.target.value)}>
                    {labels.choices(current, view).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
