import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NisseSpot } from '@/components/christmas/NisseSpot'
import { ArrowLeft, ArrowSquareOut, CheckCircle, DotsThreeVertical, Flag, LinkSimple, MagnifyingGlass, PencilSimple, Plus, ShieldWarning, Star, Trash, X, XCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/contexts/LanguageContext'
import { useKV } from '@/hooks/useKV'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams, peekNavigationParams } from '@/lib/appNavigation'
import { filterLinks, isAllowedLinkUrl, linkFavoritesKey, predictLinksCommand, publishLinksPrediction, type LibraryLink, type LinkCommand, type LinkCommandInput, type LinkFields, type LinkReportReason, type LinksSnapshot } from '@/lib/links'
import { getLinksLabels, type LinksLabels } from '@/lib/linksLabels'
import { cn } from '@/lib/utils'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { AutoText } from '@/components/AutoText'
import { TranslationNote, TranslationScope } from '@/components/TranslationScope'

interface LinkLibraryProps {
  onNavigateBack: () => void
  userEmail: string
}

type OpenDialog =
  | { kind: 'form'; link: LibraryLink | null }
  | { kind: 'suggest'; link: LibraryLink }
  | { kind: 'report'; link: LibraryLink }
  | { kind: 'delete'; link: LibraryLink }
  | { kind: 'reject'; link: LibraryLink }
  | null

const FAVORITES = '__favorites__'

