import { useState, useEffect, useRef, useCallback } from 'react'
import { PaperPlaneRight, Stop, Image as ImageIcon, ArrowSquareOut, X } from '@phosphor-icons/react'
import { HubertIcon } from './HubertIcon'
import { AssistantChatWindow, type ChatWidth } from '@/components/AssistantChatWindow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { GuideViewer } from '@/components/GuideViewer'
import { useLanguage } from '@/contexts/LanguageContext'
import type { AssistantScope, AssistantSource, AssistantAnswer, AssistantStatus } from '@/lib/assistantBridge'
import type { Guide } from '@/lib/guideTypes'
import { submitVacationRequest } from '@/lib/vacationRequests'
import { createPersonalTodo } from '@/lib/personalTodos'
const KNOWLEDGE_LABEL = { da: 'Søgning i hubdata', en: 'Hub data search', fi: 'Hub-tietojen haku' }
const MORE_LABEL = { da: 'Vis flere resultater', en: 'Show more results', fi: 'Näytä lisää tuloksia' }
const PREPARE_LABEL = {
  da: { loading: 'Forbereder guides i baggrunden…', ready: 'Guidesøgning klar', failed: 'Guides kunne ikke forberedes. Kontrollér forbindelsen til datamappen.', retry: 'Prøv igen' },
  en: { loading: 'Preparing guides in the background…', ready: 'Guide search ready', failed: 'Guides could not be prepared. Check the storage connection.', retry: 'Retry' },
  fi: { loading: 'Oppaita valmistellaan taustalla…', ready: 'Opashaku valmis', failed: 'Oppaita ei voitu valmistella. Tarkista yhteys tietokansioon.', retry: 'Yritä uudelleen' },
}
const CHAT_TEXT = {
  da: { open: 'Spørg Hubert', welcome: 'Hvad kan jeg hjælpe dig med?', placeholder: 'Spørg Hubert…', stopped: 'Svaret blev afbrudt.' },
  en: { open: 'Ask Hubert', welcome: 'How can I help?', placeholder: 'Ask Hubert…', stopped: 'The answer was stopped.' },
  fi: { open: 'Kysy Hubertilta', welcome: 'Miten voin auttaa?', placeholder: 'Kysy Hubertilta…', stopped: 'Vastaus keskeytettiin.' },
}
// Handlings-forslag (fx "opret en ferieanmodning") kraever ALTID et eksplicit
// bekraeft-klik - Hubert skriver aldrig noget uden det, uanset hvor "simpel"
// handlingen er. Se electron/assistantActions.cjs for selve genkendelsen.
const ACTION_TEXT = {
  da: { confirm: 'Bekræft', cancel: 'Annuller', cancelled: 'Annulleret — der er ikke skrevet noget.', vacationSuccess: 'Ferieanmodningen er oprettet og sendt til godkendelse.', todoSuccess: 'To-do\'en er oprettet.', failed: 'Kunne ikke gennemføre handlingen. Prøv igen fra den relevante side i appen.' },
  en: { confirm: 'Confirm', cancel: 'Cancel', cancelled: 'Cancelled — nothing was written.', vacationSuccess: 'The vacation request was created and sent for approval.', todoSuccess: 'The to-do was created.', failed: 'Could not complete the action. Try again from the relevant page in the app.' },
  fi: { confirm: 'Vahvista', cancel: 'Peruuta', cancelled: 'Peruttu — mitään ei tallennettu.', vacationSuccess: 'Loma-anomus luotiin ja lähetettiin hyväksyttäväksi.', todoSuccess: 'To-do luotiin.', failed: 'Toimintoa ei voitu suorittaa. Yritä uudelleen sovelluksen asianomaiselta sivulta.' },
}
const AI_LABELS = {
  da: { activate: 'Aktivér AI-svar', hint: 'AI-sammenfatning er ikke aktiveret på denne pc. Hent modellen fra det delte drev (engangs, ca. 6 GB).', downloading: 'Henter AI-model', retry: 'Prøv igen' },
  en: { activate: 'Enable AI answers', hint: 'AI summaries are not enabled on this PC. Fetch the model from the shared drive (one-time, ~6 GB).', downloading: 'Downloading AI model', retry: 'Retry' },
  fi: { activate: 'Ota tekoäly käyttöön', hint: 'Tekoälykoosteita ei ole otettu käyttöön tällä koneella. Nouda malli jaetulta asemalta (kertaluontoinen, n. 6 Gt).', downloading: 'Ladataan tekoälymallia', retry: 'Yritä uudelleen' },
}
const readableError = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').replace(/^Error:\s*/, '')

