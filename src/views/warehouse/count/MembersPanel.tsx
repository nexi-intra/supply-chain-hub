import { Check, LockKey, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/warehouse/text'
import { formatDateTime, formatTime } from '@/lib/warehouse/format'
import type { PanelProps } from './CountView'
import { withClaim, withMember } from './optimisticState'

const statusLabels = () => ({ requested: t('Anmodet', 'Requested'), approved: t('Deltager', 'Participant'), rejected: t('Afvist', 'Rejected') }) as const

export function MembersPanel({ id, state, optimistic, person }: PanelProps) {
  const isOwner = state.me.isOwner && !state.statusLocked
  const canDecide = state.me.canDecideMembers && !state.statusLocked
  // Shown at once; the write to M: (15–90 s) runs in the background and is taken back if it fails.
  const decide = (email: string, approve: boolean) => {
    const member = state.members.find(item => item.email === email)
    if (!member) return
    toast.success(approve ? t('Deltageren er godkendt', 'The participant is approved') : t('Anmodningen er afvist', 'The request is rejected'))
    void optimistic(withMember({ ...member, status: approve ? 'approved' : 'rejected', decidedBy: person, decidedAt: Date.now() }), () => window.electronWarehouse!.counts.decideMember({ id, email, approve }))
  }
  const release = (area: string) => {
    void optimistic(withClaim(area, null), () => window.electronWarehouse!.counts.release({ id, area }))
  }
  const members = [...state.members].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : (a.status === 'requested' ? -1 : 0) - (b.status === 'requested' ? -1 : 0) || a.name.localeCompare(b.name, 'da')))

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">{t('Deltagere', 'Participants')}</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {members.map(member => (
              <li key={member.email} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}{member.requestedAt ? ` · ${formatDateTime(member.requestedAt)}` : ''}</p>
                </div>
                {member.role === 'owner' ? <Badge>{t('Ansvarlig', 'Responsible')}</Badge> : <Badge variant={member.status === 'rejected' ? 'destructive' : member.status === 'requested' ? 'outline' : 'secondary'}>{statusLabels()[member.status]}</Badge>}
                {canDecide && member.role !== 'owner' && member.status !== 'approved' && (
                  <Button size="sm" onClick={() => decide(member.email, true)}><Check size={16} /> {t('Godkend', 'Approve')}</Button>
                )}
                {canDecide && member.role !== 'owner' && member.status !== 'rejected' && (
                  <Button size="sm" variant="ghost" onClick={() => decide(member.email, false)}><X size={16} /> {member.status === 'approved' ? t('Fjern', 'Remove') : t('Afvis', 'Reject')}</Button>
                )}
              </li>
            ))}
          </ul>
          {!canDecide && !state.statusLocked && <p className="mt-3 text-xs text-muted-foreground">{t(`Anmodninger om at deltage godkendes af den ansvarlige (${state.meta.owner.name}), en admin eller en manager.`, `Requests to join are approved by the person responsible (${state.meta.owner.name}), an admin or a manager.`)}</p>}
          <p className="mt-3 text-xs text-muted-foreground">{t('Managere og optællingsadmins er med i alle optællinger uden at anmode.', 'Managers and stock count admins take part in every count without asking.')}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t('Låste områder', 'Locked areas')}</CardTitle></CardHeader>
        <CardContent>
          {state.claims.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen områder er låst.', 'No areas are locked.')}</p> : (
            <ul className="divide-y text-sm">
              {state.claims.map(claim => (
                <li key={claim.area} className="flex items-center gap-3 py-2.5">
                  <LockKey size={16} />
                  <span className="font-mono font-semibold">{claim.area}</span>
                  <span className="flex-1">{claim.name}</span>
                  <span className="text-xs text-muted-foreground">{t('aktiv', 'active')} {formatTime(claim.lastActivity)}</span>
                  {!state.statusLocked && (isOwner || claim.email === state.me.email) && <Button size="sm" variant="ghost" onClick={() => release(claim.area)}>{t('Frigiv', 'Release')}</Button>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t('Låse frigives automatisk efter 30 minutter uden aktivitet.', 'Locks are released automatically after 30 minutes without activity.')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
