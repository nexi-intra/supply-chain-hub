import { useMemo, useState } from 'react'
import {
  Archive, ArrowCounterClockwise, Check, Clock, Eye, NotePencil,
  PencilSimple, Trash, UserCircle, Warning, X,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/contexts/LanguageContext'
import type { ArchivedGuideEntry, Guide, GuideReviewRequest } from '@/lib/guideTypes'
import { canReviewGuideRequest } from '@/lib/guideReview'
import { cn } from '@/lib/utils'

interface GuideReviewDashboardProps {
  requests: GuideReviewRequest[]
  archivedGuides: ArchivedGuideEntry[]
  userEmail: string
  isReviewer: boolean
  isManager: boolean
  onEditRequest: (request: GuideReviewRequest, asReviewer: boolean) => void
  onPreview: (guide: Guide) => void
  onApprove: (request: GuideReviewRequest) => void
  onReturn: (request: GuideReviewRequest, comment: string) => void
  onWithdraw: (request: GuideReviewRequest) => void
  onDiscard: (request: GuideReviewRequest) => void
  onClaim: (request: GuideReviewRequest) => void
  onRestore: (entry: ArchivedGuideEntry) => void
}

const normalized = (email: string) => email.trim().toLowerCase()

function actionLabel(action: GuideReviewRequest['action'], da: boolean, fi: boolean) {
  const labels = {
    create: da ? 'Ny guide' : fi ? 'Uusi opas' : 'New guide',
    update: da ? 'Opdatering' : fi ? 'Päivitys' : 'Update',
    delete: da ? 'Sletning' : fi ? 'Poistaminen' : 'Deletion',
    restore: da ? 'Gendannelse' : fi ? 'Palautus' : 'Restore',
  }
  return labels[action]
}

function statusLabel(status: GuideReviewRequest['status'], da: boolean, fi: boolean) {
  const labels = {
    draft: da ? 'Kladde' : fi ? 'Luonnos' : 'Draft',
    pending: da ? 'Afventer review' : fi ? 'Odottaa tarkistusta' : 'Awaiting review',
    changes_requested: da ? 'Ændringer ønskes' : fi ? 'Muutoksia pyydetty' : 'Changes requested',
    approved: da ? 'Godkendt' : fi ? 'Hyväksytty' : 'Approved',
    withdrawn: da ? 'Trukket tilbage' : fi ? 'Peruutettu' : 'Withdrawn',
  }
  return labels[status]
}

function fieldValue(value: unknown, empty: string) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : empty
  if (value === null || value === undefined || value === '') return empty
  return String(value)
}

