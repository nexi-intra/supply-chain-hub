import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import type { ToolRolesView, WarehouseUser } from '@/types/warehouse'
import { FinlandAdmin } from './FinlandAdmin'
import { ToolRoles, type RoleTool } from './ToolRoles'

const ROLE_TOOLS: readonly RoleTool[] = ['counts', 'locations', 'finland']

/**
 * Administration in Arbejdsværktøjer, for Hub managers and creators (user.canAdminister): one section per tool of the
 * team that has roles of its own. The roles moved here from the Manager Panel.
 */
export function WarehouseAdmin({ user }: { user: WarehouseUser }) {
  const [view, setView] = useState<ToolRolesView | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const sections = ROLE_TOOLS.filter(tool => user.tools.includes(tool))

  useEffect(() => {
    let current = true
    window.electronWarehouse?.admin.roles()
      .then(result => { if (current) setView(result) })
      .catch(error => { if (current) setFailed(errorMessage(error)) })
    return () => { current = false }
  }, [user.team])

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <p className="text-sm text-muted-foreground">
        {t(`Roller i Arbejdsværktøjer for team ${user.team}. Managere har altid alle rettigheder.`, `Roles in Work Tools for team ${user.team}. Managers always have every right.`)}
        {user.tools.includes('timeclock') && ` ${t('Kun managere ser tiderne i Stempelkort.', 'Only managers see the times in Time card.')}`}
      </p>
      {failed && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{failed}</p>}
      {!failed && !view && <Skeleton className="h-64 rounded-xl" />}
      {view && sections.map(tool => (
        <section key={tool} className="space-y-4">
          <ToolRoles tool={tool} view={view} onView={setView} />
          {tool === 'finland' && <FinlandAdmin />}
        </section>
      ))}
    </div>
  )
}
