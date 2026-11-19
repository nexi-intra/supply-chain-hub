// Nisselegen – what the renderer gets from the judge in main (electron/nisse.cjs). The schedule lives only in main.

export interface NisseFinder { name: string; email: string; at: string }

export type NisseToday =
  | { status: 'off' }
  | { status: 'waiting'; date: string; startsAt: number }
  | { status: 'hiding'; date: string; spot: string }
  | { status: 'found'; date: string; finder: NisseFinder }

export type NisseClaimResult =
  | { result: 'won'; at: string }
  | { result: 'taken'; finder: NisseFinder }
  | { result: 'preview' }

export interface NisseFind { teamId: string; teamName: string; date: string; email: string; name: string; at: string }

export interface NisseApi {
  today: (preview?: string | null) => Promise<NisseToday>
  claim: (input: { date: string; spot: string; preview?: string | null }) => Promise<NisseClaimResult>
  finds: () => Promise<NisseFind[]>
  onChanged: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronNisse?: NisseApi
  }
}

/** "10:42" in Danish time – the time the hunt is measured in for everyone. */
export function danishTime(iso: string): string {
  return new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace('.', ':')
}