export function LinkLibrary({ onNavigateBack, userEmail }: LinkLibraryProps) {
  const { language } = useLanguage()
  const labels = getLinksLabels(language)
  const api = typeof window === 'undefined' ? undefined : window.electronLinks
  const [snapshot, setSnapshot] = useState<LinksSnapshot | null>(null)
  const [initialParams] = useState(() => peekNavigationParams())
  useEffect(() => { consumeNavigationParams() }, [])
  const [query, setQuery] = useState(() => initialParams?.search ?? '')
  const [category, setCategory] = useState<string | null>(null)
  const [tab, setTab] = useState<'links' | 'review'>(() => initialParams?.tab === 'review' ? 'review' : 'links')
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [busy, setBusy] = useState(false)
  const [favorites, setFavorites] = useKV<string[]>(linkFavoritesKey(userEmail), [])
  const highlight = useRef(initialParams?.itemId ?? null)

  // Commands still on their way to the shared drive: until the last one is done, a read would show the library
  // without them, so it waits.
  const commandsInFlight = useRef(0)
  const snapshotRef = useRef<LinksSnapshot | null>(null)
  snapshotRef.current = snapshot
  const load = useCallback(async () => {
    if (!api || commandsInFlight.current > 0) return
    try {
      const next = await api.snapshot()
      if (commandsInFlight.current === 0) setSnapshot(next)
    } catch (error) { console.error('Link Library:', error) }
  }, [api])
  useEffect(() => {
    void load()
    return api?.onChanged(() => { void load() })
  }, [api, load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || dialog || isAnyModalOpen()) return
      onNavigateBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, onNavigateBack])

  // A deep link (Ctrl+K, Hubert) scrolls to and briefly marks one link.
  useEffect(() => {
    const id = highlight.current
    if (!id || !snapshot) return
    highlight.current = null
    requestAnimationFrame(() => document.querySelector(`[data-link-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }))
  }, [snapshot])

  const run = async (command: LinkCommandInput, success: string) => {
    if (!api || busy) return false
    setBusy(true)
    try {
      await api.command({ ...command, operationId: crypto.randomUUID() } as LinkCommand)
      toast.success(success)
      // Ikke ventet på: dialogen lukker straks; listen opdateres, når læsningen er hjemme.
      void load()
      return true
    } catch (error) {
      toast.error(commandError(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const commandError = (error: unknown) => String(error).includes('LINKS_DUPLICATE') ? labels.toasts.duplicate : labels.toasts.failed

  /** Shown at once and saved in the background; the main process decides, and the library is read again afterwards. */
  const runInBackground = (command: LinkCommandInput, success: string) => {
    const current = snapshotRef.current
    if (!api || !current) return
    const predicted = predictLinksCommand(current, command)
    snapshotRef.current = predicted
    setSnapshot(predicted)
    publishLinksPrediction(predicted)
    setDialog(null)
    toast.success(success)
    commandsInFlight.current++
    void trackPendingWrite(api.command({ ...command, operationId: crypto.randomUUID() } as LinkCommand)).catch(error => {
      console.error('Link Library:', error)
      toast.error(commandError(error))
    }).finally(() => {
      commandsInFlight.current--
      void load()
    })
  }

  const openLink = async (link: LibraryLink) => {
    try { await api?.open(link.id) } catch { toast.error(labels.toasts.openFailed) }
  }

  const toggleFavorite = (id: string) => {
    void setFavorites(current => (current || []).includes(id) ? (current || []).filter(entry => entry !== id) : [...(current || []), id])
  }

  const links = snapshot?.links ?? []
  const categories = useMemo(() => [...new Set(links.map(link => link.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [links])
  const favoriteIds = new Set(favorites || [])
  const shown = useMemo(() => {
    const filtered = filterLinks(links, query, category === FAVORITES ? null : category)
      .filter(link => category !== FAVORITES || favoriteIds.has(link.id))
    return filtered.sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.title.localeCompare(b.title))
  }, [links, query, category, favorites]) // eslint-disable-line react-hooks/exhaustive-deps
  const reviewCount = snapshot ? snapshot.review.pending.length + snapshot.review.suggestions.length + snapshot.review.reports.length : 0
  const teamName = (code: string) => snapshot?.teams.find(team => team.folderName === code)?.name ?? code

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 shadow-sm backdrop-blur-sm">
        <div className="container mx-auto flex items-center gap-4 px-4 py-6 sm:px-6">
          <Button variant="outline" size="lg" onClick={onNavigateBack} className="gap-2 px-4 font-semibold">
            <ArrowLeft size={20} />
            {labels.back}
          </Button>
          <h1 className="flex flex-1 items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            <LinkSimple size={26} weight="duotone" className="text-primary" />
            {labels.title}
          </h1>
          <NisseSpot spot="links" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 sm:px-6">
        <Tabs value={tab} onValueChange={value => setTab(value as 'links' | 'review')}>
          <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <TabsList>
              <TabsTrigger value="links">{labels.tabs.links}</TabsTrigger>
              {snapshot?.actor.isManager && <TabsTrigger value="review" data-links-review-tab>{labels.tabs.review(reviewCount)}</TabsTrigger>}
            </TabsList>
            <Button size="lg" className="gap-2" onClick={() => setDialog({ kind: 'form', link: null })} data-links-add>
              <Plus size={20} weight="bold" />
              {labels.addLink}
            </Button>
          </div>

          <TabsContent value="links">
            <div className="relative mb-4">
              <MagnifyingGlass size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={labels.search} className="pl-10" aria-label={labels.search} />
              {query && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => setQuery('')} aria-label="Ryd">
                  <X size={16} />
                </Button>
              )}
            </div>
            <div className="mb-6 flex flex-wrap gap-2">
              {[{ id: null, label: labels.all }, { id: FAVORITES, label: labels.favorites }, ...categories.map(name => ({ id: name, label: name }))].map(chip => (
                <Badge key={chip.id ?? 'all'} variant={category === chip.id ? 'default' : 'secondary'} className="cursor-pointer select-none" onClick={() => setCategory(chip.id)}>
                  {chip.id === FAVORITES && <Star size={12} weight="fill" className="mr-1" />}
                  {chip.label}
                </Badge>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">{links.length ? labels.emptySearch : labels.empty}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shown.map(link => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    labels={labels}
                    favorite={favoriteIds.has(link.id)}
                    teamName={teamName}
                    onOpen={() => void openLink(link)}
                    onFavorite={() => toggleFavorite(link.id)}
                    onEdit={() => setDialog({ kind: 'form', link })}
                    onSuggest={() => setDialog({ kind: 'suggest', link })}
                    onReport={() => setDialog({ kind: 'report', link })}
                    onDelete={() => setDialog({ kind: 'delete', link })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {snapshot?.actor.isManager && (
            <TabsContent value="review">
              <ReviewPanel
                snapshot={snapshot}
                labels={labels}
                busy={busy}
                onOpen={link => void openLink(link)}
                onApprove={link => runInBackground({ type: 'approve', linkId: link.id }, labels.toasts.approved)}
                onReject={link => setDialog({ kind: 'reject', link })}
                onSuggestion={(linkId, suggestionId, accept) => runInBackground({ type: 'resolve-suggestion', linkId, suggestionId, accept }, labels.toasts.resolved)}
                onReport={(linkId, reportId, action) => runInBackground({ type: 'resolve-report', linkId, reportId, action }, action === 'delete' ? labels.toasts.deleted : labels.toasts.resolved)}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {dialog?.kind === 'form' && snapshot && (
        <LinkFormDialog
          labels={labels}
          link={dialog.link}
          snapshot={snapshot}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={async fields => {
            const ok = dialog.link
              ? await run({ type: 'update', linkId: dialog.link.id, ...fields }, labels.toasts.saved)
              : await run({ type: 'create', ...fields }, snapshot.actor.isManager ? labels.toasts.created : labels.toasts.createdPending)
            if (ok) setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'suggest' && (
        <SuggestDialog labels={labels} link={dialog.link} busy={busy} onClose={() => setDialog(null)} onSend={changes => runInBackground({ type: 'suggest', linkId: dialog.link.id, ...changes }, labels.toasts.suggested)} />
      )}
      {dialog?.kind === 'report' && (
        <ReportDialog labels={labels} busy={busy} onClose={() => setDialog(null)} onSend={(reason, note) => runInBackground({ type: 'report', linkId: dialog.link.id, reason, note }, labels.toasts.reported)} />
      )}
      {dialog?.kind === 'reject' && (
        <NoteDialog title={`${labels.review.reject}: ${dialog.link.title}`} label={labels.review.rejectNote} action={labels.review.reject} cancel={labels.form.cancel} busy={busy} onClose={() => setDialog(null)} onConfirm={note => runInBackground({ type: 'reject', linkId: dialog.link.id, note }, labels.toasts.rejected)} />
      )}
      {dialog?.kind === 'delete' && (
        <Dialog open onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{labels.confirmDelete}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">{dialog.link.title}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>{labels.form.cancel}</Button>
              <Button variant="destructive" disabled={busy} onClick={() => runInBackground({ type: 'delete', linkId: dialog.link.id }, labels.toasts.deleted)}>{labels.delete}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function LinkCard({ link, labels, favorite, teamName, onOpen, onFavorite, onEdit, onSuggest, onReport, onDelete }: {
  link: LibraryLink; labels: LinksLabels; favorite: boolean; teamName: (code: string) => string
  onOpen: () => void; onFavorite: () => void; onEdit: () => void; onSuggest: () => void; onReport: () => void; onDelete: () => void
}) {
  const canEdit = link.canManage || (link.mine && link.status !== 'approved')
  const canDelete = canEdit
  const approved = link.status === 'approved'
  return (
    <TranslationScope>
    <Card data-link-id={link.id} className={cn('flex flex-col gap-3 p-5 transition-colors hover:border-primary/40', link.hidden && 'border-blocked/60')}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary" title={link.url} data-link-open={link.id}>
          <span className="block break-words text-base font-semibold text-foreground hover:underline"><AutoText text={link.title} /></span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">{link.domain}<ArrowSquareOut size={12} aria-hidden="true" /></span>
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onFavorite} aria-label={favorite ? labels.unfavorite : labels.favorite} aria-pressed={favorite}>
          <Star size={18} weight={favorite ? 'fill' : 'regular'} className={favorite ? 'text-attention' : 'text-muted-foreground'} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Flere handlinger" data-link-menu={link.id}><DotsThreeVertical size={18} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && <DropdownMenuItem onSelect={onEdit}><PencilSimple size={16} className="mr-2" />{labels.edit}</DropdownMenuItem>}
            {approved && !link.mySuggestionPending && <DropdownMenuItem onSelect={onSuggest}><PencilSimple size={16} className="mr-2" />{labels.suggest}</DropdownMenuItem>}
            {approved && !link.myReport && <DropdownMenuItem onSelect={onReport}><Flag size={16} className="mr-2" />{labels.report}</DropdownMenuItem>}
            {canDelete && <DropdownMenuItem onSelect={onDelete} className="text-destructive"><Trash size={16} className="mr-2" />{labels.delete}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="whitespace-pre-line break-words text-sm text-muted-foreground"><AutoText text={link.description} /></p>
      <TranslationNote className="-mt-1" />
      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
        {link.category && <Badge variant="secondary">{link.category}</Badge>}
        {link.status !== 'approved' && <Badge variant={link.status === 'rejected' ? 'destructive' : 'outline'} data-link-status={link.status}>{labels.status[link.status]}</Badge>}
        {link.hidden && <Badge variant="destructive"><ShieldWarning size={12} className="mr-1" />{labels.hidden}</Badge>}
        {link.sharedWithTeamCodes.length > 0 && <span className="text-muted-foreground">{labels.sharedWith}: {link.sharedWithTeamCodes.map(teamName).join(', ')}</span>}
      </div>
      {link.status === 'rejected' && <p className="text-xs text-blocked">{labels.review.rejectedBecause(link.reviewNote || '')}</p>}
      {(link.myReport || link.mySuggestionPending) && <p className="text-xs text-muted-foreground">{link.myReport ? labels.reported : labels.suggestionSent}</p>}
    </Card>
    </TranslationScope>
  )
}

function Warnings({ link, labels }: { link: { warnings: LibraryLink['warnings'] }; labels: LinksLabels }) {
  if (!link.warnings.length) return null
  return (
    <ul className="space-y-1" data-link-warnings>
      {link.warnings.map(warning => (
        <li key={warning} className="flex items-center gap-1.5 text-xs font-medium text-attention"><ShieldWarning size={14} />{labels.warnings[warning]}</li>
      ))}
    </ul>
  )
}

function ReviewPanel({ snapshot, labels, busy, onOpen, onApprove, onReject, onSuggestion, onReport }: {
  snapshot: LinksSnapshot; labels: LinksLabels; busy: boolean
  onOpen: (link: LibraryLink) => void; onApprove: (link: LibraryLink) => void; onReject: (link: LibraryLink) => void
  onSuggestion: (linkId: string, suggestionId: string, accept: boolean) => void
  onReport: (linkId: string, reportId: string, action: 'dismiss' | 'delete') => void
}) {
  const { pending, suggestions, reports } = snapshot.review
  if (!pending.length && !suggestions.length && !reports.length) return <p className="py-12 text-center text-muted-foreground">{labels.review.nothing}</p>
  const linkOf = (id: string) => snapshot.links.find(link => link.id === id)
  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{labels.review.pending}</h2>
          {pending.map(link => (
            <Card key={link.id} className="space-y-3 p-5" data-review-pending={link.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{link.title}</p>
                <span className="text-xs text-muted-foreground">{labels.addedBy(link.createdByName)}</span>
              </div>
              <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm"><strong>{link.domain}</strong> - {link.url}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{link.description}</p>
              <Warnings link={link} labels={labels} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpen(link)}><ArrowSquareOut size={16} />{labels.openTest}</Button>
                <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => onApprove(link)}><CheckCircle size={16} />{labels.review.approve}</Button>
                <Button size="sm" variant="destructive" className="gap-1.5" disabled={busy} onClick={() => onReject(link)}><XCircle size={16} />{labels.review.reject}</Button>
              </div>
            </Card>
          ))}
        </section>
      )}
      {suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{labels.review.suggestions}</h2>
          {suggestions.map(suggestion => (
            <Card key={suggestion.id} className="space-y-3 p-5" data-review-suggestion={suggestion.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{suggestion.linkTitle}</p>
                <span className="text-xs text-muted-foreground">{suggestion.byName}</span>
              </div>
              {suggestion.note && <p className="text-sm italic">“{suggestion.note}”</p>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {(['url', 'title', 'description', 'category'] as const).filter(field => suggestion[field]).map(field => (
                  <div key={field} className="contents">
                    <dt className="text-muted-foreground">{labels.review.current}</dt><dd className="break-all line-through opacity-70">{suggestion.current[field] || '-'}</dd>
                    <dt className="font-medium">{labels.review.proposed}</dt><dd className="break-all font-medium">{suggestion[field]}</dd>
                  </div>
                ))}
              </dl>
              <Warnings link={suggestion} labels={labels} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => onSuggestion(suggestion.linkId, suggestion.id, true)}>{labels.review.accept}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onSuggestion(suggestion.linkId, suggestion.id, false)}>{labels.review.decline}</Button>
              </div>
            </Card>
          ))}
        </section>
      )}
      {reports.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{labels.review.reports}</h2>
          {reports.map(report => {
            const link = linkOf(report.linkId)
            return (
              <Card key={report.id} className="space-y-3 p-5" data-review-report={report.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{report.linkTitle}</p>
                  <Badge variant={report.reason === 'suspicious' ? 'destructive' : 'secondary'}>{labels.review.reasons[report.reason]}</Badge>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">{report.url}</p>
                {report.note && <p className="text-sm italic">“{report.note}” - {report.byName}</p>}
                <div className="flex flex-wrap gap-2">
                  {link && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpen(link)}><ArrowSquareOut size={16} />{labels.openTest}</Button>}
                  <Button size="sm" disabled={busy} onClick={() => onReport(report.linkId, report.id, 'dismiss')}>{labels.review.dismiss}</Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReport(report.linkId, report.id, 'delete')}>{labels.review.deleteLink}</Button>
                </div>
              </Card>
            )
          })}
        </section>
      )}
    </div>
  )
}

function LinkFormDialog({ labels, link, snapshot, busy, onClose, onSave }: {
  labels: LinksLabels; link: LibraryLink | null; snapshot: LinksSnapshot; busy: boolean; onClose: () => void; onSave: (fields: LinkFields) => void
}) {
  const [url, setUrl] = useState(link?.url ?? '')
  const [title, setTitle] = useState(link?.title ?? '')
  const [description, setDescription] = useState(link?.description ?? '')
  const [category, setCategory] = useState(link?.category ?? '')
  const [shared, setShared] = useState<string[]>(link?.sharedWithTeamCodes ?? [])
  const owner = link?.ownerTeamCode ?? snapshot.actor.teamCode
  const otherTeams = snapshot.teams.filter(team => team.folderName !== owner)
  const categories = [...new Set(snapshot.links.map(entry => entry.category).filter(Boolean))]
  const urlOk = isAllowedLinkUrl(url)
  const valid = urlOk && title.trim() && description.trim()
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[560px]">
        <DialogHeader className="shrink-0"><DialogTitle>{link ? labels.form.editTitle : labels.form.newTitle}</DialogTitle></DialogHeader>
        <div className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto py-2 pr-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-url">{labels.form.url} *</Label>
            <Input id="link-url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" inputMode="url" />
            <p className={cn('text-xs', url && !urlOk ? 'text-destructive' : 'text-muted-foreground')}>{url && !urlOk ? labels.form.urlInvalid : labels.form.urlHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-title">{labels.form.name} *</Label>
            <Input id="link-title" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-description">{labels.form.description} *</Label>
            <Textarea id="link-description" value={description} maxLength={1000} rows={4} onChange={event => setDescription(event.target.value)} />
            <p className="text-xs text-muted-foreground">{labels.form.descriptionHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-category">{labels.form.category}</Label>
            <Input id="link-category" value={category} maxLength={60} list="link-categories" onChange={event => setCategory(event.target.value)} />
            <datalist id="link-categories">{categories.map(name => <option key={name} value={name} />)}</datalist>
          </div>
          {otherTeams.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{labels.form.share}</legend>
              <div className="grid grid-cols-2 gap-2">
                {otherTeams.map(team => (
                  <label key={team.folderName} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={shared.includes(team.folderName)} onCheckedChange={checked => setShared(current => checked === true ? [...current, team.folderName] : current.filter(code => code !== team.folderName))} />
                    {team.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{labels.form.shareHint}</p>
            </fieldset>
          )}
          {!snapshot.actor.isManager && <p className="rounded-md bg-secondary px-3 py-2 text-xs">{labels.form.pendingInfo}</p>}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>{labels.form.cancel}</Button>
          <Button disabled={!valid || busy} onClick={() => onSave({ url: url.trim(), title: title.trim(), description: description.trim(), category: category.trim(), sharedWithTeamCodes: shared })} data-link-save>{labels.form.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SuggestDialog({ labels, link, busy, onClose, onSend }: {
  labels: LinksLabels; link: LibraryLink; busy: boolean; onClose: () => void
  onSend: (changes: { url?: string; title?: string; description?: string; note?: string }) => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const urlOk = !url.trim() || isAllowedLinkUrl(url)
  const any = url.trim() || title.trim() || description.trim() || note.trim()
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader><DialogTitle>{labels.suggestForm.title}: {link.title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{labels.suggestForm.hint}</p>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="suggest-url">{labels.form.url}</Label><Input id="suggest-url" value={url} placeholder={link.url} onChange={event => setUrl(event.target.value)} />{!urlOk && <p className="text-xs text-destructive">{labels.form.urlInvalid}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="suggest-title">{labels.form.name}</Label><Input id="suggest-title" value={title} placeholder={link.title} maxLength={120} onChange={event => setTitle(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="suggest-description">{labels.form.description}</Label><Textarea id="suggest-description" value={description} placeholder={link.description} rows={3} maxLength={1000} onChange={event => setDescription(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="suggest-note">{labels.suggestForm.note}</Label><Input id="suggest-note" value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{labels.form.cancel}</Button>
          <Button disabled={!any || !urlOk || busy} onClick={() => onSend({ url: url.trim() || undefined, title: title.trim() || undefined, description: description.trim() || undefined, note: note.trim() || undefined })}>{labels.suggestForm.send}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReportDialog({ labels, busy, onClose, onSend }: { labels: LinksLabels; busy: boolean; onClose: () => void; onSend: (reason: LinkReportReason, note: string) => void }) {
  const [reason, setReason] = useState<LinkReportReason>('dead')
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader><DialogTitle>{labels.reportForm.title}</DialogTitle></DialogHeader>
        <div role="radiogroup" className="space-y-2">
          {(['dead', 'wrong', 'suspicious'] as const).map(value => (
            <label key={value} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm', reason === value && 'border-primary bg-secondary')}>
              <input type="radio" name="link-report" checked={reason === value} onChange={() => setReason(value)} />
              {labels.reportForm.reasons[value]}
            </label>
          ))}
        </div>
        {reason === 'suspicious' && <p className="text-xs text-attention">{labels.reportForm.suspiciousHint}</p>}
        <div className="space-y-1.5"><Label htmlFor="report-note">{labels.reportForm.note}</Label><Input id="report-note" value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{labels.form.cancel}</Button>
          <Button variant={reason === 'suspicious' ? 'destructive' : 'default'} disabled={busy} onClick={() => onSend(reason, note.trim())}>{labels.reportForm.send}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoteDialog({ title, label, action, cancel, busy, onClose, onConfirm }: { title: string; label: string; action: string; cancel: string; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="link-note">{label}</Label><Textarea id="link-note" value={note} rows={3} maxLength={500} onChange={event => setNote(event.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{cancel}</Button>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(note.trim())}>{action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