const LABELS = {
  da: { title: 'Hub-assistent · lokal test', intro: 'Spørg om dine opgaver, hjemmearbejde, ferie eller guides. Planlægning slås direkte op; guideforklaringer bruger lokal AI. Der ændres ingen data.', placeholder: 'Fx: Hvor er Anne i dag?', send: 'Send', wait: 'Arbejder lokalt…', stop: 'Stop', images: 'Læs også guidebillede (langsommere)', attach: 'Vedhæft testbillede', data: 'Direkte dataopslag', retrieval: 'Guideopslag', ai: 'Lokal AI — kontrollér kilderne', sources: 'Kilder', clear: 'Ryd chat', size: 'Bredde', examples: ['Hvem er på arbejde i dag?', 'Hvor er kollegaen i morgen?', 'Hvem har flest opgaver i næste uge?', 'Hvilke opgaver skal jeg lave i næste uge?'], missing: 'Modellen er ikke installeret endnu.', version: 'Guiden er ændret siden svaret. Den aktuelle version vises uden trinmarkering.' },
  en: { title: 'Hub assistant · local pilot', intro: 'Ask about your tasks, working from home, vacation or guides. Planning uses direct lookups; guide explanations use local AI. No data is changed.', placeholder: 'E.g. Where is Anne today?', send: 'Send', wait: 'Working locally…', stop: 'Stop', images: 'Read a guide image too (slower)', attach: 'Attach test image', data: 'Direct data lookup', retrieval: 'Guide lookup', ai: 'Local AI — check sources', sources: 'Sources', clear: 'Clear chat', size: 'Width', examples: ['Who is at work today?', 'When is my colleague back?', 'Who has the most tasks next week?', 'Which tasks do I have next week?'], missing: 'The model is not installed yet.', version: 'The guide changed since the answer. Showing the current version without a step highlight.' },
  fi: { title: 'Hub-avustaja · paikallinen testi', intro: 'Kysy tehtävistäsi, etätyöstä, lomista tai oppaista. Suunnittelutiedot haetaan suoraan; oppaiden selitykset käyttävät paikallista tekoälyä. Tietoja ei muuteta.', placeholder: 'Esim. Missä Anne on tänään?', send: 'Lähetä', wait: 'Käsitellään paikallisesti…', stop: 'Pysäytä', images: 'Lue myös oppaan kuva (hitaampi)', attach: 'Liitä testikuva', data: 'Suora tietohaku', retrieval: 'Opashaku', ai: 'Paikallinen tekoäly — tarkista lähteet', sources: 'Lähteet', clear: 'Tyhjennä keskustelu', size: 'Leveys', examples: ['Ketkä ovat töissä tänään?', 'Milloin kollega palaa?', 'Kenellä on eniten tehtäviä ensi viikolla?', 'Mitkä tehtävät minulla on ensi viikolla?'], missing: 'Mallia ei ole vielä asennettu.', version: 'Opas muuttui vastauksen jälkeen. Nykyinen versio näytetään ilman vaihemerkintää.' },
}

