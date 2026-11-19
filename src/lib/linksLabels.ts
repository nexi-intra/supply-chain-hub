import type { Language } from './translations'
import type { LinkReportReason, LinkStatus, LinkWarning } from './links'

export interface LinksLabels {
  title: string
  hubDescription: string
  back: string
  search: string
  all: string
  favorites: string
  addLink: string
  empty: string
  emptySearch: string
  tabs: { links: string; review: (count: number) => string }
  status: Record<LinkStatus, string>
  hidden: string
  sharedWith: string
  addedBy: (name: string) => string
  favorite: string
  unfavorite: string
  open: string
  openTest: string
  edit: string
  suggest: string
  report: string
  reported: string
  suggestionSent: string
  delete: string
  confirmDelete: string
  form: {
    newTitle: string
    editTitle: string
    url: string
    urlHint: string
    urlInvalid: string
    name: string
    description: string
    descriptionHint: string
    category: string
    share: string
    shareHint: string
    save: string
    cancel: string
    pendingInfo: string
  }
  suggestForm: { title: string; hint: string; note: string; send: string }
  reportForm: { title: string; reasons: Record<LinkReportReason, string>; note: string; send: string; suspiciousHint: string }
  review: {
    pending: string
    suggestions: string
    reports: string
    nothing: string
    approve: string
    reject: string
    rejectNote: string
    accept: string
    decline: string
    dismiss: string
    deleteLink: string
    current: string
    proposed: string
    reasons: Record<LinkReportReason, string>
    rejectedBecause: (note: string) => string
  }
  warnings: Record<LinkWarning, string>
  toasts: { created: string; createdPending: string; saved: string; deleted: string; approved: string; rejected: string; suggested: string; reported: string; resolved: string; failed: string; duplicate: string; openFailed: string }
}

const da: LinksLabels = {
  title: 'Link Library',
  hubDescription: 'Links til de hjemmesider, vi bruger i arbejdet',
  back: 'Tilbage til Hub',
  search: 'Søg i titel, beskrivelse eller domæne…',
  all: 'Alle',
  favorites: 'Mine favoritter',
  addLink: 'Tilføj link',
  empty: 'Ingen links endnu. Tilføj det første!',
  emptySearch: 'Ingen links matcher søgningen.',
  tabs: { links: 'Links', review: count => `Til godkendelse (${count})` },
  status: { pending: 'Afventer godkendelse', approved: 'Godkendt', rejected: 'Afvist' },
  hidden: 'Skjult - rapporteret som mistænkeligt',
  sharedWith: 'Delt med',
  addedBy: name => `Tilføjet af ${name}`,
  favorite: 'Tilføj til favoritter',
  unfavorite: 'Fjern fra favoritter',
  open: 'Åbn',
  openTest: 'Åbn og test',
  edit: 'Rediger',
  suggest: 'Foreslå ændring',
  report: 'Rapportér',
  reported: 'Du har rapporteret linket',
  suggestionSent: 'Dit forslag venter på en manager',
  delete: 'Slet',
  confirmDelete: 'Slet linket for alle?',
  form: {
    newTitle: 'Tilføj link',
    editTitle: 'Rediger link',
    url: 'Webadresse',
    urlHint: 'Skal starte med https:// (eller http://)',
    urlInvalid: 'Skriv en gyldig adresse, der starter med https://',
    name: 'Titel',
    description: 'Beskrivelse',
    descriptionHint: 'Hvad bruger I siden til? Hubert bruger beskrivelsen til at finde linket.',
    category: 'Kategori',
    share: 'Del med andre afdelinger',
    shareHint: 'Linket ligger kun ét sted - ændringer slår igennem for alle de valgte afdelinger.',
    save: 'Gem',
    cancel: 'Annuller',
    pendingInfo: 'En manager i din afdeling skal godkende linket, før kollegerne kan se det.',
  },
  suggestForm: { title: 'Foreslå en ændring', hint: 'Udfyld kun det, der skal ændres. En manager godkender forslaget.', note: 'Hvorfor? (fx "siden er flyttet")', send: 'Send forslag' },
  reportForm: {
    title: 'Rapportér link',
    reasons: { dead: 'Linket virker ikke', wrong: 'Forkert indhold eller beskrivelse', suspicious: 'Mistænkeligt / farligt' },
    note: 'Uddyb gerne (valgfrit)',
    send: 'Rapportér',
    suspiciousHint: 'Linket skjules med det samme for alle undtagen managere, indtil det er undersøgt.',
  },
  review: {
    pending: 'Nye links',
    suggestions: 'Forslag til ændringer',
    reports: 'Rapporter',
    nothing: 'Der er intet at godkende.',
    approve: 'Godkend',
    reject: 'Afvis',
    rejectNote: 'Begrundelse til den, der oprettede linket (valgfri)',
    accept: 'Brug forslaget',
    decline: 'Afvis forslaget',
    dismiss: 'Linket er i orden',
    deleteLink: 'Slet linket',
    current: 'Nu',
    proposed: 'Forslag',
    reasons: { dead: 'Virker ikke', wrong: 'Forkert indhold', suspicious: 'Mistænkeligt' },
    rejectedBecause: note => (note ? `Afvist: ${note}` : 'Afvist af en manager'),
  },
  warnings: {
    'not-https': 'Ikke krypteret (http i stedet for https)',
    'ip-address': 'Peger på en IP-adresse i stedet for et domæne',
    shortener: 'Kort-link - den rigtige adresse er skjult',
    punycode: 'Domænet indeholder specialtegn, der kan efterligne et kendt domæne',
    credentials: 'Adressen indeholder brugernavn eller adgangskode',
    'unusual-port': 'Usædvanlig port',
  },
  toasts: {
    created: 'Linket er tilføjet', createdPending: 'Linket er sendt til godkendelse', saved: 'Linket er gemt', deleted: 'Linket er slettet',
    approved: 'Linket er godkendt', rejected: 'Linket er afvist', suggested: 'Forslaget er sendt', reported: 'Tak - linket er rapporteret',
    resolved: 'Klaret', failed: 'Det lykkedes ikke - prøv igen', duplicate: 'Afdelingen har allerede det link', openFailed: 'Linket kunne ikke åbnes',
  },
}

