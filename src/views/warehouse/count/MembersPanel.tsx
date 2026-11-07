import { useState } from 'react'
import { Check, LockKey, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { errorMessage } from '@/lib/warehouse/errors'
import { t } from '@/lib/warehouse/text'
import { formatDateTime, formatTime } from '@/lib/warehouse/format'
import type { PanelProps } from './CountView'

const statusLabels = () => ({ requested: t('Anmodet', 'Requested'), approved: t('Deltager', 'Participant'), rejected: t('Afvist', 'Rejected') }) as const

export function MembersPanel({ id, state, refresh }: PanelProps) {
  const isOwner = state.me.isOwner && !state.statusLocked
  const [pending, setPending] = useState<string | null>(null)
  const decide = async (email: string, approve: boolean) => {
    if (pending) return
    setPending(`${approve ? 'approve' : 'reject'}:${email}`)
    try {
      await window.electronWarehouse!.counts.decideMember({ id, email, approve })
      toast.success(approve ? t('Deltageren er godkendt', 'The participant is approved') : t('Anmodningen er afvist', 'The request is rejected'))
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
  }
  const release = async (area: string) => {
    if (pending) return
    setPending(`release:${area}`)
    try {
      await window.electronWarehouse!.counts.release({ id, area })
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(null)
    }
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
                {isOwner && member.role !== 'owner' && member.status !== 'approved' && (
                  <Button size="sm" loading={pending === `approve:${member.email}`} onClick={() => decide(member.email, true)}><Check size={16} /> {t('Godkend', 'Approve')}</Button>
                )}
                {isOwner && member.role !== 'owner' && member.status !== 'rejected' && (
                  <Button size="sm" variant="ghost" loading={pending === `reject:${member.email}`} onClick={() => decide(member.email, false)}><X size={16} /> {member.status === 'approved' ? t('Fjern', 'Remove') : t('Afvis', 'Reject')}</Button>
                )}
              </li>
            ))}
          </ul>
          {!isOwner && !state.statusLocked && <p className="mt-3 text-xs text-muted-foreground">{t(`Anmodninger om at deltage godkendes af den ansvarlige (${state.meta.owner.name}).`, `Requests to join are approved by the person responsible (${state.meta.owner.name}).`)}</p>}
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
                  {!state.statusLocked && (isOwner || claim.email === state.me.email) && <Button size="sm" variant="ghost" loading={pending === `release:${claim.area}`} onClick={() => release(claim.area)}>{t('Frigiv', 'Release')}</Button>}
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