function GuideDifference({ before, after }: { before?: Guide; after?: Guide }) {
  const { language } = useLanguage()
  const da = language === 'da'
  const fi = language === 'fi'
  const empty = da ? 'Ikke angivet' : fi ? 'Ei määritetty' : 'Not specified'
  const fields = [
    { label: da ? 'Version' : fi ? 'Versio' : 'Version', before: before?.version, after: after?.version },
    { label: da ? 'Titel' : fi ? 'Otsikko' : 'Title', before: before?.title, after: after?.title },
    { label: da ? 'Kategori' : fi ? 'Luokka' : 'Category', before: before?.category, after: after?.category },
    { label: da ? 'Tags' : fi ? 'Tunnisteet' : 'Tags', before: before?.tags, after: after?.tags },
    { label: da ? 'Sprog' : fi ? 'Kieli' : 'Language', before: before?.language, after: after?.language },
    { label: da ? 'Revisionsinterval (måneder)' : fi ? 'Tarkistusväli (kuukautta)' : 'Review interval (months)', before: before?.reviewIntervalMonths, after: after?.reviewIntervalMonths },
    { label: da ? 'Delt med teams' : fi ? 'Jaettu tiimeille' : 'Shared with teams', before: before?.sharedWithTeamCodes, after: after?.sharedWithTeamCodes },
    {
      label: da ? 'Forsidebillede' : fi ? 'Kansikuva' : 'Cover image',
      before: before?.coverImageId ? (da ? 'Ja' : fi ? 'Kyllä' : 'Yes') : undefined,
      after: after?.coverImageId ? (da ? 'Ja' : fi ? 'Kyllä' : 'Yes') : undefined,
      changed: before?.coverImageId !== after?.coverImageId,
    },
    {
      label: da ? 'Word-fil' : fi ? 'Word-tiedosto' : 'Word file',
      before: before?.wordFileName,
      after: after?.wordFileName,
      changed: before?.fileUrl !== after?.fileUrl || before?.wordFileName !== after?.wordFileName,
    },
  ].filter((field) => field.changed ?? JSON.stringify(field.before ?? null) !== JSON.stringify(field.after ?? null))

  const beforeSections = new Map((before?.sections || []).map((section, index) => [section.id, { section, index }]))
  const afterSections = new Map((after?.sections || []).map((section, index) => [section.id, { section, index }]))
  const sectionIds = Array.from(new Set([...beforeSections.keys(), ...afterSections.keys()]))
  const sectionText = (section: NonNullable<Guide['sections']>[number]) => [
    section.heading,
    ...section.steps.map((step) => {
      const imageLabel = step.imageIds.length > 0
        ? ` [${step.imageIds.length} ${da ? (step.imageIds.length === 1 ? 'billede' : 'billeder') : fi ? 'kuvaa' : (step.imageIds.length === 1 ? 'image' : 'images')}]`
        : ''
      return `${step.text}${imageLabel}`
    }),
  ].join('\n').trim()

  return (
    <div className="space-y-4">
      {fields.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">{da ? 'Indstillinger' : fi ? 'Asetukset' : 'Settings'}</h4>
          {fields.map((field) => (
            <div key={field.label} className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr] gap-2 text-sm">
              <div className="font-medium py-2">{field.label}</div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 break-words">{fieldValue(field.before, empty)}</div>
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 break-words">{fieldValue(field.after, empty)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{da ? 'Udgivet version' : fi ? 'Julkaistu versio' : 'Published version'}</span>
          <span>{da ? 'Foreslået version' : fi ? 'Ehdotettu versio' : 'Proposed version'}</span>
        </div>
        {sectionIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{da ? 'Ingen tekstsektioner' : fi ? 'Ei tekstiosioita' : 'No text sections'}</p>
        ) : sectionIds.map((id) => {
          const oldEntry = beforeSections.get(id)
          const newEntry = afterSections.get(id)
          const oldSection = oldEntry?.section
          const newSection = newEntry?.section
          if (JSON.stringify(oldSection) === JSON.stringify(newSection) && oldEntry?.index === newEntry?.index) return null
          const oldText = oldSection ? sectionText(oldSection) : ''
          const newText = newSection ? sectionText(newSection) : ''
          return (
            <div key={id} className="grid grid-cols-2 gap-2 text-sm">
              <div className={cn('rounded-lg border px-3 py-2 whitespace-pre-wrap break-words min-h-12', oldSection ? 'border-red-500/30 bg-red-500/10' : 'border-dashed text-muted-foreground')}>
                {oldSection && oldEntry ? <span className="block text-xs font-semibold mb-1">{da ? 'Placering' : fi ? 'Sijainti' : 'Position'} {oldEntry.index + 1}</span> : null}
                {oldText || `— ${da ? 'tilføjet' : fi ? 'lisätty' : 'added'} —`}
              </div>
              <div className={cn('rounded-lg border px-3 py-2 whitespace-pre-wrap break-words min-h-12', newSection ? 'border-green-500/30 bg-green-500/10' : 'border-dashed text-muted-foreground')}>
                {newSection && newEntry ? <span className="block text-xs font-semibold mb-1">{da ? 'Placering' : fi ? 'Sijainti' : 'Position'} {newEntry.index + 1}</span> : null}
                {newText || `— ${da ? 'fjernet' : fi ? 'poistettu' : 'removed'} —`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function GuideReviewDashboard({
  requests, archivedGuides, userEmail, isReviewer, isManager, onEditRequest, onPreview,
  onApprove, onReturn, onWithdraw, onDiscard, onClaim, onRestore,
}: GuideReviewDashboardProps) {
  const { language } = useLanguage()
  const da = language === 'da'
  const fi = language === 'fi'
  const [returningRequest, setReturningRequest] = useState<GuideReviewRequest | null>(null)
  const [returnComment, setReturnComment] = useState('')
  const [discardingRequest, setDiscardingRequest] = useState<GuideReviewRequest | null>(null)
  const myRequests = useMemo(() => requests
    .filter((request) => normalized(request.submittedBy) === normalized(userEmail) && request.status !== 'withdrawn')
    .sort((left, right) => right.updatedAt - left.updatedAt), [requests, userEmail])
  const pending = useMemo(() => requests
    .filter((request) => request.status === 'pending')
    .sort((left, right) => left.submittedAt - right.submittedAt), [requests])
  const completed = useMemo(() => requests
    .filter((request) => request.status === 'approved')
    .sort((left, right) => (right.reviewedAt || 0) - (left.reviewedAt || 0)), [requests])

  const renderRequest = (request: GuideReviewRequest, reviewMode: boolean) => {
    const claimedByMe = normalized(request.claimedBy || '') === normalized(userEmail)
    const claimedByOther = Boolean(request.claimedBy && !claimedByMe)
    const canActAsReviewer = canReviewGuideRequest(request, userEmail, isManager)
    const canApprove = canActAsReviewer
    const previewGuide = request.proposedGuide || request.baseGuide
    return (
      <Card key={request.id} className="p-5 border-2 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="font-bold text-lg break-words">{request.guideTitle}</h3>
              <Badge variant="outline">{actionLabel(request.action, da, fi)}</Badge>
              <Badge variant={request.status === 'changes_requested' ? 'destructive' : 'secondary'}>{statusLabel(request.status, da, fi)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {request.submittedByName || request.submittedBy} · {new Date(request.submittedAt).toLocaleString(da ? 'da-DK' : fi ? 'fi-FI' : 'en-US')}
            </p>
            {request.changeNote && <p className="text-sm mt-2"><strong>{da ? 'Ændringsnote:' : fi ? 'Muutoshuomautus:' : 'Change note:'}</strong> {request.changeNote}</p>}
            {request.reviewerComment && (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <strong>{da ? 'Kommentar fra reviewer:' : fi ? 'Tarkistajan kommentti:' : 'Reviewer comment:'}</strong> {request.reviewerComment}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {request.baseGuide && request.proposedGuide && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onPreview(request.baseGuide!)}><Eye size={16} />{da ? 'Vis udgivet' : fi ? 'Näytä julkaistu' : 'View published'}</Button>}
            {previewGuide && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onPreview(previewGuide)}><Eye size={16} />{request.proposedGuide && request.baseGuide ? (da ? 'Vis forslag' : fi ? 'Näytä ehdotus' : 'View proposal') : (da ? 'Vis' : fi ? 'Näytä' : 'View')}</Button>}
            {!reviewMode && request.status === 'pending' && <Button size="sm" variant="outline" onClick={() => onWithdraw(request)}>{da ? 'Træk tilbage' : fi ? 'Peruuta' : 'Withdraw'}</Button>}
            {((!reviewMode && ['pending', 'draft', 'changes_requested'].includes(request.status)) || (reviewMode && isManager)) && (
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => setDiscardingRequest(request)}><Trash size={16} />{da ? 'Kassér' : fi ? 'Hylkää' : 'Discard'}</Button>
            )}
            {!reviewMode && (request.status === 'draft' || request.status === 'changes_requested') && request.action !== 'delete' && (
              <Button size="sm" className="gap-1.5" onClick={() => onEditRequest(request, false)}><PencilSimple size={16} />{da ? 'Ret og indsend' : fi ? 'Muokkaa ja lähetä' : 'Edit and resubmit'}</Button>
            )}
            {!reviewMode && (request.status === 'draft' || request.status === 'changes_requested') && request.action === 'delete' && (
              <Button size="sm" onClick={() => onEditRequest(request, false)}>{da ? 'Indsend sletning igen' : fi ? 'Lähetä poistaminen uudelleen' : 'Resubmit deletion'}</Button>
            )}
          </div>
        </div>

        {(request.action === 'update' || request.action === 'restore' || request.action === 'create') && (
          <details className="rounded-xl border bg-muted/20 p-4" open={reviewMode}>
            <summary className="cursor-pointer font-semibold">{da ? 'Se ændringer' : fi ? 'Näytä muutokset' : 'View changes'}</summary>
            <div className="mt-4"><GuideDifference before={request.baseGuide} after={request.proposedGuide} /></div>
          </details>
        )}
        {request.action === 'delete' && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
            <Warning size={22} className="text-destructive shrink-0" />
            <p className="text-sm">{da ? 'Den udgivne guide bliver arkiveret og fjernet fra biblioteket, hvis anmodningen godkendes.' : fi ? 'Julkaistu opas arkistoidaan ja poistetaan kirjastosta, jos pyyntö hyväksytään.' : 'The published guide will be archived and removed from the library if this request is approved.'}</p>
          </div>
        )}

        {reviewMode && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {!canActAsReviewer && <Badge variant="outline">{da ? 'Din egen indsendelse kræver en anden reviewer' : fi ? 'Oma lähetyksesi vaatii toisen tarkistajan' : 'Your own submission requires another reviewer'}</Badge>}
            {claimedByOther && <Badge variant="secondary">{da ? `Tages af ${request.claimedBy}` : fi ? `Tarkistaja: ${request.claimedBy}` : `Claimed by ${request.claimedBy}`}</Badge>}
            {canActAsReviewer && (!request.claimedBy || (claimedByOther && isManager)) && (
              <Button variant="outline" onClick={() => onClaim(request)}>{claimedByOther ? (da ? 'Overtag review' : fi ? 'Ota tarkistus' : 'Take over review') : (da ? 'Tag review' : fi ? 'Ota tarkistukseen' : 'Claim review')}</Button>
            )}
            {claimedByMe && request.action !== 'delete' && <Button variant="outline" className="gap-1.5" onClick={() => onEditRequest(request, true)}><NotePencil size={16} />{da ? 'Rediger forslag' : fi ? 'Muokkaa ehdotusta' : 'Edit proposal'}</Button>}
            {claimedByMe && <Button variant="outline" className="gap-1.5 text-destructive" onClick={() => { setReturningRequest(request); setReturnComment('') }}><X size={16} />{da ? 'Send tilbage' : fi ? 'Palauta' : 'Return'}</Button>}
            {claimedByMe && (
              <Button className="gap-1.5" disabled={!canApprove} title={!canApprove ? (da ? 'Guide Admins kan ikke godkende deres egne indsendelser' : fi ? 'Opasvastaava ei voi hyväksyä omaa lähetystään' : 'Guide Admins cannot approve their own submissions') : undefined} onClick={() => onApprove(request)}>
                <Check size={16} />{da ? 'Godkend og udgiv' : fi ? 'Hyväksy ja julkaise' : 'Approve and publish'}
              </Button>
            )}
          </div>
        )}
      </Card>
    )
  }

  return (
    <>
      <Tabs defaultValue={isReviewer ? 'review' : 'mine'} className="space-y-5">
        <TabsList className={cn('grid w-full h-auto', isReviewer ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1')}>
          {isReviewer && <TabsTrigger value="review" className="gap-2"><Clock size={17} />{da ? 'Review-kø' : fi ? 'Tarkistusjono' : 'Review queue'}{pending.length > 0 && <Badge>{pending.length}</Badge>}</TabsTrigger>}
          <TabsTrigger value="mine" className="gap-2"><UserCircle size={17} />{da ? 'Mine indsendelser' : fi ? 'Omat lähetykset' : 'My submissions'}{myRequests.filter((item) => item.status !== 'approved').length > 0 && <Badge variant="secondary">{myRequests.filter((item) => item.status !== 'approved').length}</Badge>}</TabsTrigger>
          {isReviewer && <TabsTrigger value="history" className="gap-2"><Check size={17} />{da ? 'Historik' : fi ? 'Historia' : 'History'}</TabsTrigger>}
          {isReviewer && <TabsTrigger value="archive" className="gap-2"><Archive size={17} />{da ? 'Arkiv' : fi ? 'Arkisto' : 'Archive'}</TabsTrigger>}
        </TabsList>

        {isReviewer && <TabsContent value="review" className="space-y-4">
          {pending.length === 0 ? <Card className="p-10 text-center text-muted-foreground">{da ? 'Der er ingen guides, som afventer review.' : fi ? 'Tarkistusta odottavia oppaita ei ole.' : 'No guides are awaiting review.'}</Card> : pending.map((request) => renderRequest(request, true))}
        </TabsContent>}

        <TabsContent value="mine" className="space-y-4">
          {myRequests.length === 0 ? <Card className="p-10 text-center text-muted-foreground">{da ? 'Du har ingen indsendelser endnu.' : fi ? 'Sinulla ei ole vielä lähetyksiä.' : 'You have no submissions yet.'}</Card> : myRequests.map((request) => renderRequest(request, false))}
        </TabsContent>

        {isReviewer && <TabsContent value="history" className="space-y-4">
          {completed.length === 0 ? <Card className="p-10 text-center text-muted-foreground">{da ? 'Der er endnu ingen afsluttede reviews.' : fi ? 'Valmiita tarkistuksia ei vielä ole.' : 'There are no completed reviews yet.'}</Card> : completed.map((request) => renderRequest(request, false))}
        </TabsContent>}

        {isReviewer && <TabsContent value="archive" className="space-y-3">
          {archivedGuides.filter((entry) => !entry.restoredAt).length === 0 ? <Card className="p-10 text-center text-muted-foreground">{da ? 'Arkivet er tomt.' : fi ? 'Arkisto on tyhjä.' : 'The archive is empty.'}</Card> : archivedGuides.filter((entry) => !entry.restoredAt).map((entry) => (
            <Card key={entry.id} className="p-5 border-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div><h3 className="font-bold">{entry.guide.title}</h3><p className="text-sm text-muted-foreground">v{entry.guide.version || '1.00'} · {new Date(entry.archivedAt).toLocaleString(da ? 'da-DK' : fi ? 'fi-FI' : 'en-US')}</p></div>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onPreview(entry.guide)}><Eye size={16} className="mr-1.5" />{da ? 'Vis' : fi ? 'Näytä' : 'View'}</Button><Button size="sm" onClick={() => onRestore(entry)}><ArrowCounterClockwise size={16} className="mr-1.5" />{da ? 'Anmod om gendannelse' : fi ? 'Pyydä palautusta' : 'Request restore'}</Button></div>
            </Card>
          ))}
        </TabsContent>}
      </Tabs>

      <Dialog open={returningRequest !== null} onOpenChange={(open) => !open && setReturningRequest(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{da ? 'Send guiden tilbage' : fi ? 'Palauta opas' : 'Return guide'}</DialogTitle><DialogDescription>{da ? 'Forklar tydeligt, hvad forfatteren skal ændre.' : fi ? 'Selitä selkeästi, mitä tekijän tulee muuttaa.' : 'Explain clearly what the author needs to change.'}</DialogDescription></DialogHeader>
          <Textarea value={returnComment} onChange={(event) => setReturnComment(event.target.value)} rows={5} placeholder={da ? 'Skriv en kommentar…' : fi ? 'Kirjoita kommentti...' : 'Write a comment…'} />
          <DialogFooter><Button variant="outline" onClick={() => setReturningRequest(null)}>{da ? 'Annuller' : fi ? 'Peruuta' : 'Cancel'}</Button><Button disabled={!returnComment.trim()} onClick={() => { if (returningRequest && returnComment.trim()) onReturn(returningRequest, returnComment.trim()); setReturningRequest(null) }}>{da ? 'Send tilbage' : fi ? 'Palauta' : 'Return'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={discardingRequest !== null} onOpenChange={(open) => !open && setDiscardingRequest(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{da ? 'Kassér anmodningen?' : fi ? 'Hylkää pyyntö?' : 'Discard the request?'}</DialogTitle><DialogDescription>{da ? 'Anmodningen og dens forslag fjernes helt. Den udgivne guide påvirkes ikke. Dette kan ikke fortrydes.' : fi ? 'Pyyntö ja sen ehdotus poistetaan kokonaan. Julkaistuun oppaaseen ei vaikuteta. Tätä ei voi kumota.' : 'The request and its proposal are removed entirely. The published guide is not affected. This cannot be undone.'}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDiscardingRequest(null)}>{da ? 'Annuller' : fi ? 'Peruuta' : 'Cancel'}</Button><Button variant="destructive" onClick={() => { if (discardingRequest) onDiscard(discardingRequest); setDiscardingRequest(null) }}>{da ? 'Kassér anmodning' : fi ? 'Hylkää pyyntö' : 'Discard request'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