const en: LinksLabels = {
  ...da,
  title: 'Link Library',
  hubDescription: 'Links to the websites we use at work',
  back: 'Back to Hub',
  search: 'Search title, description or domain…',
  all: 'All',
  favorites: 'My favourites',
  addLink: 'Add link',
  empty: 'No links yet. Add the first one!',
  emptySearch: 'No links match your search.',
  tabs: { links: 'Links', review: count => `To approve (${count})` },
  status: { pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected' },
  hidden: 'Hidden - reported as suspicious',
  sharedWith: 'Shared with',
  addedBy: name => `Added by ${name}`,
  favorite: 'Add to favourites',
  unfavorite: 'Remove from favourites',
  open: 'Open',
  openTest: 'Open and test',
  edit: 'Edit',
  suggest: 'Suggest a change',
  report: 'Report',
  reported: 'You reported this link',
  suggestionSent: 'Your suggestion is waiting for a manager',
  delete: 'Delete',
  confirmDelete: 'Delete the link for everyone?',
  form: {
    newTitle: 'Add link', editTitle: 'Edit link', url: 'Web address', urlHint: 'Must start with https:// (or http://)',
    urlInvalid: 'Enter a valid address starting with https://', name: 'Title', description: 'Description',
    descriptionHint: 'What do you use the site for? Hubert uses the description to find the link.', category: 'Category',
    share: 'Share with other departments', shareHint: 'The link lives in one place - changes apply to every selected department.',
    save: 'Save', cancel: 'Cancel', pendingInfo: 'A manager in your department must approve the link before colleagues can see it.',
  },
  suggestForm: { title: 'Suggest a change', hint: 'Only fill in what should change. A manager approves the suggestion.', note: 'Why? (e.g. "the page moved")', send: 'Send suggestion' },
  reportForm: {
    title: 'Report link', reasons: { dead: 'The link does not work', wrong: 'Wrong content or description', suspicious: 'Suspicious / dangerous' },
    note: 'Add details (optional)', send: 'Report', suspiciousHint: 'The link is hidden at once for everyone but managers until it has been checked.',
  },
  review: {
    pending: 'New links', suggestions: 'Suggested changes', reports: 'Reports', nothing: 'Nothing to approve.', approve: 'Approve', reject: 'Reject',
    rejectNote: 'Reason for the person who added it (optional)', accept: 'Use suggestion', decline: 'Decline suggestion', dismiss: 'Link is fine',
    deleteLink: 'Delete link', current: 'Now', proposed: 'Suggested', reasons: { dead: 'Not working', wrong: 'Wrong content', suspicious: 'Suspicious' },
    rejectedBecause: note => (note ? `Rejected: ${note}` : 'Rejected by a manager'),
  },
  warnings: {
    'not-https': 'Not encrypted (http instead of https)', 'ip-address': 'Points to an IP address instead of a domain', shortener: 'Short link - the real address is hidden',
    punycode: 'The domain contains characters that can imitate a known domain', credentials: 'The address contains a user name or password', 'unusual-port': 'Unusual port',
  },
  toasts: {
    created: 'Link added', createdPending: 'Link sent for approval', saved: 'Link saved', deleted: 'Link deleted', approved: 'Link approved', rejected: 'Link rejected',
    suggested: 'Suggestion sent', reported: 'Thanks - the link has been reported', resolved: 'Done', failed: 'That did not work - please try again',
    duplicate: 'Your department already has this link', openFailed: 'The link could not be opened',
  },
}

const fi: LinksLabels = {
  ...en,
  hubDescription: 'Linkit työssä käyttämiimme sivustoihin',
  back: 'Takaisin Hubiin',
  search: 'Hae otsikosta, kuvauksesta tai verkkotunnuksesta…',
  all: 'Kaikki',
  favorites: 'Omat suosikit',
  addLink: 'Lisää linkki',
  empty: 'Ei vielä linkkejä. Lisää ensimmäinen!',
  emptySearch: 'Haulla ei löytynyt linkkejä.',
  tabs: { links: 'Linkit', review: count => `Hyväksyttävät (${count})` },
  status: { pending: 'Odottaa hyväksyntää', approved: 'Hyväksytty', rejected: 'Hylätty' },
  hidden: 'Piilotettu - ilmoitettu epäilyttäväksi',
  sharedWith: 'Jaettu',
  addedBy: name => `Lisännyt ${name}`,
  favorite: 'Lisää suosikkeihin',
  unfavorite: 'Poista suosikeista',
  open: 'Avaa',
  openTest: 'Avaa ja testaa',
  edit: 'Muokkaa',
  suggest: 'Ehdota muutosta',
  report: 'Ilmoita',
  reported: 'Olet ilmoittanut linkistä',
  suggestionSent: 'Ehdotuksesi odottaa esihenkilöä',
  delete: 'Poista',
  confirmDelete: 'Poistetaanko linkki kaikilta?',
  form: {
    newTitle: 'Lisää linkki', editTitle: 'Muokkaa linkkiä', url: 'Verkko-osoite', urlHint: 'Alkaa https:// (tai http://)', urlInvalid: 'Kirjoita kelvollinen https://-osoite',
    name: 'Otsikko', description: 'Kuvaus', descriptionHint: 'Mihin sivua käytetään? Hubert löytää linkin kuvauksen avulla.', category: 'Luokka',
    share: 'Jaa muille osastoille', shareHint: 'Linkki on yhdessä paikassa - muutokset näkyvät kaikilla valituilla osastoilla.', save: 'Tallenna', cancel: 'Peruuta',
    pendingInfo: 'Osastosi esihenkilön on hyväksyttävä linkki ennen kuin kollegat näkevät sen.',
  },
  suggestForm: { title: 'Ehdota muutosta', hint: 'Täytä vain muuttuvat kohdat. Esihenkilö hyväksyy ehdotuksen.', note: 'Miksi? (esim. "sivu on siirtynyt")', send: 'Lähetä ehdotus' },
  reportForm: {
    title: 'Ilmoita linkistä', reasons: { dead: 'Linkki ei toimi', wrong: 'Väärä sisältö tai kuvaus', suspicious: 'Epäilyttävä / vaarallinen' }, note: 'Lisätietoja (valinnainen)',
    send: 'Ilmoita', suspiciousHint: 'Linkki piilotetaan heti muilta kuin esihenkilöiltä, kunnes se on tarkistettu.',
  },
  review: {
    pending: 'Uudet linkit', suggestions: 'Muutosehdotukset', reports: 'Ilmoitukset', nothing: 'Ei hyväksyttävää.', approve: 'Hyväksy', reject: 'Hylkää',
    rejectNote: 'Perustelu lisääjälle (valinnainen)', accept: 'Käytä ehdotusta', decline: 'Hylkää ehdotus', dismiss: 'Linkki on kunnossa', deleteLink: 'Poista linkki',
    current: 'Nyt', proposed: 'Ehdotus', reasons: { dead: 'Ei toimi', wrong: 'Väärä sisältö', suspicious: 'Epäilyttävä' },
    rejectedBecause: note => (note ? `Hylätty: ${note}` : 'Esihenkilö hylkäsi'),
  },
  warnings: {
    'not-https': 'Ei salattu (http eikä https)', 'ip-address': 'Osoittaa IP-osoitteeseen', shortener: 'Lyhytlinkki - oikea osoite on piilossa',
    punycode: 'Verkkotunnus voi jäljitellä tunnettua verkkotunnusta', credentials: 'Osoitteessa on käyttäjätunnus tai salasana', 'unusual-port': 'Epätavallinen portti',
  },
  toasts: {
    created: 'Linkki lisätty', createdPending: 'Linkki lähetetty hyväksyttäväksi', saved: 'Linkki tallennettu', deleted: 'Linkki poistettu', approved: 'Linkki hyväksytty',
    rejected: 'Linkki hylätty', suggested: 'Ehdotus lähetetty', reported: 'Kiitos - linkistä on ilmoitettu', resolved: 'Valmis', failed: 'Ei onnistunut - yritä uudelleen',
    duplicate: 'Osastollasi on jo tämä linkki', openFailed: 'Linkkiä ei voitu avata',
  },
}

const sv: LinksLabels = {
  ...en,
  hubDescription: 'Länkar till webbplatserna vi använder i arbetet',
  back: 'Tillbaka till Hub',
  search: 'Sök i titel, beskrivning eller domän…',
  all: 'Alla',
  favorites: 'Mina favoriter',
  addLink: 'Lägg till länk',
  empty: 'Inga länkar än. Lägg till den första!',
  emptySearch: 'Inga länkar matchar sökningen.',
  tabs: { links: 'Länkar', review: count => `Att godkänna (${count})` },
  status: { pending: 'Väntar på godkännande', approved: 'Godkänd', rejected: 'Avvisad' },
  hidden: 'Dold - rapporterad som misstänkt',
  sharedWith: 'Delad med',
  addedBy: name => `Tillagd av ${name}`,
  favorite: 'Lägg till i favoriter',
  unfavorite: 'Ta bort från favoriter',
  open: 'Öppna',
  openTest: 'Öppna och testa',
  edit: 'Redigera',
  suggest: 'Föreslå ändring',
  report: 'Rapportera',
  reported: 'Du har rapporterat länken',
  suggestionSent: 'Ditt förslag väntar på en chef',
  delete: 'Ta bort',
  confirmDelete: 'Ta bort länken för alla?',
  form: {
    newTitle: 'Lägg till länk', editTitle: 'Redigera länk', url: 'Webbadress', urlHint: 'Måste börja med https:// (eller http://)', urlInvalid: 'Skriv en giltig adress som börjar med https://',
    name: 'Titel', description: 'Beskrivning', descriptionHint: 'Vad använder ni sidan till? Hubert använder beskrivningen för att hitta länken.', category: 'Kategori',
    share: 'Dela med andra avdelningar', shareHint: 'Länken finns på ett ställe - ändringar gäller alla valda avdelningar.', save: 'Spara', cancel: 'Avbryt',
    pendingInfo: 'En chef på din avdelning måste godkänna länken innan kollegorna kan se den.',
  },
  suggestForm: { title: 'Föreslå en ändring', hint: 'Fyll bara i det som ska ändras. En chef godkänner förslaget.', note: 'Varför? (t.ex. "sidan har flyttat")', send: 'Skicka förslag' },
  reportForm: {
    title: 'Rapportera länk', reasons: { dead: 'Länken fungerar inte', wrong: 'Fel innehåll eller beskrivning', suspicious: 'Misstänkt / farlig' }, note: 'Beskriv gärna (valfritt)',
    send: 'Rapportera', suspiciousHint: 'Länken döljs direkt för alla utom chefer tills den har kontrollerats.',
  },
  review: {
    pending: 'Nya länkar', suggestions: 'Föreslagna ändringar', reports: 'Rapporter', nothing: 'Inget att godkänna.', approve: 'Godkänn', reject: 'Avvisa',
    rejectNote: 'Motivering till den som lade till länken (valfritt)', accept: 'Använd förslaget', decline: 'Avvisa förslaget', dismiss: 'Länken är okej', deleteLink: 'Ta bort länken',
    current: 'Nu', proposed: 'Förslag', reasons: { dead: 'Fungerar inte', wrong: 'Fel innehåll', suspicious: 'Misstänkt' },
    rejectedBecause: note => (note ? `Avvisad: ${note}` : 'Avvisad av en chef'),
  },
  warnings: {
    'not-https': 'Inte krypterad (http i stället för https)', 'ip-address': 'Pekar på en IP-adress i stället för en domän', shortener: 'Kortlänk - den riktiga adressen är dold',
    punycode: 'Domänen innehåller tecken som kan efterlikna en känd domän', credentials: 'Adressen innehåller användarnamn eller lösenord', 'unusual-port': 'Ovanlig port',
  },
  toasts: {
    created: 'Länken har lagts till', createdPending: 'Länken har skickats för godkännande', saved: 'Länken har sparats', deleted: 'Länken har tagits bort', approved: 'Länken har godkänts',
    rejected: 'Länken har avvisats', suggested: 'Förslaget har skickats', reported: 'Tack - länken har rapporterats', resolved: 'Klart', failed: 'Det gick inte - försök igen',
    duplicate: 'Avdelningen har redan den länken', openFailed: 'Länken kunde inte öppnas',
  },
}

export const LINKS_LABELS: Record<Language, LinksLabels> = { da, en, fi, sv }
export const getLinksLabels = (language: Language): LinksLabels => LINKS_LABELS[language] ?? en
