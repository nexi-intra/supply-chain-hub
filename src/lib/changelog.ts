// Kort, brugervendt "hvad er nyt"-liste pr. version — vises én gang pr. maskine
// efter en opdatering (se WhatsNewDialog.tsx). Hold posterne korte og konkrete.

export interface ChangelogEntry {
  version: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.4.2',
    items: [
      'Notifikationscenter på forsiden samler emails, ferieanmodninger, guide-revisioner og fødselsdage ét sted',
      'Opslagstavle til firmameddelelser øverst på forsiden',
      '"Siden sidst"-oversigt når du logger ind efter en pause',
      'Email-tråde: svar samles nu i én samtale i stedet for separate beskeder',
      'Ferieanmodnings-mails har en knap der fører direkte til Manager Panelets ferieanmodninger',
      'Notesbogen understøtter tags og fastgørelse af vigtige noter',
      'Manager Panel: bulk-godkendelse af ferieanmodninger, sygefraværs-mønstre og guidet on-/offboarding',
      'Hurtigere opstart og mere jævne spil i Spilhjørnet',
    ],
  },
  {
    version: '1.4.1',
    items: [
      'Guide Bibliotek 2.0: sektioner/trin, versionshistorik og automatiske revisions-påmindelser',
      'Rettet Escape-tasten så den altid navigerer ét skridt tilbage i stedet for til forsiden',
      'Brugernavn kan nu bruges til login sammen med email',
    ],
  },
  {
    version: '1.4.0',
    items: [
      'Nyt automatisk opdateringssystem — appen opdaterer sig selv i baggrunden',
      'Manager Panel kan udrulle bestemte versioner til udvalgte medarbejdere',
    ],
  },
]

/** Alle changelog-punkter for versioner NYERE end lastSeenVersion (eller kun nyeste, hvis lastSeenVersion er ukendt). */
export function getChangelogSince(lastSeenVersion: string | null, currentVersion: string): ChangelogEntry[] {
  if (!lastSeenVersion) {
    const currentEntry = CHANGELOG.find(e => e.version === currentVersion)
    return currentEntry ? [currentEntry] : []
  }
  const compare = (a: string, b: string) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0)
      if (diff !== 0) return diff
    }
    return 0
  }
  return CHANGELOG.filter(e => compare(e.version, lastSeenVersion) > 0 && compare(e.version, currentVersion) <= 0)
}
