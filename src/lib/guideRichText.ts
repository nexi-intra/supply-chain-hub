export const GUIDE_TEXT_COLORS = ['#1f2937', '#b91c1c', '#166534', '#1d4ed8', '#92400e'] as const
export const GUIDE_TEXT_SIZES = ['12px', '14px', '16px', '18px', '20px'] as const

export interface GuideRichMark {
  type: 'bold' | 'italic' | 'underline' | 'textStyle' | 'link' | 'guideLink' | 'documentLink'
  attrs?: Record<string, string>
}

export interface GuideRichNode {
  type: 'doc' | 'paragraph' | 'text' | 'hardBreak' | 'note'
  text?: string
  attrs?: Record<string, string>
  marks?: GuideRichMark[]
  content?: GuideRichNode[]
}

export interface GuideRichContent {
  version: 1
  text: string
  document: GuideRichNode
}

const invalidContent = () => new Error('INVALID_GUIDE_RICH_CONTENT')

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidContent()
  return value as Record<string, unknown>
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw invalidContent()
  return value
}

function isHttpsTarget(value: string): boolean {
  if (value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return false
  try {
    const url = new URL(value)
    const targets = [url.pathname, ...url.searchParams.values()]
    const executable = /\.(exe|com|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|hta|msi|msp|mst|lnk|scr|dll|cpl|wsf|wsh|sct|reg|inf|application|appref-ms|gadget|url|chm|jar)(?:$|[?#])/i
    const safeTarget = (target: string) => {
      for (let pass = 0; pass < 3; pass++) {
        if (executable.test(target.trim())) return false
        const decoded = target.replace(/(?:%[0-9a-f]{2})+/gi, encoded => decodeURIComponent(encoded))
        if (decoded === target) return true
        target = decoded
      }
      return !executable.test(target.trim()) && !/%[0-9a-f]{2}/i.test(target)
    }
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && targets.every(safeTarget)
  } catch {
    return false
  }
}

export function isAllowedDocumentTarget(value: string): boolean {
  if (isHttpsTarget(value)) return true
  return value.length <= 2048
    && /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+\\.+\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(value)
    && !/[\u0000-\u001f\u007f/:*?"<>|]/.test(value)
    && value.slice(2).split('\\').every(segment => !!segment && !/[. ]$/.test(segment)
      && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment))
}

function parseMark(value: unknown): GuideRichMark {
  const mark = record(value)
  if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline') return { type: mark.type }
  const attrs = record(mark.attrs)
  if (mark.type === 'textStyle') {
    const accepted: Record<string, string> = {}
    if (attrs.color != null) {
      if (typeof attrs.color !== 'string' || !GUIDE_TEXT_COLORS.some(color => color === (attrs.color as string).toLowerCase())) throw invalidContent()
      accepted.color = attrs.color.toLowerCase()
    }
    if (attrs.fontSize != null) {
      if (typeof attrs.fontSize !== 'string' || !GUIDE_TEXT_SIZES.some(size => size === attrs.fontSize)) throw invalidContent()
      accepted.fontSize = attrs.fontSize
    }
    return { type: 'textStyle', attrs: accepted }
  }
  if (mark.type === 'link' || mark.type === 'documentLink') {
    if (typeof attrs.href !== 'string' || !(mark.type === 'link' ? isHttpsTarget(attrs.href) : isAllowedDocumentTarget(attrs.href))) throw invalidContent()
    return { type: mark.type, attrs: { href: attrs.href } }
  }
  if (mark.type === 'guideLink') {
    if (attrs.scope !== 'team' && attrs.scope !== 'shared') throw invalidContent()
    const accepted: Record<string, string> = { guideId: identifier(attrs.guideId), scope: attrs.scope }
    if (attrs.scope === 'team') accepted.teamCode = identifier(attrs.teamCode)
    if (attrs.sectionId != null) accepted.sectionId = identifier(attrs.sectionId)
    if (attrs.stepId != null) {
      if (!accepted.sectionId) throw invalidContent()
      accepted.stepId = identifier(attrs.stepId)
    }
    return { type: 'guideLink', attrs: accepted }
  }
  throw invalidContent()
}

function parseMarks(value: unknown): GuideRichMark[] {
  if (!Array.isArray(value) || value.length > 7) throw invalidContent()
  const marks = value.map(parseMark)
  if (new Set(marks.map(mark => mark.type)).size !== marks.length) throw invalidContent()
  if (marks.filter(mark => ['link', 'documentLink', 'guideLink'].includes(mark.type)).length > 1) throw invalidContent()
  return marks
}

function validateDocument(value: unknown): GuideRichNode {
  let nodeCount = 0
  let textLength = 0
  const visit = (input: unknown, depth: number, parent?: string): GuideRichNode => {
    if (++nodeCount > 5000 || depth > 12) throw invalidContent()
    const node = record(input)
    const type = node.type
    if (type !== 'doc' && type !== 'paragraph' && type !== 'text' && type !== 'hardBreak' && type !== 'note') throw invalidContent()
    if (!parent && type !== 'doc') throw invalidContent()
    if (parent === 'doc' && type !== 'paragraph' && type !== 'note') throw invalidContent()
    if (parent === 'note' && type !== 'paragraph') throw invalidContent()
    if (parent === 'paragraph' && type !== 'text' && type !== 'hardBreak') throw invalidContent()
    const accepted: GuideRichNode = { type }
    if (type === 'text') {
      if (typeof node.text !== 'string' || !node.text || node.content != null) throw invalidContent()
      textLength += node.text.length
      if (textLength > 200000) throw invalidContent()
      accepted.text = node.text
      if (node.marks != null) accepted.marks = parseMarks(node.marks)
    } else if (type === 'hardBreak') {
      if (node.content != null || node.text != null) throw invalidContent()
      if (node.marks != null) accepted.marks = parseMarks(node.marks)
    } else {
      if (node.text != null || node.marks != null) throw invalidContent()
      if (type === 'note') {
        const attrs = record(node.attrs)
        if (attrs.kind !== 'note' && attrs.kind !== 'important') throw invalidContent()
        accepted.attrs = { kind: attrs.kind }
      }
      if (node.content != null) {
        if (!Array.isArray(node.content) || node.content.length > 5000) throw invalidContent()
        accepted.content = node.content.map(child => visit(child, depth + 1, type))
      }
      if ((type === 'doc' || type === 'note') && !accepted.content?.length) {
        if (++nodeCount > 5000) throw invalidContent()
        accepted.content = [{ type: 'paragraph' }]
      }
    }
    return accepted
  }
  return visit(value, 0)
}

export function plainTextDocument(text: string): GuideRichNode {
  return {
    type: 'doc',
    content: text.split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })),
  }
}

