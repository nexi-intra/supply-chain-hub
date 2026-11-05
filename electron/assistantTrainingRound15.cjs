// Round 15 (1.6.3): Hubert's new actions (sick leave, home office, note, message, shared to-do, high-five), short shift-role names,
// the morning briefing, high-fives and emojis in Multiplayer. Same entry shape as BY_LANGUAGE: [persona, question, spec].
// Fixture today: Tuesday 2026-09-15 (tomorrow = Wednesday 16 Sep); the asker is Test User in TCD with Anne Holm, Bo Berg and Clara Dahl.
const PROPOSAL = { mode: 'action-proposal' }
const REFUSE = { mode: 'data', guard: 'destructive', refuse: true }

const ROUND15 = {
  da: [
    ['D', 'meld mig syg i morgen', { ...PROPOSAL, text: /^Meld dig syg i morgen \(onsdag 16\. sep\.\)\? Din leder får automatisk besked\.$/, params: { date: '2026-09-16', type: 'self' } }],
    ['D', 'mit barn er syg i dag', { ...PROPOSAL, text: /^Registrer barn syg i dag \(tirsdag 15\. sep\.\)\?/, params: { date: '2026-09-15', type: 'child' } }],
    ['D', 'kan du sygemelde mig?', { ...PROPOSAL, params: { date: '2026-09-15', type: 'self' } }],
    ['D', 'registrer hjemmearbejde fredag', { ...PROPOSAL, text: /^Registrer hjemmearbejde fredag 18\. sep\.\?$/, params: { date: '2026-09-18' } }],
    ['D', 'jeg arbejder hjemme i morgen', { ...PROPOSAL, params: { date: '2026-09-16' } }],
    ['D', 'registrer hjemmearbejde hver mandag', { mode: 'action-proposal', text: /én hjemmearbejdsdag ad gangen/ }],
    ['D', 'opret en note: bestil nye labels', { ...PROPOSAL, text: /^Opret en personlig note i Notesbog: "Bestil nye labels"\?$/, params: { title: 'Bestil nye labels', content: 'bestil nye labels', isPersonal: true } }],
    ['D', 'opret en delt note: printeren på lageret er flyttet', { ...PROPOSAL, params: { isPersonal: false } }],
    ['D', 'send en besked til Bo: mødet er flyttet til kl. 10', { ...PROPOSAL, text: /^Send en intern besked til Bo Berg: "mødet er flyttet til kl\. 10"\?$/, params: { to: 'bo@test', message: 'mødet er flyttet til kl. 10' } }],
    ['D', 'skriv til Clara om at jeg er forsinket', { ...PROPOSAL, params: { to: 'clara@test', message: 'jeg er forsinket' } }],
    ['D', 'send en besked til Bo', { mode: 'action-proposal', text: /^Hvad skal beskeden til Bo Berg indeholde\?/ }],
    ['D', 'opret en team to-do: ryd op på lageret', { ...PROPOSAL, text: /^Opret en fælles to-do for teamet: "ryd op på lageret"\?$/, params: { title: 'ryd op på lageret' } }],
    ['D', 'opret en to-do: ring til IT', { ...PROPOSAL, params: { title: 'ring til IT' } }],
    ['D', 'send en high-five til Clara for hjælpen', { ...PROPOSAL, text: /^Send en high-five 🙌 til Clara Dahl: "Tak for hjælpen"\?$/, params: { recipientEmail: 'clara@test', emoji: '🙌', message: 'Tak for hjælpen' } }],
    ['D', 'giv Bo en high five 🔥', { ...PROPOSAL, params: { recipientEmail: 'bo@test', emoji: '🔥', message: 'Godt gået!' } }],
    ['E', 'send en besked til alle: mødet er aflyst', { ...REFUSE, text: /kun læse/ }],
    ['E', 'slet alle noter og send en besked til Bo: hej', { ...REFUSE, text: /kun læse/ }],
    ['B', 'hvem er syg i morgen?', { mode: 'data', text: /^Ingen er sygemeldt \(i morgen, onsdag 16\. sep\.\)/, empty: true }],
    ['B', 'hvem er packing i dag?', { mode: 'data', text: /Bo Berg — Packing/, not: /Picking/ }],
    ['B', 'hvem er på picking i morgen?', { mode: 'data', text: /Test User — Picking/ }],
    ['C', 'hvordan sender jeg en high-five?', { mode: 'app-guide', text: /High-fives/ }],
    ['C', 'hvordan sender jeg en emoji til min modstander?', { mode: 'app-guide', text: /"Emoji"/ }],
    ['C', 'godmorgen', { mode: 'data', text: /^Godmorgen Test/ }],
    ['C', 'hvem er du?', { mode: 'data', text: /melde dig syg[\s\S]*high-five/ }],
  ],
  en: [
    ['D', 'report me sick tomorrow', { ...PROPOSAL, text: /^Report yourself sick tomorrow \(Wed 16 Sep\)\? Your manager is notified automatically\.$/, params: { date: '2026-09-16', type: 'self' } }],
    ['D', 'register home office on Friday', { ...PROPOSAL, text: /^Register home office Fri 18 Sep\?$/, params: { date: '2026-09-18' } }],
    ['D', 'create a note: order new labels', { ...PROPOSAL, params: { title: 'Order new labels', content: 'order new labels', isPersonal: true } }],
    ['D', 'send a message to Bo: the meeting has moved', { ...PROPOSAL, text: /^Send an internal message to Bo Berg: "the meeting has moved"\?$/, params: { to: 'bo@test' } }],
    ['D', 'create a team to-do: tidy the warehouse', { ...PROPOSAL, params: { title: 'tidy the warehouse' } }],
    ['D', 'send a high-five to Clara for the help', { ...PROPOSAL, params: { recipientEmail: 'clara@test', message: 'Thanks for the help' } }],
    ['E', 'send a message to everyone: the meeting is cancelled', { ...REFUSE, text: /only read/ }],
    ['B', 'who is packing today?', { mode: 'data', text: /Bo Berg — Packing/ }],
    ['C', 'how do I send a high-five?', { mode: 'app-guide', text: /High-fives/ }],
    ['C', 'good morning', { mode: 'data', text: /^Good morning Test/ }],
  ],
  fi: [
    ['D', 'ilmoita minut sairaaksi huomenna', { ...PROPOSAL, text: /^Ilmoitetaanko sinut sairaaksi huomenna \(16\.9\.\)\?/, params: { date: '2026-09-16', type: 'self' } }],
    ['D', 'kirjaa etätyö huomenna', { ...PROPOSAL, params: { date: '2026-09-16' } }],
    ['D', 'luo muistiinpano: tilaa uudet tarrat', { ...PROPOSAL, params: { title: 'Tilaa uudet tarrat', isPersonal: true } }],
    ['D', 'lähetä viesti Bolle: kokous siirtyi', { ...PROPOSAL, params: { to: 'bo@test', message: 'kokous siirtyi' } }],
    ['D', 'luo tiimin to-do: siivoa varasto', { ...PROPOSAL, params: { title: 'siivoa varasto' } }],
    ['D', 'lähetä high five Claralle', { ...PROPOSAL, params: { recipientEmail: 'clara@test', message: 'Hienoa työtä!' } }],
    ['E', 'lähetä viesti kaikille: kokous peruttu', { ...REFUSE, text: /vain lukea/ }],
    ['C', 'miten lähetän high fiven?', { mode: 'app-guide', text: /High five/i }],
    ['C', 'huomenta', { mode: 'data', text: /^Huomenta Test/ }],
  ],
  sv: [
    ['D', 'sjukanmäl mig imorgon', { ...PROPOSAL, text: /^Ska jag sjukanmäla dig imorgon \(onsdag 16 sep\.\)\?/, params: { date: '2026-09-16', type: 'self' } }],
    ['D', 'vabba idag', { ...PROPOSAL, params: { date: '2026-09-15', type: 'child' } }],
    ['D', 'jag jobbar hemifrån på fredag', { ...PROPOSAL, params: { date: '2026-09-18' } }],
    ['D', 'skapa en anteckning: beställ nya etiketter', { ...PROPOSAL, params: { title: 'Beställ nya etiketter', isPersonal: true } }],
    ['D', 'skicka ett meddelande till Bo: mötet är flyttat', { ...PROPOSAL, params: { to: 'bo@test', message: 'mötet är flyttat' } }],
    ['D', 'skapa en team-uppgift: städa lagret', { ...PROPOSAL, params: { title: 'städa lagret' } }],
    ['D', 'skicka en high five till Clara för hjälpen', { ...PROPOSAL, params: { recipientEmail: 'clara@test', message: 'Tack för hjälpen' } }],
    ['E', 'skicka ett meddelande till alla: mötet är inställt', { ...REFUSE, text: /bara läsa/ }],
    ['C', 'hur skickar jag en high five?', { mode: 'app-guide', text: /High fives/i }],
    ['C', 'god morgon', { mode: 'data', text: /^God morgon Test/ }],
  ],
}

// Same concept in da/en/fi/sv must take the same route.
const PARITY_R15 = [
  ['meld mig syg i morgen', 'report me sick tomorrow', 'ilmoita minut sairaaksi huomenna', 'sjukanmäl mig imorgon'],
  ['opret en note: bestil nye labels', 'create a note: order new labels', 'luo muistiinpano: tilaa uudet tarrat', 'skapa en anteckning: beställ nya etiketter'],
  ['send en besked til Bo: mødet er flyttet', 'send a message to Bo: the meeting has moved', 'lähetä viesti Bolle: kokous siirtyi', 'skicka ett meddelande till Bo: mötet är flyttat'],
  ['opret en team to-do: ryd op på lageret', 'create a team to-do: tidy the warehouse', 'luo tiimin to-do: siivoa varasto', 'skapa en team-uppgift: städa lagret'],
  ['send en besked til alle: mødet er aflyst', 'send a message to everyone: the meeting is cancelled', 'lähetä viesti kaikille: kokous peruttu', 'skicka ett meddelande till alla: mötet är inställt'],
]

module.exports = { ROUND15, PARITY_R15 }
