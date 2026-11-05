import { useCallback, useEffect, useState } from 'react'
import { Warehouse } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Language } from '@/lib/translations'
import { isWarehouseTeam } from '@/lib/warehouseLabels'
import { errorMessage } from '@/lib/warehouse/errors'
import type { AppRole, RolesView } from '@/types/warehouse'

type Editable = Exclude<AppRole, 'manager'>
type LocationChoice = 'user' | 'location-admin'

interface Labels {
  title: string
  intro: string
  automatic: string
  roles: Record<Editable, string>
  roleHelp: Record<Editable, string>
  saved: (name: string, role: string) => string
  failed: string
  aria: (name: string) => string
  counts: string
  locations: string
  locationRoles: Record<LocationChoice, string>
  locationHelp: Record<LocationChoice, string>
  locationSaved: (name: string, admin: boolean) => string
  locationAria: (name: string) => string
}

/** A Hub manager's row shows the automatic badge; everyone else is a user or a Placerings admin in Placeringer. */
const locationOf = (role: RolesView['users'][number]['locationRole']): LocationChoice => (role === 'location-admin' ? 'location-admin' : 'user')

const LABELS: Record<Language, Labels> = {
  da: {
    title: 'Lagerstyringsroller',
    intro: 'Roller i Lagerstyring for dette team. Managere har altid alle rettigheder. I Optælling må en admin lægge antal og serienumre på SAP-dokumenter og lave mailen til SAP-teamet, og en status manager har de samme rettigheder som en manager. I Placeringer må en Placerings admin vedligeholde placeringer og fortryde handlinger i loggen.',
    automatic: 'Automatisk via managerrolle',
    roles: { user: 'Bruger', admin: 'Admin', 'status-manager': 'Status manager' },
    roleHelp: { user: 'Tæller og scanner', admin: 'Lægger antal på SAP-dokumenter', 'status-manager': 'Som manager i Optælling' },
    saved: (name, role) => `${name} er nu ${role.toLowerCase()} i Optælling`,
    failed: 'Rollen blev ikke gemt',
    aria: name => `Optællingsrolle for ${name}`,
    counts: 'Optælling',
    locations: 'Placeringer',
    locationRoles: { user: 'Bruger', 'location-admin': 'Placerings admin' },
    locationHelp: { user: 'Bruger placeringerne', 'location-admin': 'Vedligeholder og fortryder' },
    locationSaved: (name, admin) => admin ? `${name} er nu Placerings admin` : `${name} er ikke længere Placerings admin`,
    locationAria: name => `Placeringsrolle for ${name}`,
  },
  en: {
    title: 'Warehouse roles',
    intro: 'Roles in Warehouse Management for this team. Managers always have every right. In Stock count an admin may enter quantities and serial numbers on SAP documents and create the mail to the SAP team, and a status manager has the same rights as a manager. In Locations a Placerings admin may maintain locations and undo actions in the log.',
    automatic: 'Automatic through manager role',
    roles: { user: 'User', admin: 'Admin', 'status-manager': 'Status manager' },
    roleHelp: { user: 'Counts and scans', admin: 'Enters quantities on SAP documents', 'status-manager': 'Like a manager in Stock count' },
    saved: (name, role) => `${name} is now ${role.toLowerCase()} in Stock count`,
    failed: 'The role was not saved',
    aria: name => `Stock count role for ${name}`,
    counts: 'Stock count',
    locations: 'Locations',
    locationRoles: { user: 'User', 'location-admin': 'Placerings admin' },
    locationHelp: { user: 'Uses the locations', 'location-admin': 'Maintains and undoes' },
    locationSaved: (name, admin) => admin ? `${name} is now a Placerings admin` : `${name} is no longer a Placerings admin`,
    locationAria: name => `Locations role for ${name}`,
  },
  fi: {
    title: 'Varastonhallinnan roolit',
    intro: 'Tämän tiimin roolit Varastonhallinnassa. Managereilla on aina kaikki oikeudet. Inventoinnissa admin saa syöttää määrät ja sarjanumerot SAP-asiakirjoihin ja tehdä viestin SAP-tiimille, ja status managerilla on samat oikeudet kuin managerilla. Sijainneissa Placerings admin saa ylläpitää sijainteja ja perua toimintoja lokissa.',
    automatic: 'Automaattinen esihenkilöroolin kautta',
    roles: { user: 'Käyttäjä', admin: 'Admin', 'status-manager': 'Status manager' },
    roleHelp: { user: 'Laskee ja skannaa', admin: 'Syöttää määrät SAP-asiakirjoihin', 'status-manager': 'Kuten manager Inventoinnissa' },
    saved: (name, role) => `${name}: rooli on nyt ${role.toLowerCase()} Inventoinnissa`,
    failed: 'Roolia ei tallennettu',
    aria: name => `Inventointirooli: ${name}`,
    counts: 'Inventointi',
    locations: 'Sijainnit',
    locationRoles: { user: 'Käyttäjä', 'location-admin': 'Placerings admin' },
    locationHelp: { user: 'Käyttää sijainteja', 'location-admin': 'Ylläpitää ja peruu' },
    locationSaved: (name, admin) => admin ? `${name} on nyt Placerings admin` : `${name} ei ole enää Placerings admin`,
    locationAria: name => `Sijaintirooli: ${name}`,
  },
  sv: {
    title: 'Lagerstyrningsroller',
    intro: 'Roller i Lagerstyrning för det här teamet. Managers har alltid alla rättigheter. I Inventering får en admin lägga in antal och serienummer på SAP-dokument och skapa mejlet till SAP-teamet, och en status manager har samma rättigheter som en manager. I Placeringar får en Placerings admin underhålla placeringar och ångra åtgärder i loggen.',
    automatic: 'Automatiskt via chefsroll',
    roles: { user: 'Användare', admin: 'Admin', 'status-manager': 'Status manager' },
    roleHelp: { user: 'Räknar och skannar', admin: 'Lägger in antal på SAP-dokument', 'status-manager': 'Som en manager i Inventering' },
    saved: (name, role) => `${name} är nu ${role.toLowerCase()} i Inventering`,
    failed: 'Rollen sparades inte',
    aria: name => `Inventeringsroll för ${name}`,
    counts: 'Inventering',
    locations: 'Placeringar',
    locationRoles: { user: 'Användare', 'location-admin': 'Placerings admin' },
    locationHelp: { user: 'Använder placeringarna', 'location-admin': 'Underhåller och ångrar' },
    locationSaved: (name, admin) => admin ? `${name} är nu Placerings admin` : `${name} är inte längre Placerings admin`,
    locationAria: name => `Placeringsroll för ${name}`,
  },
}

