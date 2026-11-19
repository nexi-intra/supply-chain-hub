import { useMemo, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowSquareOut, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLibraryLanguage } from '@/contexts/LibraryContext'
import { resolveGuideLink, summariseGuideLink, type GuideLinkEntry, type GuideLinkTarget } from '@/lib/guideLinks'

export interface GuideLinkPreviewProps {
  target: GuideLinkTarget
  entries: readonly GuideLinkEntry[]
  onNavigate: (target: GuideLinkTarget) => void
  children: ReactNode
}

const labels = {
  da: {
    preview: 'Guidevisning',
    available: 'Tilg\u00e6ngelig',
    unavailable: 'Guiden er ikke tilg\u00e6ngelig.',
    archived: 'Guiden er arkiveret og kan ikke \u00e5bnes.',
    missingSection: 'Sektionen findes ikke l\u00e6ngere. Guiden kan stadig \u00e5bnes.',
    missingStep: 'Trinnet findes ikke l\u00e6ngere. Guiden kan stadig \u00e5bnes.',
    open: '\u00c5bn guide',
  },
  en: {
    preview: 'Guide preview',
    available: 'Available',
    unavailable: 'The guide is unavailable.',
    archived: 'The guide is archived and cannot be opened.',
    missingSection: 'The section no longer exists. The guide can still be opened.',
    missingStep: 'The step no longer exists. The guide can still be opened.',
    open: 'Open guide',
  },
  fi: {
    preview: 'Oppaan esikatselu',
    available: 'Saatavilla',
    unavailable: 'Opas ei ole saatavilla.',
    archived: 'Opas on arkistoitu, eik\u00e4 sit\u00e4 voi avata.',
    missingSection: 'Osiota ei en\u00e4\u00e4 ole. Oppaan voi silti avata.',
    missingStep: 'Vaihetta ei en\u00e4\u00e4 ole. Oppaan voi silti avata.',
    open: 'Avaa opas',
  },
  sv: {
    preview: 'Förhandsvisning av guide',
    available: 'Tillgänglig',
    unavailable: 'Guiden är inte tillgänglig.',
    archived: 'Guiden är arkiverad och kan inte öppnas.',
    missingSection: 'Avsnittet finns inte längre. Guiden kan fortfarande öppnas.',
    missingStep: 'Steget finns inte längre. Guiden kan fortfarande öppnas.',
    open: 'Öppna guide',
  },
}

export function GuideLinkPreview({ target, entries, onNavigate, children }: GuideLinkPreviewProps) {
  const { language, lt } = useLibraryLanguage()
  const localized = useMemo(() => Object.fromEntries(Object.entries(labels[language]).map(([key, text]) => [key, lt(text)])) as typeof labels[typeof language], [language, lt])
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const suppressFocusPreview = useRef(false)
  const dismissedOutside = useRef(false)
  const titleId = useId()
  const resolution = resolveGuideLink(target, entries)
  const summary = 'guide' in resolution ? summariseGuideLink(resolution.guide) : null
  const warning = resolution.status === 'missing-section'
    ? localized.missingSection
    : resolution.status === 'missing-step' ? localized.missingStep : null

  function openPreview() {
    dismissedOutside.current = false
    setOpen(true)
  }

  function navigate() {
    if (!('guide' in resolution)) return
    const destination = { ...target }
    if (resolution.status === 'missing-section' || resolution.status === 'missing-step') {
      delete destination.sectionId
      delete destination.stepId
    }
    setOpen(false)
    onNavigate(destination)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="link"
          className="inline h-auto max-w-full min-w-0 whitespace-normal rounded-sm p-0 text-left align-baseline font-inherit [overflow-wrap:anywhere]"
          onMouseEnter={openPreview}
          onFocus={() => {
            if (suppressFocusPreview.current) {
              suppressFocusPreview.current = false
              return
            }
            openPreview()
          }}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            openPreview()
          }}
        >
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        aria-labelledby={titleId}
        className="w-80 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto [overflow-wrap:anywhere]"
        onOpenAutoFocus={event => event.preventDefault()}
        onInteractOutside={() => { dismissedOutside.current = true }}
        onEscapeKeyDown={() => { dismissedOutside.current = false }}
        onCloseAutoFocus={event => {
          event.preventDefault()
          if (!dismissedOutside.current && triggerRef.current && document.activeElement !== triggerRef.current) {
            suppressFocusPreview.current = true
            triggerRef.current.focus()
            suppressFocusPreview.current = false
          }
        }}
      >
        <div className="min-w-0 space-y-3">
          <p id={titleId} className="text-sm font-semibold leading-snug">
            {summary ? summary.title : localized.preview}
          </p>
          {summary ? (
            <>
              {summary.category && <p className="text-xs text-muted-foreground">{summary.category}</p>}
              {summary.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary.text}</p>}
              <p role="status" className={`flex items-start gap-2 text-xs ${warning ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                {warning && <WarningCircle size={16} className="shrink-0" aria-hidden="true" />}
                <span className="min-w-0">{warning || localized.available}</span>
              </p>
              <Button type="button" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal" onClick={event => {
                event.stopPropagation()
                navigate()
              }}>
                <ArrowSquareOut size={16} aria-hidden="true" />
                {localized.open}
              </Button>
            </>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {resolution.status === 'archived' ? localized.archived : localized.unavailable}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}