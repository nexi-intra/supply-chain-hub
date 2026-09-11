// Simpel, DOM-baseret HTML-sanitisering (samme teknik som docxImporter.ts's DOMParser-walker) —
// bruges når vi renderer mammoth.js's docx->HTML-output direkte via dangerouslySetInnerHTML
// (GuideViewer.tsx's "Original formatering"-visning). mammoth genererer selv ikke <script>/event-
// handlere, men vi fjerner dem alligevel som et ekstra lag, i tilfælde af usædvanlige/manipulerede
// dokumenter (fx et hyperlink-felt med et javascript:-target).
const DANGEROUS_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM'])

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (DANGEROUS_TAGS.has(child.tagName)) {
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim().toLowerCase()
        const isJsUri = (name === 'href' || name === 'src') && value.startsWith('javascript:')
        if (name.startsWith('on') || isJsUri) {
          child.removeAttribute(attr.name)
        }
      }
      walk(child)
    }
  }

  walk(doc.body)
  return doc.body.innerHTML
}
