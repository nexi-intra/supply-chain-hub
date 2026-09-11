import type { ReactNode } from 'react'

// Genkender: http(s)-URLs, "www."-praefiksede domaener, UNC-stier (\\server\share\...) og
// Windows-drev-stier (C:\..., M:\...). Ét samlet regex med alternation, saa vi kan splitte
// teksten i ét hug og bevare raekkefoelgen mellem almindelig tekst og links.
const LINK_PATTERN = /(https?:\/\/[^\s<>"')]+)|(www\.[^\s<>"')]+)|(\\\\[^\s<>"']+)|([A-Za-z]:\\[^\s<>"']+)/g

function isFilePath(match: string): boolean {
  return match.startsWith('\\\\') || /^[A-Za-z]:\\/.test(match)
}

/** Fjerner afsluttende tegnsaetning (. , ; : ! ?) der oftest hoerer til saetningen, ikke selve linket. */
function trimTrailingPunctuation(match: string): { url: string; trailing: string } {
  const trailingMatch = match.match(/[.,;:!?]+$/)
  if (!trailingMatch) return { url: match, trailing: '' }
  return { url: match.slice(0, -trailingMatch[0].length), trailing: trailingMatch[0] }
}

/**
 * Splitter en tekststreng i almindelig tekst og klikbare links/stier, til brug i guide preview.
 * Websites aabnes via en normal `<a target="_blank">` (Electrons setWindowOpenHandler sender dem
 * videre til shell.openExternal). Fil/mappe-stier har ingen navigerbar URI-scheme og aabnes derfor
 * via window.electronShell.openPath (se electron/main.cjs "shell:open-path").
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let matchIndex = 0

  for (const match of text.matchAll(LINK_PATTERN)) {
    const raw = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

    const { url, trailing } = trimTrailingPunctuation(raw)
    const key = `link-${matchIndex++}`

    if (isFilePath(url)) {
      nodes.push(
        <button
          key={key}
          type="button"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
          onClick={() => window.electronShell?.openPath(url)}
          title={url}
        >
          {url}
        </button>
      )
    } else {
      const href = url.startsWith('www.') ? `https://${url}` : url
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {url}
        </a>
      )
    }
    if (trailing) nodes.push(trailing)

    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