/** Lagerstyring's own roles in the Manager Panel, like Guide Admins: Optælling (admin, status manager) and Placeringer (Placerings admin). Only in the TCD and TRR hubs. */
export function WarehouseRolesCard() {
  const { language } = useLanguage()
  const labels = LABELS[language] ?? LABELS.en
  const [view, setView] = useState<RolesView | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const bridge = window.electronWarehouse
    const team = await window.electronRegistry?.getCurrentTeam().catch(() => null)
    if (!bridge || !isWarehouseTeam(team?.teamId)) return setView(null)
    try {
      setView(await bridge.roles.list())
    } catch {
      setView(null)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!view) return null

  const setRole = async (email: string, name: string, role: Editable) => {
    setSaving(email)
    try {
      await window.electronWarehouse!.roles.setRole({ email, role })
      toast.success(labels.saved(name, labels.roles[role]))
      await load()
    } catch (error) {
      toast.error(language === 'da' ? errorMessage(error, labels.failed) : labels.failed)
    } finally {
      setSaving(null)
    }
  }
  const setLocationAdmin = async (email: string, name: string, admin: boolean) => {
    setSaving(email)
    try {
      await window.electronWarehouse!.roles.setLocationAdmin({ email, admin })
      toast.success(labels.locationSaved(name, admin))
      await load()
    } catch (error) {
      toast.error(language === 'da' ? errorMessage(error, labels.failed) : labels.failed)
    } finally {
      setSaving(null)
    }
  }
  const choices = (current: Editable): Editable[] => view.canGrantStatusManager || current === 'status-manager' ? ['user', 'admin', 'status-manager'] : ['user', 'admin']

  return (
    <Card className="p-6" data-warehouse-roles>
      <div className="mb-5 flex items-start gap-3">
        <Warehouse size={28} className="shrink-0 text-primary" weight="duotone" />
        <div>
          <h2 className="text-2xl font-bold">{labels.title} · {view.team}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.intro}</p>
        </div>
      </div>
      <div className="space-y-2">
        {view.users.map(item => (
          <div key={item.email} className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="min-w-0">
              <div className="truncate font-semibold">{item.fullName}</div>
              <div className="truncate text-sm text-muted-foreground">{item.email}</div>
            </div>
            {item.role === 'manager' ? <Badge variant="secondary">{labels.automatic}</Badge> : (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-4">
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{labels.counts}</span><span className="hidden sm:inline"> · {labels.roleHelp[item.role]}</span></span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    value={item.role}
                    aria-label={labels.aria(item.fullName)}
                    disabled={!view.canEdit || saving === item.email || (item.role === 'status-manager' && !view.canGrantStatusManager)}
                    onChange={event => void setRole(item.email, item.fullName, event.target.value as Editable)}
                  >
                    {choices(item.role).map(role => <option key={role} value={role}>{labels.roles[role]}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{labels.locations}</span><span className="hidden sm:inline"> · {labels.locationHelp[locationOf(item.locationRole)]}</span></span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    value={locationOf(item.locationRole)}
                    aria-label={labels.locationAria(item.fullName)}
                    disabled={!view.canGrantStatusManager || saving === item.email}
                    onChange={event => void setLocationAdmin(item.email, item.fullName, event.target.value === 'location-admin')}
                  >
                    {(['user', 'location-admin'] as const).map(role => <option key={role} value={role}>{labels.locationRoles[role]}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