export function richDocumentText(document: GuideRichNode): string {
  if (document.type === 'text') return document.text || ''
  if (document.type === 'hardBreak') return '\n'
  return (document.content || []).map(richDocumentText).join(document.type === 'doc' || document.type === 'note' ? '\n' : '')
}

export function createRichContent(document: unknown): GuideRichContent {
  const validated = validateDocument(document)
  return { version: 1, text: richDocumentText(validated), document: validated }
}

function currentStepContent(step: { text: string; richContent?: unknown }): GuideRichContent | undefined {
  try {
    const content = record(step.richContent)
    if (content.version !== 1 || content.text !== step.text) return undefined
    const validated = createRichContent(content.document)
    return validated.text === step.text ? validated : undefined
  } catch {
    return undefined
  }
}

export function getStepDocument(step: { text: string; richContent?: unknown }): GuideRichNode {
  return currentStepContent(step)?.document || plainTextDocument(step.text)
}

export function prepareStepContent(step: { text: string; richContent?: unknown }): { text: string; richContent?: GuideRichContent } {
  const richContent = currentStepContent(step)
  return { text: richContent?.text ?? step.text.trim(), richContent }
}

export function prepareSectionHeading(section: { heading: string; headingRichContent?: unknown }): { heading: string; headingRichContent?: GuideRichContent } {
  const prepared = prepareStepContent({ text: section.heading, richContent: section.headingRichContent })
  return { heading: prepared.text, headingRichContent: prepared.richContent }
}