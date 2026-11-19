import { Fragment, type ReactNode } from 'react'
import { Info, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import { getStepDocument, type GuideRichNode } from '@/lib/guideRichText'
import type { GuideStep } from '@/lib/guideTypes'
import { linkifyText } from '@/lib/linkify'
import type { Language } from '@/lib/translations'

export interface GuideRichTextProps {
  step: Pick<GuideStep, 'text' | 'richContent'>
  onGuideLink?: (target: Record<string, string>) => void
  onGuidePreview?: (target: Record<string, string>) => void
  renderGuideLink?: (target: Record<string, string>, children: ReactNode) => ReactNode
  locale?: Language
  inline?: boolean
}

const labels = {
  da: {
    note: 'Bem\u00e6rk',
    important: 'Vigtigt',
    openDocumentError: 'Kunne ikke \u00e5bne dokumentet. Kontroll\u00e9r adgang og netv\u00e6rksforbindelse, og pr\u00f8v igen i Hub.',
  },
  en: {
    note: 'Note',
    important: 'Important',
    openDocumentError: 'Could not open the document. Check access and your network connection, then try again in Hub.',
  },
  fi: {
    note: 'Huomautus',
    important: 'T\u00e4rke\u00e4',
    openDocumentError: 'Asiakirjaa ei voitu avata. Tarkista k\u00e4ytt\u00f6oikeudet ja verkkoyhteys ja yrit\u00e4 uudelleen Hubissa.',
  },
  sv: {
    note: 'Notering',
    important: 'Viktigt',
    openDocumentError: 'Det gick inte att öppna dokumentet. Kontrollera behörighet och nätverksanslutning och försök igen i Hub.',
  },
}

const linkClassName = 'text-primary underline underline-offset-2 hover:text-primary/80 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:text-muted-foreground'

async function openDocumentPath(href: string, errorLabel: string) {
  try {
    if (typeof window === 'undefined' || !window.electronShell?.openPath) throw new Error('DOCUMENT_SHELL_UNAVAILABLE')
    await window.electronShell.openPath(href)
  } catch {
    toast.error(errorLabel)
  }
}

function GuideRichTextContent({ step, onGuideLink, onGuidePreview, renderGuideLink, locale, inline = false }: GuideRichTextProps & { locale: Language }) {
  const localized = labels[locale]

  function renderText(node: GuideRichNode): ReactNode {
    const link = node.marks?.find(mark => mark.type === 'link' || mark.type === 'documentLink' || mark.type === 'guideLink')
    let content: ReactNode = link ? node.text : linkifyText(node.text || '')
    for (const mark of node.marks || []) {
      switch (mark.type) {
        case 'bold':
          content = <strong>{content}</strong>
          break
        case 'italic':
          content = <em>{content}</em>
          break
        case 'underline':
          content = <u>{content}</u>
          break
        case 'textStyle':
          content = <span style={{ color: mark.attrs?.color, fontSize: mark.attrs?.fontSize }}>{content}</span>
          break
      }
    }

    if (!link?.attrs) return content
    if (link.type === 'guideLink') {
      const target = link.attrs
      if (renderGuideLink) return renderGuideLink({ ...target }, content)
      return (
        <button
          type="button"
          className={linkClassName}
          disabled={!onGuideLink && !onGuidePreview}
          onClick={() => onGuideLink?.({ ...target })}
          onMouseEnter={onGuidePreview ? () => onGuidePreview({ ...target }) : undefined}
          onFocus={onGuidePreview ? () => onGuidePreview({ ...target }) : undefined}
        >
          {content}
        </button>
      )
    }

    const href = link.attrs.href
    if (link.type === 'documentLink' && href.startsWith('\\\\')) {
      return (
        <button
          type="button"
          className={linkClassName}
          title={href}
          onClick={() => { void openDocumentPath(href, localized.openDocumentError) }}
        >
          {content}
        </button>
      )
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>{content}</a>
  }

  function renderNode(node: GuideRichNode, key: number): ReactNode {
    if (node.type === 'hardBreak') return <br key={key} />
    if (node.type === 'text') return <Fragment key={key}>{renderText(node)}</Fragment>
    const children = node.content?.map(renderNode)
    if (node.type === 'paragraph') {
      const Paragraph = inline ? 'span' : 'p'
      return <Paragraph key={key} className="m-0">{children?.length ? children : <br />}</Paragraph>
    }
    if (node.type === 'note') {
      const important = node.attrs?.kind === 'important'
      const label = important ? localized.important : localized.note
      const Icon = important ? WarningCircle : Info
      const NoteContainer = inline ? 'span' : 'aside'
      const NoteLabel = inline ? 'span' : 'div'
      return (
        <NoteContainer
          key={key}
          role="note"
          aria-label={label}
          className={`my-3 border-l-2 pl-3 ${important ? 'border-amber-600 dark:border-amber-400' : 'border-primary'}`}
        >
          <NoteLabel className={inline ? 'inline-flex items-center gap-2 font-semibold' : 'mb-1 flex items-center gap-2 font-semibold'}>
            <Icon size={18} className="shrink-0" aria-hidden="true" focusable="false" />
            <span>{label}</span>
          </NoteLabel>
          {inline && ' '}
          {inline ? node.content?.map((child, index) => <Fragment key={index}>{index > 0 && <br />}{renderNode(child, index)}</Fragment>) : children}
        </NoteContainer>
      )
    }
    return children
  }

  const Container = inline ? 'span' : 'div'
  return (
    <Container className={inline ? 'whitespace-pre-wrap break-words' : 'min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed'}
      style={{ fontFamily: inline ? 'inherit' : 'Calibri, sans-serif' }}>
      {getStepDocument(step).content?.map((node, index) => <Fragment key={index}>{inline && index > 0 && <br />}{renderNode(node, index)}</Fragment>)}
    </Container>
  )
}

function ContextGuideRichText(props: GuideRichTextProps) {
  const { language } = useLanguage()
  return <GuideRichTextContent {...props} locale={language} />
}

export function GuideRichText(props: GuideRichTextProps) {
  return props.locale
    ? <GuideRichTextContent {...props} locale={props.locale} />
    : <ContextGuideRichText {...props} />
}