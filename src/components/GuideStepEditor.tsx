import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { TextSelection, type SelectionBookmark } from '@tiptap/pm/state'
import {
  ArrowClockwise, ArrowCounterClockwise, Check, Eraser, Link, LinkBreak,
  Note, Palette, TextB, TextItalic, TextUnderline, WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLibraryLanguage } from '@/contexts/LibraryContext'
import { createGuideEditorExtensions, validateGuideLink, type GuideLinkKind } from '@/lib/guideEditorExtensions'
import { createRichContent, getStepDocument, GUIDE_TEXT_COLORS, GUIDE_TEXT_SIZES, type GuideRichContent, type GuideRichNode } from '@/lib/guideRichText'
import { GUIDE_RICH_TEXT_LABELS } from '@/lib/guideRichTextLabels'
import type { Guide, GuideStep } from '@/lib/guideTypes'
import { GuideRichText } from '@/components/GuideRichText'

export interface GuideLinkOption {
  guide: Guide
  scope: 'team' | 'shared'
  teamCode?: string
}

export interface GuideStepEditorProps {
  step: GuideStep
  onChange: (richContent: GuideRichContent) => void
  linkTargets: GuideLinkOption[]
  disabled?: boolean
  active?: boolean
  onActivate?: () => void
  label?: string
  placeholder?: string
  variant?: 'heading' | 'step'
}

const LINK_KINDS: GuideLinkKind[] = ['guideLink', 'documentLink', 'link']
const DEFAULT = '@default'
const targetKey = (attrs: { guideId: string; scope: string; teamCode?: string }) => JSON.stringify([attrs.scope, attrs.scope === 'team' ? attrs.teamCode : '', attrs.guideId])
const optionAttributes = (option: GuideLinkOption) => ({ guideId: option.guide.id, scope: option.scope, ...(option.scope === 'team' ? { teamCode: option.teamCode } : {}) })

