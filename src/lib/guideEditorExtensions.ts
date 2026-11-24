import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { createRichContent, GUIDE_TEXT_COLORS, GUIDE_TEXT_SIZES } from './guideRichText'

export type GuideLinkKind = 'link' | 'documentLink' | 'guideLink'

export function normalizeGuideColor(value: string): string | null {
  let color = value.trim().toLowerCase()
  const rgb = /^rgb\(\s*(\d+)\s*(?:,\s*|\s+)(\d+)\s*(?:,\s*|\s+)(\d+)\s*\)$/.exec(color)
  if (rgb) {
    const channels = rgb.slice(1).map(Number)
    if (channels.some(channel => channel > 255)) return null
    color = `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
  }
  return GUIDE_TEXT_COLORS.some(allowed => allowed === color) ? color : null
}

export function normalizeGuideFontSize(value: string): string | null {
  const size = value.trim()
  return GUIDE_TEXT_SIZES.some(allowed => allowed === size) ? size : null
}

export function validateGuideLink(kind: GuideLinkKind, attrs: Record<string, unknown>): Record<string, string> | null {
  try {
    const validated = createRichContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: kind, attrs }] }] }] })
    return validated.document.content?.[0].content?.[0].marks?.[0].attrs || null
  } catch {
    return null
  }
}

const GuideTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: element => normalizeGuideColor(element.style.color),
        renderHTML: attrs => {
          const color = typeof attrs.color === 'string' ? normalizeGuideColor(attrs.color) : null
          return color ? { style: `color: ${color}` } : {}
        },
      },
      fontSize: {
        default: null,
        parseHTML: element => normalizeGuideFontSize(element.style.fontSize),
        renderHTML: attrs => {
          const fontSize = typeof attrs.fontSize === 'string' ? normalizeGuideFontSize(attrs.fontSize) : null
          return fontSize ? { style: `font-size: ${fontSize}` } : {}
        },
      },
    }
  },
})

function guideLinkMark(kind: GuideLinkKind) {
  const attributeNames = kind === 'guideLink' ? ['guideId', 'scope', 'teamCode', 'sectionId', 'stepId'] : ['href']
  const htmlAttribute = (name: string) => name === 'href' ? 'href' : `data-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
  const readAttributes = (element: HTMLElement) => Object.fromEntries(attributeNames.map(name => [name, element.getAttribute(htmlAttribute(name))]))

  return Mark.create({
    name: kind,
    inclusive: false,
    excludes: 'link documentLink guideLink',
    addAttributes() {
      return Object.fromEntries(attributeNames.map(name => [name, {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(htmlAttribute(name)),
        rendered: false,
      }]))
    },
    parseHTML() {
      const tag = kind === 'guideLink' ? 'span[data-guide-link]' : kind === 'documentLink' ? 'a[data-document-link]' : 'a[href]:not([data-document-link])'
      return [{ tag, getAttrs: element => validateGuideLink(kind, readAttributes(element)) || false }]
    },
    renderHTML({ mark }) {
      const attrs = validateGuideLink(kind, mark.attrs)
      const attributes = attrs ? Object.fromEntries(Object.entries(attrs).map(([name, value]) => [htmlAttribute(name), value])) : {}
      return [kind === 'guideLink' ? 'span' : 'a', mergeAttributes(attributes, {
        ...(kind === 'guideLink' ? { 'data-guide-link': '' } : kind === 'documentLink' ? { 'data-document-link': '' } : {}),
        class: 'underline decoration-dotted cursor-text',
      }), 0]
    },
  })
}

const GuideNote = Node.create({
  name: 'note',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: element => element.getAttribute('data-guide-note') === 'important' ? 'important' : 'note',
        rendered: false,
      },
    }
  },
  parseHTML() {
    return [{ tag: 'aside[data-guide-note]', getAttrs: element => ['note', 'important'].includes(element.getAttribute('data-guide-note') || '') ? {} : false }]
  },
  renderHTML({ node }) {
    return ['aside', {
      'data-guide-note': node.attrs.kind,
      class: `my-2 border-l-2 pl-3 py-1 ${node.attrs.kind === 'important' ? 'border-amber-600 bg-amber-50 text-gray-900' : 'border-blue-600 bg-blue-50 text-gray-900'}`,
    }, 0]
  },
})

export function createGuideEditorExtensions(onInvalidContent?: () => void) {
  const validation = Extension.create({
    name: 'guideContentValidation',
    addProseMirrorPlugins() {
      return [new Plugin({
        filterTransaction(transaction) {
          if (!transaction.docChanged) return true
          try {
            createRichContent(transaction.doc.toJSON())
            return true
          } catch {
            onInvalidContent?.()
            return false
          }
        },
      })]
    },
  })

  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
    }),
    GuideTextStyle,
    GuideNote,
    guideLinkMark('link'),
    guideLinkMark('documentLink'),
    guideLinkMark('guideLink'),
    validation,
  ]
}