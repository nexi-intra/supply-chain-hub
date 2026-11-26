import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowsClockwise, CheckCircle, EnvelopeSimple, FloppyDisk } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect } from '@/components/warehouse/ui'
import { SapActionButton } from '@/components/warehouse/SapActionButton'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { errorMessage } from '@/lib/warehouse/errors'
import { fetchSteps, formatDateTime, formatNumber, stockLabel } from '@/lib/warehouse/format'
import { cn } from '@/lib/utils'
import type { CountingUser, FetchStep, MailLanguage, SapCheckOverview, SapCheckScope, SapCheckSettings, SapError, SapErrorType, TeamId } from '@/types/warehouse'
import { t } from '@/lib/warehouse/text'
import { TEAM_SLOCS } from '@/lib/warehouse/teams'

const types = (): { type: SapErrorType; label: string; help: string }[] => [
  { type: 'count-mismatch', label: t('Antal passer ikke', 'Quantity does not match'), help: t('Lagerbeholdning (MB52) og antal serienumre (IQ09) er forskellige.', 'Stock (MB52) and the number of serial numbers (IQ09) differ.') },
  { type: 'duplicate-serial', label: t('Serienummer flere steder', 'Serial number in several places'), help: t('Samme serienummer står på flere storage locations, lagertyper eller materialer.', 'The same serial number is on several storage locations, stock types or materials.') },
  { type: 'stock-without-serials', label: t('Lager uden serienumre', 'Stock without serial numbers'), help: t('Der er lager, men ingen serienumre på stedet.', 'There is stock, but no serial numbers in that place.') },
  { type: 'serials-without-stock', label: t('Serienumre uden lager', 'Serial numbers without stock'), help: t('Der er serienumre, men intet lager af den lagertype.', 'There are serial numbers, but no stock of that stock type.') },
]
const typeLabel = (type: SapErrorType) => types().find(item => item.type === type)?.label ?? type
const teamOf = (sloc: string): TeamId | null => (TEAM_SLOCS.TCD.includes(sloc) ? 'TCD' : TEAM_SLOCS.TRR.includes(sloc) ? 'TRR' : null)
const scopeLabel = (scope: SapCheckScope) => (scope === 'D301' ? t('Hele D301', 'All of D301') : scope)
const sourceLabel = (source: 'both' | 'countpoint' | 'sap-report') => ({ both: t('Begge', 'Both'), countpoint: t('Kun Optælling', 'Stock count only'), 'sap-report': t('Kun SAP-rapporten', 'SAP report only') })[source]
const steps = () => [...fetchSteps(), { step: 'sap-report', label: t('SAP-rapport (ZMS_STOCK_SER_CHK2)', 'SAP report (ZMS_STOCK_SER_CHK2)') }]

function ScopeChoice({ value, onChange, label, options }: { value: SapCheckScope; onChange: (scope: SapCheckScope) => void; label: string; options: SapCheckScope[] }) {
  return (
    <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', value === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{scopeLabel(option)}</button>
      ))}
    </div>
  )
}

function remark(error: SapError): string {
  if (error.type === 'count-mismatch') {
    const diff = error.serialCount - (error.sapQty ?? 0)
    return t(`${formatNumber(error.sapQty)} på lager, ${formatNumber(error.serialCount)} serienr. (${diff > 0 ? '+' : ''}${formatNumber(diff)})`, `${formatNumber(error.sapQty)} in stock, ${formatNumber(error.serialCount)} serials (${diff > 0 ? '+' : ''}${formatNumber(diff)})`)
  }
  if (error.type === 'stock-without-serials') return t(`${formatNumber(error.sapQty)} på lager, ingen serienumre`, `${formatNumber(error.sapQty)} in stock, no serial numbers`)
  if (error.type === 'serials-without-stock') return `${formatNumber(error.serialCount)} ${t('serienr.', 'serials')}: ${error.serials.slice(0, 3).join(', ')}${error.serials.length > 3 ? ' …' : ''}`
  return `${error.serials[0]}: ${error.locations.map(place => `${place.material} ${place.sloc} ${stockLabel(place.stockType)}`).join(' · ')}`
}

