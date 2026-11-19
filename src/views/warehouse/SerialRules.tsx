import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorMessage } from '@/lib/warehouse/errors'
import { formatDateTime } from '@/lib/warehouse/format'
import type { SerialRule, SerialRulesView, WarehouseUser } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'

export function SerialRules({ user, onBack }: { user: WarehouseUser; onBack: () => void }) {
  const [view, setView] = useState<SerialRulesView | null>(null)
  const [material, setMaterial] = useState('')
  // The newest change per material: a failed older write must not take back a newer one.
  const versions = useRef(new Map<string, number>())

  const load = useCallback(async () => {
    try {
      setView(await window.electronWarehouse!.serialRules.get())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  // Shown at once; the write to M: (15–90 s) runs in the background and is taken back if the drive refuses it.
  const save = (code: string, unrestricted: boolean, done: string, onFailed?: () => void) => {
    if (!view) return
    const previous = view.rules.find(rule => rule.material === code) || null
    const version = (versions.current.get(code) || 0) + 1
    versions.current.set(code, version)
    const show = (rule: SerialRule | null) => setView(current => current && {
      ...current,
      rules: [...current.rules.filter(item => item.material !== code), ...(rule ? [rule] : [])].sort((a, b) => a.material.localeCompare(b.material)),
    })
    show(unrestricted ? { material: code, unrestricted: true, blocked: false, updatedBy: { email: user.email, name: user.fullName || user.email }, updatedAt: Date.now() } : null)
    toast.success(done)
    trackPendingWrite(window.electronWarehouse!.serialRules.set({ material: code, unrestricted })).catch(error => {
      if (versions.current.get(code) === version) show(previous)
      onFailed?.()
      toast.error(errorMessage(error))
    })
  }

  const add = () => {
    const code = material.trim().toUpperCase()
    if (!code) return
    setMaterial('')
    save(code, true, t(`${code} bruger nu lange serienumre`, `${code} now uses long serial numbers`), () => setMaterial(current => current || code))
  }

  if (!view) return <Skeleton className="h-96 rounded-xl" />

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('Tilbage', 'Back')}><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Serienummerregler', 'Serial number rules')} · TCD</h1>
          <p className="text-sm text-muted-foreground">
            {t('Nye terminaler, hvor optællingsdokumentet i SAP skal have det lange serienummer (ZMS_LONG_SERNO). Scanning bruger altid det korte, og blocked lager (D000) bruger altid de korte numre.', 'New terminals where the count document in SAP needs the long serial number (ZMS_LONG_SERNO). Scanning always uses the short one, and blocked stock (D000) always uses the short numbers.')}
          </p>
        </div>
      </div>

      {!view.supported ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">{t('Serienummerregler bruges kun af TCD.', 'Serial number rules are only used by TCD.')}</CardContent></Card>
      ) : (
        <>
          {view.canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('Tilføj materiale', 'Add material')}</CardTitle>
                <CardDescription>{t('Kun nye terminaler (INT…, ikke -R).', 'New terminals only (INT…, not -R).')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="serial-rule-material">{t('Materiale', 'Material')}</Label>
                  <Input id="serial-rule-material" value={material} onChange={event => setMaterial(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') add() }} placeholder="INT4300-7825-0" className="w-56 font-mono" />
                </div>
                <Button onClick={() => add()} disabled={!material.trim()}><Plus size={18} weight="bold" /> {t('Tilføj', 'Add')}</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('Materialer med lange serienumre', 'Materials with long serial numbers')} ({view.rules.length})</CardTitle>
              <CardDescription>{view.canEdit ? t('Du er manager og kan rette reglerne.', 'You are a manager and can edit the rules.') : t('Kun managers kan rette reglerne.', 'Only managers can edit the rules.')} {t('Materialer uden regel kopieres med de korte numre.', 'Materials without a rule are copied with the short numbers.')}</CardDescription>
            </CardHeader>
            <CardContent>
              {view.rules.length === 0 ? <p className="text-sm text-muted-foreground">{t('Ingen regler endnu.', 'No rules yet.')}</p> : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                        <th className="px-3 py-2">{t('Sidst ændret', 'Last changed')}</th>
                        {view.canEdit && <th className="px-3 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {view.rules.map(rule => <RuleRow key={rule.material} rule={rule} canEdit={view.canEdit} onRemove={() => save(rule.material, false, t(`${rule.material} bruger nu de korte serienumre`, `${rule.material} now uses the short serial numbers`))} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function RuleRow({ rule, canEdit, onRemove }: { rule: SerialRule; canEdit: boolean; onRemove: () => void }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-mono font-semibold">{rule.material}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{rule.updatedBy ? `${rule.updatedBy.name} · ${formatDateTime(rule.updatedAt)}` : '–'}</td>
      {canEdit && (
        <td className="px-3 py-2 text-right">
          <Button size="sm" variant="ghost" onClick={onRemove} aria-label={t(`Fjern reglen for ${rule.material}`, `Remove the rule for ${rule.material}`)}><Trash size={16} /></Button>
        </td>
      )}
    </tr>
  )
}