function ToolButton({ label, active, disabled, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <Button type="button" variant={active ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 shrink-0"
      title={label} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={event => event.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  )
}

export function GuideStepEditor(props: GuideStepEditorProps) {
  const { language, t } = useLibraryLanguage()
  const variant = props.variant || 'step'
  const label = props.label || GUIDE_RICH_TEXT_LABELS[language][variant === 'heading' ? 'heading' : 'editor']
  const placeholder = props.placeholder || (variant === 'heading' ? t.guideEditor.sectionHeadingPlaceholder : t.guideEditor.stepPlaceholder)
  return (
    <div data-guide-field={variant} className="min-w-0 space-y-1.5">
      <p className="text-xs font-semibold text-foreground/80">{label}</p>
      {props.active === false ? (
        <div role="textbox" tabIndex={props.disabled ? -1 : 0} aria-label={label}
          aria-multiline="true" aria-readonly={props.disabled || undefined}
          onFocus={props.onActivate} onClick={props.onActivate}
          className={`cursor-text rounded-md border border-input bg-background px-3 py-2.5 text-foreground transition-colors hover:border-ring/50 focus-visible:outline-2 focus-visible:outline-ring ${variant === 'heading' ? 'min-h-11 text-base' : 'min-h-20'}`}>
          <div className="pointer-events-none">
            {props.step.text.trim()
              ? <GuideRichText step={props.step} locale={language} inline={variant === 'heading'} />
              : <span data-guide-placeholder className="text-sm font-normal text-muted-foreground">{placeholder}</span>}
          </div>
        </div>
      ) : <StepRichEditor key={props.step.id} {...props} label={label} placeholder={placeholder} variant={variant} />}
    </div>
  )
}

function StepRichEditor({ step, onChange, linkTargets, disabled = false, label, placeholder, variant = 'step' }: GuideStepEditorProps) {
  const { language } = useLibraryLanguage()
  const labels = GUIDE_RICH_TEXT_LABELS[language]
  const fieldId = useId()
  const [invalidContent, setInvalidContent] = useState(false)
  const [initialDocument] = useState(() => getStepDocument(step))
  const lastValidDocument = useRef(initialDocument)
  const selection = useRef<SelectionBookmark | null>(null)
  const [extensions] = useState(() => createGuideEditorExtensions(() => setInvalidContent(true)))
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkKind, setLinkKind] = useState<GuideLinkKind>('guideLink')
  const [guideKey, setGuideKey] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [stepId, setStepId] = useState('')
  const [address, setAddress] = useState('')
  const [savedGuide, setSavedGuide] = useState<Record<string, string> | null>(null)
  const [linkError, setLinkError] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)

  const editor = useEditor({
    extensions,
    content: initialDocument,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !disabled,
    autofocus: false,
    onCreate: ({ editor: createdEditor }) => {
      if (disabled) return
      createdEditor.view.dispatch(createdEditor.state.tr.setSelection(TextSelection.atEnd(createdEditor.state.doc)))
      createdEditor.view.focus()
    },
    editorProps: {
      attributes: {
        role: 'textbox', 'aria-label': label || labels.editor, 'aria-multiline': 'true', 'aria-readonly': String(disabled),
        class: `${variant === 'heading' ? 'min-h-11 text-base' : 'min-h-24 text-sm'} max-h-96 overflow-y-auto px-3 py-2.5 leading-relaxed outline-none break-words [overflow-wrap:anywhere] [&_p]:min-h-[1.5em] [&_p+p]:mt-1`,
      },
      handleClick: (_view, _position, event) => {
        if ((event.target as HTMLElement).closest('a')) { event.preventDefault(); return true }
        return false
      },
      handleKeyDown: (view, event) => {
        if (!event.ctrlKey || event.altKey || event.metaKey || (event.key !== 'Home' && event.key !== 'End')) return false
        const boundary = event.key === 'Home' ? TextSelection.atStart(view.state.doc) : TextSelection.atEnd(view.state.doc)
        const selected = event.shiftKey ? TextSelection.create(view.state.doc, view.state.selection.anchor, boundary.head) : boundary
        view.dispatch(view.state.tr.setSelection(selected).scrollIntoView())
        return true
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      let content: GuideRichContent
      try {
        content = createRichContent(updatedEditor.getJSON())
      } catch {
        setInvalidContent(true)
        updatedEditor.commands.setContent(lastValidDocument.current, { emitUpdate: false })
        return
      }
      lastValidDocument.current = content.document
      setInvalidContent(false)
      onChange(content)
    },
  })

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
      color: current.getAttributes('textStyle').color as string | null,
      fontSize: current.getAttributes('textStyle').fontSize as string | null,
      note: current.isActive('note', { kind: 'note' }), important: current.isActive('note', { kind: 'important' }),
      link: LINK_KINDS.find(kind => current.isActive(kind)),
      empty: current.state.selection.empty,
      contentEmpty: current.isEmpty,
      undo: current.can().undo(), redo: current.can().redo(),
    } : null,
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled, false)
    if (disabled) { setLinkOpen(false); setColorOpen(false) }
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    let incoming: GuideRichNode
    let current: GuideRichNode | null
    try {
      incoming = createRichContent(getStepDocument(step)).document
    } catch {
      setInvalidContent(true)
      return
    }
    try {
      current = createRichContent(editor.getJSON()).document
    } catch {
      current = null
    }
    if (JSON.stringify(incoming) === JSON.stringify(current)) return
    lastValidDocument.current = incoming
    selection.current = null
    setLinkOpen(false)
    setColorOpen(false)
    setInvalidContent(false)
    editor.chain().setMeta('addToHistory', false).setContent(incoming, { emitUpdate: false }).run()
  }, [editor, step.text, step.richContent])

  const captureSelection = () => { if (editor) selection.current = editor.state.selection.getBookmark() }
  const selectedChain = () => {
    if (!editor || disabled) return null
    try {
      const selected = (selection.current || editor.state.selection.getBookmark()).resolve(editor.state.doc)
      return editor.chain().focus().setTextSelection({ from: selected.from, to: selected.to })
    } catch {
      return null
    }
  }
  const closeLink = () => { setLinkOpen(false); setLinkError(false) }
  const openLink = () => {
    if (!editor || disabled) return
    const kind = LINK_KINDS.find(candidate => editor.isActive(candidate))
    if (kind && editor.state.selection.empty) editor.commands.extendMarkRange(kind)
    captureSelection()
    const attrs = kind ? validateGuideLink(kind, editor.getAttributes(kind)) : null
    setLinkKind(kind || 'guideLink')
    setSavedGuide(kind === 'guideLink' ? attrs : null)
    setGuideKey(attrs?.guideId ? targetKey({ guideId: attrs.guideId, scope: attrs.scope, teamCode: attrs.teamCode }) : '')
    setSectionId(attrs?.sectionId || '')
    setStepId(attrs?.stepId || '')
    setAddress(attrs?.href || '')
    setLinkError(false)
    setLinkOpen(true)
  }

  const target = linkTargets.find(option => targetKey(optionAttributes(option)) === guideKey)
  const sections = target?.guide.sections || []
  const steps = sections.find(section => section.id === sectionId)?.steps || []
  const hasSavedTarget = !!savedGuide && targetKey({ guideId: savedGuide.guideId, scope: savedGuide.scope, teamCode: savedGuide.teamCode }) === guideKey
  const candidate = linkKind === 'guideLink' ? validateGuideLink('guideLink', {
    ...(target ? optionAttributes(target) : hasSavedTarget ? savedGuide : {}),
    sectionId: sectionId || undefined, stepId: sectionId && stepId ? stepId : undefined,
  }) : validateGuideLink(linkKind, { href: address.trim() })

  const removeLinks = () => {
    const chain = selectedChain()
    if (!chain) return
    chain.unsetMark('guideLink', { extendEmptyMarkRange: true }).unsetMark('documentLink', { extendEmptyMarkRange: true })
      .unsetMark('link', { extendEmptyMarkRange: true }).run()
    closeLink()
  }
  const applyLink = () => {
    const chain = selectedChain()
    if (!candidate || !chain) { setLinkError(true); return }
    chain.unsetMark('guideLink').unsetMark('documentLink').unsetMark('link').setMark(linkKind, candidate).run()
    closeLink()
  }
  const toggleNote = (kind: 'note' | 'important') => {
    if (!editor || disabled) return
    if (editor.isActive('note') && !editor.isActive('note', { kind })) editor.chain().focus().updateAttributes('note', { kind }).run()
    else editor.chain().focus().toggleWrap('note', { kind }).run()
  }
  const unavailable = disabled || !editor

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-ring/60 bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
      <div role="toolbar" aria-label={labels.formatting} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
        <ToolButton label={labels.bold} active={toolbar?.bold} disabled={unavailable} onClick={() => editor?.chain().focus().toggleBold().run()}><TextB size={16} /></ToolButton>
        <ToolButton label={labels.italic} active={toolbar?.italic} disabled={unavailable} onClick={() => editor?.chain().focus().toggleItalic().run()}><TextItalic size={16} /></ToolButton>
        <ToolButton label={labels.underline} active={toolbar?.underline} disabled={unavailable} onClick={() => editor?.chain().focus().toggleUnderline().run()}><TextUnderline size={16} /></ToolButton>
        <Popover open={colorOpen} onOpenChange={open => { if (open) captureSelection(); setColorOpen(open) }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={unavailable} title={labels.color} aria-label={labels.color}>
              <Palette size={16} style={{ color: toolbar?.color || undefined }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-2" onCloseAutoFocus={event => event.preventDefault()}>
            <div className="flex flex-wrap gap-1">
              {GUIDE_TEXT_COLORS.map((color, index) => (
                <button key={color} type="button" title={labels.colors[index]} aria-label={labels.colors[index]}
                  aria-pressed={toolbar?.color === color} disabled={disabled}
                  className="flex h-8 w-8 items-center justify-center rounded border border-border text-white focus-visible:outline-2 focus-visible:outline-ring"
                  style={{ backgroundColor: color }} onClick={() => { selectedChain()?.setMark('textStyle', { color }).run(); setColorOpen(false) }}>
                  {toolbar?.color === color && <Check size={16} />}
                </button>
              ))}
              <ToolButton label={labels.defaultStyle} disabled={disabled} onClick={() => { selectedChain()?.setMark('textStyle', { color: null }).removeEmptyTextStyle().run(); setColorOpen(false) }}><Eraser size={16} /></ToolButton>
            </div>
          </PopoverContent>
        </Popover>
        <Select value={toolbar?.fontSize || DEFAULT} disabled={unavailable} onValueChange={value => {
          selectedChain()?.setMark('textStyle', { fontSize: value === DEFAULT ? null : value }).removeEmptyTextStyle().run()
        }}>
          <SelectTrigger className="h-8 w-28 text-xs" title={labels.size} aria-label={labels.size} onPointerDown={captureSelection} onKeyDown={captureSelection}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={DEFAULT}>{labels.defaultStyle}</SelectItem>{GUIDE_TEXT_SIZES.map(size => <SelectItem key={size} value={size}>{size}</SelectItem>)}</SelectContent>
        </Select>
        <ToolButton label={labels.clearFormatting} disabled={unavailable} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={16} /></ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 border-l border-border" />
        <ToolButton label={labels.link} active={!!toolbar?.link} disabled={unavailable || (!!toolbar?.empty && !toolbar?.link)} onClick={openLink}><Link size={16} /></ToolButton>
        <ToolButton label={labels.removeLink} disabled={unavailable || !toolbar?.link} onClick={() => { captureSelection(); removeLinks() }}><LinkBreak size={16} /></ToolButton>
        <ToolButton label={labels.note} active={toolbar?.note} disabled={unavailable} onClick={() => toggleNote('note')}><Note size={16} /></ToolButton>
        <ToolButton label={labels.important} active={toolbar?.important} disabled={unavailable} onClick={() => toggleNote('important')}><WarningCircle size={16} /></ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 border-l border-border" />
        <ToolButton label={labels.undo} disabled={unavailable || !toolbar?.undo} onClick={() => editor?.chain().focus().undo().run()}><ArrowCounterClockwise size={16} /></ToolButton>
        <ToolButton label={labels.redo} disabled={unavailable || !toolbar?.redo} onClick={() => editor?.chain().focus().redo().run()}><ArrowClockwise size={16} /></ToolButton>
      </div>
      <div className="relative">
        <EditorContent editor={editor} className={`bg-background text-foreground ${disabled ? 'opacity-60' : ''}`} />
        {toolbar?.contentEmpty && <span data-guide-placeholder aria-hidden="true"
          className="pointer-events-none absolute left-3 right-3 top-2.5 text-sm font-normal text-muted-foreground">{placeholder}</span>}
      </div>
      {invalidContent && <p role="alert" className="px-3 py-2 text-sm text-destructive">{labels.invalidContent}</p>}
      <Dialog open={linkOpen} onOpenChange={open => { if (!open) closeLink() }}>
        <DialogContent aria-describedby={undefined} className="min-w-0" onCloseAutoFocus={event => { event.preventDefault(); selectedChain()?.run() }}>
          <DialogHeader><DialogTitle>{labels.link}</DialogTitle></DialogHeader>
          <Tabs value={linkKind} onValueChange={value => { setLinkKind(value as GuideLinkKind); setLinkError(false) }} className="min-w-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="guideLink">{labels.guide}</TabsTrigger><TabsTrigger value="documentLink">{labels.documents}</TabsTrigger><TabsTrigger value="link">{labels.web}</TabsTrigger>
            </TabsList>
            <TabsContent value="guideLink" className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-guide`}>{labels.guide}</Label>
                <Select value={guideKey || undefined} disabled={disabled || (!linkTargets.length && !savedGuide)} onValueChange={value => { setGuideKey(value); setSectionId(''); setStepId(''); setLinkError(false) }}>
                  <SelectTrigger id={`${fieldId}-guide`} className="w-full min-w-0 [&>span]:truncate"><SelectValue placeholder={linkTargets.length ? labels.guide : labels.noGuides} /></SelectTrigger>
                  <SelectContent>
                    {linkTargets.map(option => {
                      const attrs = optionAttributes(option)
                      return <SelectItem key={targetKey(attrs)} value={targetKey(attrs)} disabled={!validateGuideLink('guideLink', attrs)}>{option.guide.title} ({option.scope === 'shared' ? labels.shared : option.teamCode})</SelectItem>
                    })}
                    {!target && hasSavedTarget && <SelectItem value={guideKey}>{labels.savedTarget}: {savedGuide?.guideId}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-section`}>{labels.section}</Label>
                <Select value={sectionId || DEFAULT} disabled={disabled || !guideKey} onValueChange={value => { setSectionId(value === DEFAULT ? '' : value); setStepId('') }}>
                  <SelectTrigger id={`${fieldId}-section`} className="w-full min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={DEFAULT}>{labels.wholeGuide}</SelectItem>
                    {sections.map(section => <SelectItem key={section.id} value={section.id}>{section.heading || section.id}</SelectItem>)}
                    {sectionId && !sections.some(section => section.id === sectionId) && <SelectItem value={sectionId}>{labels.savedTarget}: {sectionId}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-step`}>{labels.step}</Label>
                <Select value={stepId || DEFAULT} disabled={disabled || !sectionId} onValueChange={value => setStepId(value === DEFAULT ? '' : value)}>
                  <SelectTrigger id={`${fieldId}-step`} className="w-full min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={DEFAULT}>{labels.wholeSection}</SelectItem>
                    {steps.map((linkedStep, index) => <SelectItem key={linkedStep.id} value={linkedStep.id}>{index + 1}. {linkedStep.text.slice(0, 80)}</SelectItem>)}
                    {stepId && !steps.some(linkedStep => linkedStep.id === stepId) && <SelectItem value={stepId}>{labels.savedTarget}: {stepId}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            {(['documentLink', 'link'] as const).map(kind => (
              <TabsContent key={kind} value={kind} className="space-y-1">
                <Label htmlFor={`${fieldId}-${kind}`}>{labels.address}</Label>
                <Input id={`${fieldId}-${kind}`} value={address} disabled={disabled} maxLength={2048} spellCheck={false}
                  aria-invalid={linkError} aria-describedby={linkError ? `${fieldId}-link-error` : undefined}
                  onChange={event => { setAddress(event.target.value); setLinkError(false) }} />
              </TabsContent>
            ))}
          </Tabs>
          {linkError && <p id={`${fieldId}-link-error`} role="alert" className="text-sm text-destructive">{labels.invalidLink}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" disabled={disabled} onClick={removeLinks}><LinkBreak size={16} />{labels.removeLink}</Button>
            <Button type="button" variant="outline" onClick={closeLink}>{labels.cancel}</Button>
            <Button type="button" disabled={disabled || (linkKind === 'guideLink' && !candidate)} onClick={applyLink}><Check size={16} />{labels.apply}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}