export function SapCheck({ user, onBack }: { user: CountingUser; onBack: () => void }) {
  const [view, setView] = useState<SapCheckOverview | null>(null)
  const [step, setStep] = useState<FetchStep | null>(null)
  const [type, setType] = useState<SapErrorType | ''>('')
  const [status, setStatus] = useState<'' | 'new' | 'open'>('')
  const [sloc, setSloc] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SapCheckScope>(user.team)
  const [team, setTeam] = useState<TeamId | ''>('')
  const [source, setSource] = useState<'' | 'both' | 'countpoint' | 'sap-report'>('')

  const load = useCallback(async () => {
    try {
      setView(await window.electronWarehouse!.sapCheck.overview())
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = async () => {
    setStep('check')
    const unsubscribe = window.electronWarehouse!.sap.onFetchProgress(progress => setStep(progress.step))
    try {
      const check = await window.electronWarehouse!.sapCheck.run({ scope })
      setView(current => current && { ...current, latest: check })
      toast.success(check.summary.total ? t(`${formatNumber(check.summary.total)} SAP-fejl fundet`, `${formatNumber(check.summary.total)} SAP errors found`) : t('Ingen SAP-fejl fundet', 'No SAP errors found'), { description: check.summary.total ? t(`${formatNumber(check.summary.new)} nye · ${formatNumber(check.summary.open)} stadig ikke rettet · ${formatNumber(check.summary.fixed)} rettet siden sidst`, `${formatNumber(check.summary.new)} new · ${formatNumber(check.summary.open)} still not fixed · ${formatNumber(check.summary.fixed)} fixed since last time`) : undefined })
      void load()
    } catch (error) {
      toast.error(errorMessage(error, t('Tjekket fejlede.', 'The check failed.')))
    } finally {
      unsubscribe()
      setStep(null)
    }
  }

  const latest = view?.latest || null
  const needle = query.trim().toUpperCase()
  const errors = useMemo(() => (latest?.errors || []).filter(error =>
    (!type || error.type === type) && (!status || error.status === status) && (!sloc || error.sloc === sloc)
    && (!team || teamOf(error.sloc) === team) && (!source || (error.source || 'countpoint') === source)
    && (!needle || error.material.includes(needle) || error.description.toUpperCase().includes(needle) || error.serials.some(serial => serial.includes(needle)))), [latest, type, status, sloc, team, source, needle])
  const slocs = useMemo(() => [...new Set((latest?.errors || []).map(error => error.sloc))].sort(), [latest])

  if (!view) return <Skeleton className="h-96 rounded-xl" />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('Tilbage', 'Back')}><ArrowLeft size={20} /></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('Tjek SAP-fejl', 'Check SAP errors')} · D301</h1>
          <p className="text-sm text-muted-foreground">{t("Fælles for TCD og TRR: begge teams ser de samme tjek, den samme opfølgning og de samme mails. Sammenligner lagerbeholdning (MB52) med serienumre (IQ09) og kontrollerer mod SAP's egen rapport ZMS_STOCK_SER_CHK2. Læser kun fra SAP.", "Shared by TCD and TRR: both teams see the same checks, the same follow-up and the same mails. Compares stock (MB52) with serial numbers (IQ09) and checks against SAP's own report ZMS_STOCK_SER_CHK2. Only reads from SAP.")}</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <ScopeChoice value={scope} onChange={setScope} label={t('Hvad skal tjekkes', 'What to check')} options={['TCD', 'TRR', 'D301']} />
          <SapActionButton onAction={run} disabled={step !== null}><ArrowsClockwise size={18} /> {t('Tjek SAP nu', 'Check SAP now')}</SapActionButton>
          <div className="text-sm">
            {step ? <span className="text-muted-foreground">{steps().find(item => item.step === step)?.label || t('Henter', 'Fetching')} … {t('(ca. 1 minut)', '(about 1 minute)')}</span>
              : latest ? (
                <>
                  <div>{t('Seneste tjek', 'Latest check')}: <strong>{formatDateTime(latest.at)}</strong> {t('af', 'by')} {latest.by.name}{latest.by.team ? ` (${latest.by.team})` : ''} · {scopeLabel(latest.scope || user.team)} · <strong>{formatNumber(latest.summary.total)}</strong> {t(`fejl (${formatNumber(latest.summary.new)} nye, ${formatNumber(latest.summary.open)} stadig ikke rettet, ${formatNumber(latest.summary.fixed)} rettet siden sidst)`, `errors (${formatNumber(latest.summary.new)} new, ${formatNumber(latest.summary.open)} still not fixed, ${formatNumber(latest.summary.fixed)} fixed since last time)`)}</div>
                  <div className="text-muted-foreground">{(latest.mails?.length ? latest.mails : latest.mail ? [latest.mail] : []).map(mail => t(`Mail lavet af ${mail.by.name} ${formatDateTime(mail.at)} (${mail.scope ? scopeLabel(mail.scope) : 'alle'}, ${mail.mode === 'new' ? 'kun nye' : 'alle'}, ${formatNumber(mail.count)} fejl${mail.language === 'en' ? ', engelsk' : ''})`, `Mail made by ${mail.by.name} ${formatDateTime(mail.at)} (${mail.scope ? scopeLabel(mail.scope) : 'all'}, ${mail.mode === 'new' ? 'new only' : 'all'}, ${formatNumber(mail.count)} errors${mail.language === 'en' ? ', English' : ''})`)).join(' · ') || t('Der er ikke lavet en mail for dette tjek.', 'No mail has been made for this check.')}</div>
                </>
              ) : <span className="text-muted-foreground">{t('SAP er ikke tjekket endnu.', 'SAP has not been checked yet.')}</span>}
          </div>
        </CardContent>
      </Card>

      {latest?.comparison && (
        latest.comparison.ran ? (
          <p className="flex flex-wrap items-center gap-x-2 rounded-md border px-4 py-2 text-sm">
            <CheckCircle size={16} className="text-emerald-600" />
            <span>{t("Kontrolleret mod SAP's rapport ZMS_STOCK_SER_CHK2:", "Checked against SAP's report ZMS_STOCK_SER_CHK2:")} <strong>{formatNumber(latest.comparison.both)}</strong> {t('fundet af begge', 'found by both')} · <strong>{formatNumber(latest.comparison.onlyCountPoint)}</strong> {t('kun af Optælling', 'only by Stock count')} · <strong>{formatNumber(latest.comparison.onlyReport)}</strong> {t('kun af SAP-rapporten (kommer med på listen). Dubletter findes kun af Optælling.', 'only by the SAP report (included in the list). Duplicates are only found by Stock count.')}</span>
          </p>
        ) : (
          <p role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">{t(`Kontrollen mod ZMS_STOCK_SER_CHK2 blev ikke kørt: ${latest.comparison.error || 'ukendt fejl'}. Fejlene fra Optælling er gemt alligevel.`, `The check against ZMS_STOCK_SER_CHK2 did not run: ${latest.comparison.error || 'unknown error'}. The errors from Stock count are saved anyway.`)}</p>
        )
      )}

      {latest && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {types().map(item => (
            <button key={item.type} type="button" onClick={() => setType(current => (current === item.type ? '' : item.type))} className={cn('rounded-xl border p-4 text-left transition hover:bg-muted/50', type === item.type && 'ring-2 ring-primary/50')}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</div>
              <div className={cn('text-3xl font-semibold tabular-nums', latest.summary.byType[item.type] > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{formatNumber(latest.summary.byType[item.type])}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.help}</div>
            </button>
          ))}
        </div>
      )}

      {latest && <MailCard view={view} user={user} reload={load} onSettings={settings => setView(current => current && { ...current, settings })} />}

      {latest && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t(`Fejl (${formatNumber(errors.length)} af ${formatNumber(latest.errors.length)})`, `Errors (${formatNumber(errors.length)} of ${formatNumber(latest.errors.length)})`)}</CardTitle>
            <CardDescription>{t('"Stadig ikke rettet" har været med i et tidligere tjek. Klik på en fejltype ovenfor for at filtrere.', '"Still not fixed" was in an earlier check. Click an error type above to filter.')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <NativeSelect value={type} onChange={event => setType(event.target.value as SapErrorType | '')} aria-label={t('Fejltype', 'Error type')}>
                <option value="">{t('Alle fejltyper', 'All error types')}</option>
                {types().map(item => <option key={item.type} value={item.type}>{item.label}</option>)}
              </NativeSelect>
              <NativeSelect value={status} onChange={event => setStatus(event.target.value as '' | 'new' | 'open')} aria-label="Status">
                <option value="">{t('Alle', 'All')}</option>
                <option value="new">{t('Nye', 'New')}</option>
                <option value="open">{t('Stadig ikke rettet', 'Still not fixed')}</option>
              </NativeSelect>
              <NativeSelect value={sloc} onChange={event => setSloc(event.target.value)} aria-label="Storage location">
                <option value="">{t('Alle storage locations', 'All storage locations')}</option>
                {slocs.map(item => <option key={item} value={item}>{item}</option>)}
              </NativeSelect>
              {latest.slocs.some(item => teamOf(item) === 'TCD') && latest.slocs.some(item => teamOf(item) === 'TRR') && (
                <NativeSelect value={team} onChange={event => setTeam(event.target.value as TeamId | '')} aria-label="Team">
                  <option value="">{t('Begge teams', 'Both teams')}</option>
                  <option value="TCD">TCD</option>
                  <option value="TRR">TRR</option>
                </NativeSelect>
              )}
              {latest.comparison?.ran && (
                <NativeSelect value={source} onChange={event => setSource(event.target.value as '' | 'both' | 'countpoint' | 'sap-report')} aria-label={t('Fundet af', 'Found by')}>
                  <option value="">{t('Fundet af alle', 'Found by all')}</option>
                  <option value="both">{t('Fundet af begge', 'Found by both')}</option>
                  <option value="countpoint">{sourceLabel('countpoint')}</option>
                  <option value="sap-report">{sourceLabel('sap-report')}</option>
                </NativeSelect>
              )}
              <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Søg materiale, tekst eller serienummer', 'Search material, text or serial number')} className="max-w-xs" />
            </div>
            <div className="max-h-[600px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('Fejltype', 'Error type')}</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">{t('Materiale', 'Material')}</th>
                    <th className="px-3 py-2">Sloc</th>
                    <th className="px-3 py-2">{t('Lagertype', 'Stock type')}</th>
                    <th className="px-3 py-2">{t('Detaljer', 'Details')}</th>
                    <th className="px-3 py-2">{t('Først fundet', 'First found')}</th>
                    <th className="px-3 py-2">{t('Fundet af', 'Found by')}</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.slice(0, 500).map(error => (
                    <tr key={error.id} className="border-t align-top">
                      <td className="px-3 py-1.5">{typeLabel(error.type)}</td>
                      <td className="px-3 py-1.5">{error.status === 'new' ? <Badge className="bg-amber-500 text-white">{t('Ny', 'New')}</Badge> : <Badge variant="outline">{t('Stadig ikke rettet', 'Still not fixed')}</Badge>}</td>
                      <td className="px-3 py-1.5"><div className="font-mono">{error.material}</div><div className="max-w-72 truncate text-xs text-muted-foreground">{error.description}</div></td>
                      <td className="px-3 py-1.5"><span className="font-mono">{error.sloc}</span> <span className="text-xs text-muted-foreground">{teamOf(error.sloc)}</span></td>
                      <td className="px-3 py-1.5">{stockLabel(error.stockType)}</td>
                      <td className="px-3 py-1.5 text-xs">{remark(error)}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDateTime(error.firstSeen)}</td>
                      <td className="px-3 py-1.5 text-xs">{error.source === 'sap-report' ? <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">{sourceLabel('sap-report')}</Badge> : error.source ? sourceLabel(error.source) : '–'}</td>
                    </tr>
                  ))}
                  {errors.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">{latest.errors.length ? t('Ingen fejl matcher.', 'No errors match.') : <span className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle size={18} /> {t('SAP stemmer – ingen fejl fundet.', 'SAP adds up – no errors found.')}</span>}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {errors.length > 500 && <p className="text-xs text-muted-foreground">{t(`Viser 500 af ${formatNumber(errors.length)} – hele listen kommer med i Excel-filen.`, `Showing 500 of ${formatNumber(errors.length)} – the full list is in the Excel file.`)}</p>}
          </CardContent>
        </Card>
      )}

      {latest && latest.fixed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('Rettet siden sidste tjek', 'Fixed since the last check')} ({formatNumber(latest.fixed.length)})</CardTitle>
            <CardDescription>{t('Fejl fra forrige tjek, som SAP ikke længere har.', 'Errors from the previous check that SAP no longer has.')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {latest.fixed.slice(0, 200).map(item => (
                <li key={item.id} className="flex gap-2"><CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span><span className="font-mono">{item.material}</span> {item.sloc} {stockLabel(item.stockType)} – {typeLabel(item.type)}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {view.history.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('Tidligere tjek', 'Earlier checks')}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {view.history.map(entry => (
                <li key={entry.id} className="flex flex-wrap gap-x-3">
                  <span className="tabular-nums text-muted-foreground">{formatDateTime(entry.at)}</span>
                  <span>{entry.by.name}{entry.by.team ? ` (${entry.by.team})` : ''}</span>
                  {entry.scope && <span className="text-muted-foreground">{scopeLabel(entry.scope)}</span>}
                  <span>{t(`${formatNumber(entry.summary.total)} fejl · ${formatNumber(entry.summary.new)} nye · ${formatNumber(entry.summary.fixed)} rettet`, `${formatNumber(entry.summary.total)} errors · ${formatNumber(entry.summary.new)} new · ${formatNumber(entry.summary.fixed)} fixed`)}</span>
                  {entry.mail && <span className="text-muted-foreground">Mail: {entry.mail.by.name}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const EMAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/

/** The same check and form as the drive (sapCheckService parseAddresses): null when an address is not valid. */
function parseAddresses(value: string): string | null {
  const list = [...new Set(value.split(/[;,\s]+/).map(item => item.trim().toLowerCase()).filter(Boolean))]
  return list.length > 10 || list.some(address => !EMAIL.test(address)) ? null : list.join('; ')
}

function MailCard({ view, user, reload, onSettings }: { view: SapCheckOverview; user: CountingUser; reload: () => Promise<void>; onSettings: (settings: SapCheckSettings) => void }) {
  const latest = view.latest!
  const [to, setTo] = useState(view.settings.to)
  const [cc, setCc] = useState(view.settings.cc)
  const [language, setLanguage] = useState<MailLanguage>(view.settings.language)
  const [mode, setMode] = useState<'new' | 'all'>(latest.summary.new > 0 && latest.summary.open > 0 ? 'new' : 'all')
  const [mailScope, setMailScope] = useState<SapCheckScope>('D301')
  const [mailing, setMailing] = useState(false)
  const dirty = to !== view.settings.to || cc !== view.settings.cc || language !== view.settings.language
  const scopeOptions: SapCheckScope[] = ['D301', ...(['TCD', 'TRR'] as const).filter(item => latest.slocs.some(sloc => teamOf(sloc) === item))]
  const inScope = latest.errors.filter(error => mailScope === 'D301' || teamOf(error.sloc) === mailScope)
  const freshCount = inScope.filter(error => error.status === 'new').length
  const count = mode === 'new' ? freshCount : inScope.length

  useEffect(() => { setTo(view.settings.to); setCc(view.settings.cc); setLanguage(view.settings.language) }, [view.settings.to, view.settings.cc, view.settings.language])

  if (!view.canMail) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <EnvelopeSimple size={18} /> {t('Kun admins og managers kan lave mailen til SAP-teamet. En manager kan gøre dig til admin under Arbejdsværktøjer, Administration.', 'Only admins and managers can make the mail to the SAP team. A manager can make you an admin under Work Tools, Administration.')}
        </CardContent>
      </Card>
    )
  }

  /** Shown as saved at once; the write to M: runs in the background and is taken back if it fails. False = invalid addresses. */
  const saveSettings = (quiet = false) => {
    const parsedTo = parseAddresses(to)
    const parsedCc = parseAddresses(cc)
    if (parsedTo === null || parsedCc === null) {
      toast.error(t('Skriv gyldige mailadresser adskilt af semikolon (højst 10)', 'Type valid mail addresses separated by semicolons (at most 10)'))
      return false
    }
    const previous = view.settings
    const next: SapCheckSettings = { to: parsedTo, cc: parsedCc, language, updatedBy: { email: user.email, name: user.fullName || user.email }, updatedAt: Date.now() }
    onSettings(next)
    if (!quiet) toast.success(t('Mailindstillingerne er gemt', 'The mail settings are saved'))
    trackPendingWrite(window.electronWarehouse!.sapCheck.setSettings({ to, cc, language })).catch(error => {
      onSettings(previous)
      toast.error(t('Mailindstillingerne blev ikke gemt', 'The mail settings were not saved'), { description: errorMessage(error) })
    })
    return true
  }

  // Outlook and the Excel file must exist before the toast: this waits (spinner). Typed addresses are saved alongside
  // the mail, not before it.
  const mail = async () => {
    const typed = dirty ? { to, cc } : {}
    if (dirty && !saveSettings(true)) return
    setMailing(true)
    try {
      const result = await window.electronWarehouse!.sapCheck.mail({ id: latest.id, mode, language, scope: mailScope, ...typed })
      toast.success(t('Mailen er åbnet i Outlook', 'The mail is open in Outlook'), {
        description: t(`${formatNumber(result.count)} fejl · ${result.file} er vedhæftet. Tjek kladden og tryk Send.`, `${formatNumber(result.count)} errors · ${result.file} is attached. Check the draft and press Send.`),
        action: { label: t('Åbn Excel', 'Open Excel'), onClick: () => { window.electronWarehouse!.counts.openReport(result.file).catch(error => toast.error(errorMessage(error))) } },
        duration: 6000,
      })
      void reload()
    } catch (error) {
      toast.error(errorMessage(error), { duration: 8000 })
    } finally {
      setMailing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Mail til SAP-teamet', 'Mail to the SAP team')}</CardTitle>
        <CardDescription>{t('Åbner en kladde i Outlook på dansk eller engelsk med en opsummering og hele fejllisten som Excel (samme sprog). Intet sendes, før du selv trykker Send.', 'Opens a draft in Outlook in Danish or English with a summary and the full error list as Excel (same language). Nothing is sent until you press Send yourself.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="sap-mail-to">{t('Til (SAP-teamet)', 'To (the SAP team)')}</Label>
            <Input id="sap-mail-to" value={to} onChange={event => setTo(event.target.value)} placeholder="sap-team@nexigroup.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sap-mail-cc">{t('Cc (valgfri)', 'Cc (optional)')}</Label>
            <Input id="sap-mail-cc" value={cc} onChange={event => setCc(event.target.value)} placeholder={t('Flere adresser adskilles med ;', 'Separate several addresses with ;')} />
          </div>
          <Button variant="outline" onClick={() => { saveSettings() }} disabled={!dirty}><FloppyDisk size={16} /> {t('Gem indstillinger', 'Save settings')}</Button>
        </div>
        {view.settings.updatedBy && <p className="text-xs text-muted-foreground">{t(`Sidst ændret af ${view.settings.updatedBy.name} ${formatDateTime(view.settings.updatedAt)}.`, `Last changed by ${view.settings.updatedBy.name} ${formatDateTime(view.settings.updatedAt)}.`)}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-label={t('Sprog', 'Language')}>
            {([['da', 'Dansk'], ['en', 'English']] as const).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={language === value} onClick={() => setLanguage(value)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', language === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
            ))}
          </div>
          {scopeOptions.length > 2 && <ScopeChoice value={mailScope} onChange={setMailScope} label={t('Mailen omfatter', 'The mail covers')} options={scopeOptions} />}
          <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-label={t('Fejl i mailen', 'Errors in the mail')}>
            {([['new', t(`Kun nye fejl (${formatNumber(freshCount)})`, `New errors only (${formatNumber(freshCount)})`)], ['all', t(`Alle åbne fejl (${formatNumber(inScope.length)})`, `All open errors (${formatNumber(inScope.length)})`)]] as const).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
            ))}
          </div>
          <Button onClick={() => mail()} loading={mailing} disabled={count === 0}><EnvelopeSimple size={18} /> {t('Lav mail til SAP-teamet', 'Make mail to the SAP team')}</Button>
          {!to.trim() && <span className="text-xs text-amber-700 dark:text-amber-300">{t('Ingen modtager – du kan skrive den i Outlook.', 'No recipient – you can type it in Outlook.')}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