export function HubAssistant({ token, viewId }: AssistantScope) {
  const { language } = useLanguage()
  const t = LABELS[language]
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ id: number; question: string; answer?: AssistantAnswer; error?: string; actionOutcome?: 'confirmed' | 'cancelled' | 'success' | 'failed'; actionOutcomeMessage?: string }>>([])
  const [busy, setBusy] = useState(false)
  const [preparation, setPreparation] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [prepareAttempt, setPrepareAttempt] = useState(0)
  const [error, setError] = useState('')
  const [includeImages, setIncludeImages] = useState(false)
  const [image, setImage] = useState<{ data: string; name: string } | null>(null)
  const [width, setWidth] = useState<ChatWidth>('compact')
  const [selectedGuide, setSelectedGuide] = useState<{ guide: Guide; source: AssistantSource } | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<{ title: string; text: string } | null>(null)
  const [aiStatus, setAiStatus] = useState<AssistantStatus | null>(null)
  const [provisionPct, setProvisionPct] = useState(0)
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const sequence = useRef(0)
  const scroll = useRef<HTMLDivElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLInputElement>(null)
  const api = window.electronAssistant
  const enabled = !!api

  useEffect(() => {
    // Kun til at udfylde afsender/ejer paa en handling Hubert opretter EFTER
    // eksplicit brugerbekraeftelse (se confirmAction) - laeses ikke af nogen
    // besvarelse/opslag.
    window.electronAuth?.current().then(session => setUserEmail(session.email)).catch(() => {})
  }, [])

  useEffect(() => {
    sequence.current++
    setMessages([]); setSelectedGuide(null); setSelectedRecord(null); setImage(null); setInput(''); setError(''); setBusy(false); setOpen(false)
    void api?.stop({ clearCache: true })
    return () => { sequence.current++; void api?.stop({ clearCache: true }) }
  }, [token, viewId, api])

  useEffect(() => {
    if (!enabled || !token || !open) return
    let cancelled = false
    setPreparation('loading')
    const timer = setTimeout(() => {
      void api!.prepare({ token, viewId }).then(() => { if (!cancelled) setPreparation('ready') }).catch(() => { if (!cancelled) setPreparation('failed') })
    }, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [enabled, token, viewId, api, prepareAttempt, open])

  useEffect(() => {
    if (!enabled) return
    return api!.onGuidesChanged(() => setPrepareAttempt(value => value + 1))
  }, [enabled, api])

  useEffect(() => {
    if (!enabled || !token || !open) return
    let cancelled = false
    void api!.status({ token, viewId }).then(value => { if (!cancelled) setAiStatus(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [enabled, token, viewId, api, open, prepareAttempt])

  useEffect(() => {
    if (!enabled) return
    return api!.onProvisionProgress(progress => setProvisionPct(Math.round((progress.ratio || 0) * 100)))
  }, [enabled, api])

  useEffect(() => {
    if (!enabled) return
    return api!.onContextChanged(() => {
      sequence.current++
      setPrepareAttempt(value => value + 1)
      setOpen(false); setMessages([]); setSelectedGuide(null); setSelectedRecord(null); setImage(null); setInput(''); setError(''); setBusy(false)
    })
  }, [api, enabled])

  useEffect(() => {
    if (!enabled) return
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.altKey) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (open && !minimized) setMinimized(true)
        else { setOpen(true); setMinimized(false) }
      }
    }
    window.addEventListener('keydown', shortcut, true)
    return () => window.removeEventListener('keydown', shortcut, true)
  }, [enabled, api, open, minimized])
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight }, [messages, busy, open, minimized])
  useEffect(() => { if (open && !minimized) composer.current?.focus() }, [open, minimized])
  useEffect(() => {
    if (!open) { sequence.current++; setBusy(false); void api?.stop() }
    else setPrepareAttempt(value => value + 1)
  }, [open, api])

  const send = async (question = input.trim(), selectedPerson?: string, page?: number) => {
    if (!api || busy || !question.trim()) return
    const requestId = ++sequence.current
    setBusy(true); setError(''); setInput('')
    setMessages(current => [...current, { id: requestId, question }])
    try {
      const lastAnswer = [...messages].reverse().find(message => message.answer)?.answer
      const previousQuestion = lastAnswer?.contextQuestion || lastAnswer?.scoreContext
      // Only bounded question context, never old answer bodies as fresh facts.
      const conversation = messages.filter(message => message.answer).slice(-6).map(message => message.answer?.contextQuestion || message.answer?.scoreContext || message.question)
      const answer = await api.ask({ token, viewId, question, language, includeImages, image: image?.data, selectedPerson, previousQuestion, conversation, page })
      if (requestId !== sequence.current) return
      setMessages(current => current.map(message => message.id === requestId ? { ...message, answer } : message)); setImage(null)
    } catch (failure) {
      if (requestId === sequence.current) setMessages(current => current.map(message => message.id === requestId ? { ...message, error: readableError(failure) } : message))
    } finally { if (requestId === sequence.current) setBusy(false) }
  }
  const cancelAction = (messageId: number) => {
    setMessages(current => current.map(message => message.id === messageId ? { ...message, actionOutcome: 'cancelled' } : message))
  }
  // Eneste sted et handlings-forslag fra Hubert bliver til en rigtig
  // skrivning - og kun efter brugeren selv har trykket "Bekræft" her. Kalder
  // PRÆCIS samme delte funktion som den manuelle dialog/formular bruger
  // (submitVacationRequest/createPersonalTodo), saa validering, KV-skrivevej
  // og rettighedshaandhaevelse er identisk uanset hvor handlingen kom fra.
  const confirmAction = async (messageId: number, proposal: NonNullable<AssistantAnswer['actionProposal']>) => {
    setMessages(current => current.map(message => message.id === messageId ? { ...message, actionOutcome: 'confirmed' } : message))
    const text = ACTION_TEXT[language]
    try {
      if (!userEmail) throw new Error('Ingen bruger fundet')
      if (proposal.type === 'vacation-request') {
        await submitVacationRequest({ userEmail, startDate: proposal.params.startDate, endDate: proposal.params.endDate })
        setMessages(current => current.map(message => message.id === messageId ? { ...message, actionOutcome: 'success', actionOutcomeMessage: text.vacationSuccess } : message))
      } else if (proposal.type === 'personal-todo') {
        await createPersonalTodo(userEmail, proposal.params.title)
        setMessages(current => current.map(message => message.id === messageId ? { ...message, actionOutcome: 'success', actionOutcomeMessage: text.todoSuccess } : message))
      }
    } catch (failure) {
      console.error('Hubert action failed:', failure)
      setMessages(current => current.map(message => message.id === messageId ? { ...message, actionOutcome: 'failed', actionOutcomeMessage: text.failed } : message))
    }
  }
  const openSource = async (source: AssistantSource) => {
    if (!api) return
    const requestId = sequence.current
    try {
      if (source.kind === 'module' && source.moduleId && source.recordId) {
        const record = await api.record({ token, viewId, teamId: source.teamId, moduleId: source.moduleId, recordId: source.recordId, language })
        if (requestId === sequence.current) setSelectedRecord(record)
        return
      }
      if (!source.guideId) return
      const guide = await api.guide({ token, viewId, teamId: source.teamId, guideId: source.guideId })
      if (requestId !== sequence.current) return
      const sameVersion = (guide.version || '1.00') === source.version
      setSelectedGuide({ guide, source: sameVersion ? source : { ...source, reference: undefined } })
      if (!sameVersion) setError(t.version)
    } catch (failure) { setError(readableError(failure)) }
  }
  const fileLoader = useCallback(async (url: string) => {
    if (!api || !selectedGuide) throw new Error('No guide selected')
    const data = await api.image({ token, viewId, teamId: selectedGuide.source.teamId, guideId: selectedGuide.guide.id, imageId: url.replace(/^kv:\/\//, '') })
    return (await fetch(data)).blob()
  }, [api, token, viewId, selectedGuide])

  const provisionModel = async () => {
    if (!api || isProvisioning) return
    setProvisionError(''); setProvisionPct(0); setIsProvisioning(true)
    try {
      const updated = await api.provision({ token, viewId })
      setAiStatus(updated)
    } catch (failure) {
      setProvisionError(readableError(failure))
    } finally { setIsProvisioning(false) }
  }

  if (!enabled) return null
  return <>
    {(!open || minimized) && <Button onClick={() => { setOpen(true); setMinimized(false) }} className="fixed bottom-5 right-5 z-40 rounded-full shadow-xl gap-2" title={`Hubert · Ctrl+S · ${PREPARE_LABEL[language][preparation]}`}><HubertIcon size={22} />{CHAT_TEXT[language].open}</Button>}
    {open && !minimized && <div ref={panel} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMinimized(true) } }}>
      <AssistantChatWindow language={language} width={width} onWidthChange={setWidth} onMinimize={() => setMinimized(true)} onClose={() => { setOpen(false); setMinimized(false) }} ready={preparation === 'ready'} status={PREPARE_LABEL[language][preparation]} settings={<>
        <label className="flex gap-2 text-xs items-start"><input type="checkbox" checked={includeImages} onChange={event => setIncludeImages(event.target.checked)} />{t.images}</label>
        <button type="button" className="text-xs hover:underline" disabled={busy} onClick={() => { setMessages([]); setError('') }}>{t.clear}</button>
        {preparation === 'failed' && <button type="button" className="block text-xs hover:underline" onClick={() => setPrepareAttempt(value => value + 1)}>{PREPARE_LABEL[language].retry}</button>}
      </>}>
        <div ref={scroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 space-y-4" aria-live="polite">
          {aiStatus && !aiStatus.installed && (aiStatus.sharedAvailable || isProvisioning) && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
              {isProvisioning ? (
                <>
                  <div className="font-medium text-foreground">{AI_LABELS[language].downloading}… {provisionPct}%</div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${provisionPct}%` }} /></div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{AI_LABELS[language].hint}</p>
                  <Button size="sm" className="h-7 text-xs" onClick={() => void provisionModel()}>{AI_LABELS[language].activate}</Button>
                  {provisionError && <p className="text-destructive">{provisionError}</p>}
                </>
              )}
            </div>
          )}
          {!messages.length && <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><HubertIcon size={30} /></span><p className="text-sm text-muted-foreground">{CHAT_TEXT[language].welcome}</p></div>}
          {messages.map(message => <div key={message.id} className="space-y-3">
            <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words">{message.question}</div>
            {message.answer && <div className="mr-3 rounded-2xl rounded-bl-md bg-muted/55 px-3.5 py-3 text-sm space-y-3">
              <p className="whitespace-pre-wrap break-words leading-relaxed">{message.answer.text}</p>
              {message.answer.actionProposal && (
                message.actionOutcome === 'success' || message.actionOutcome === 'failed' ? (
                  <p className={message.actionOutcome === 'failed' ? 'text-xs text-destructive' : 'text-xs text-primary'}>{message.actionOutcomeMessage}</p>
                ) : message.actionOutcome === 'cancelled' ? (
                  <p className="text-xs text-muted-foreground">{ACTION_TEXT[language].cancelled}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" disabled={message.actionOutcome === 'confirmed'} onClick={() => void confirmAction(message.id, message.answer!.actionProposal!)}>{ACTION_TEXT[language].confirm}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={message.actionOutcome === 'confirmed'} onClick={() => cancelAction(message.id)}>{ACTION_TEXT[language].cancel}</Button>
                  </div>
                )
              )}
              {!!message.answer.personChoices?.length && <div className="flex flex-col items-start gap-2">{message.answer.personChoices.map(choice => <Button key={choice.id} type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send(message.question, choice.id)}>{choice.label}</Button>)}</div>}
              {message.answer.nextPage !== undefined && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send(message.answer!.contextQuestion || message.question, undefined, message.answer!.nextPage)}>{MORE_LABEL[language]}</Button>}
              {message.answer.warning && <details className="text-xs text-amber-600"><summary className="cursor-pointer">{t.ai}</summary><p className="mt-1 whitespace-pre-wrap break-words">{message.answer.warning}</p></details>}
              {!!message.answer.sources.length && <details className="border-t border-border/50 pt-2"><summary className="cursor-pointer text-xs text-muted-foreground">{t.sources} · {message.answer.sources.length}</summary><div className="mt-2 space-y-2">{message.answer.sources.map((source, sourceIndex) => source.kind === 'guide' || source.kind === 'module' ? <button key={sourceIndex} onClick={() => void openSource(source)} className="flex items-start gap-1.5 text-primary text-left text-xs hover:underline"><span>[{sourceIndex + 1}] {source.title}</span><ArrowSquareOut size={14} className="mt-0.5 shrink-0" /></button> : <p key={sourceIndex} className="text-xs">{source.title}</p>)}</div></details>}
            </div>}
            {message.error && <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap break-words" role="alert">{message.error}</p>}
          </div>)}
          {busy && <div className="flex gap-1.5 py-2 text-muted-foreground" role="status" aria-label={t.wait}>{[0, 1, 2].map(dot => <span key={dot} className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${dot * 160}ms` }} />)}</div>}
          {error && <p className="text-xs text-destructive whitespace-pre-wrap break-words" role="alert">{error}</p>}
        </div>
        <form className="shrink-0 border-t border-border/60 px-3 py-3" onSubmit={event => { event.preventDefault(); void send() }}>
          <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''
            if (!file) return
            if (file.size > 5 * 1024 ** 2) { setError('Max 5 MB'); return }
            const reader = new FileReader()
            const requestId = sequence.current
            reader.onload = () => { if (requestId === sequence.current) setImage({ data: String(reader.result), name: file.name }) }
            reader.readAsDataURL(file)
          }} />
          {image && <button type="button" onClick={() => setImage(null)} className="mb-2 flex max-w-full items-center gap-1 text-xs text-muted-foreground"><span className="truncate">{image.name}</span><X size={12} /></button>}
          <div className="flex items-center gap-2 rounded-full border bg-background/60 p-1.5"><button type="button" aria-label={t.attach} title={t.attach} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" disabled={busy} onClick={() => upload.current?.click()}><ImageIcon size={18} /></button><Input ref={composer} value={input} maxLength={1000} onChange={event => setInput(event.target.value)} placeholder={CHAT_TEXT[language].placeholder} aria-label={CHAT_TEXT[language].placeholder} className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0" disabled={busy} />{busy ? <Button type="button" size="icon" className="size-8 shrink-0 rounded-full" aria-label={t.stop} onClick={() => { sequence.current++; setBusy(false); setMessages(current => current.map(message => !message.answer && !message.error ? { ...message, error: CHAT_TEXT[language].stopped } : message)); void api.stop() }}><Stop size={16} /></Button> : <Button type="submit" size="icon" className="size-8 shrink-0 rounded-full" aria-label={t.send} disabled={!input.trim()}><PaperPlaneRight size={16} /></Button>}</div>
        </form>
      </AssistantChatWindow>
    </div>}
    <GuideViewer guide={selectedGuide?.guide || null} open={!!selectedGuide} onOpenChange={value => { if (!value) setSelectedGuide(null) }} fileLoader={fileLoader} targetReference={selectedGuide?.source.reference} />
    <Dialog open={!!selectedRecord} onOpenChange={value => { if (!value) setSelectedRecord(null) }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedRecord?.title}</DialogTitle><DialogDescription>{KNOWLEDGE_LABEL[language]}</DialogDescription></DialogHeader><div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{selectedRecord?.text}</div></DialogContent></Dialog>
  </>
}
