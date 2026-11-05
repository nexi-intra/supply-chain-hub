import type { Language } from './translations'
import type { HighFiveEmoji, HighFiveErrorCode, HighFiveMessageProblem } from './highFives'

export interface HighFiveLabels {
  title: string
  send: string
  loading: string
  unavailable: string
  receivedHeading: string
  teamHeading: string
  emptyReceived: string
  emptyTeam: string
  from: (name: string) => string
  fromTo: (sender: string, recipient: string) => string
  newBadge: string
  /** Bell title, e.g. "Anna sent you a high-five 🙌". */
  notification: (name: string, emoji: string) => string
  emojiNames: Record<HighFiveEmoji, string>
  dialog: {
    title: string
    description: string
    search: string
    searchPlaceholder: string
    noPeople: string
    pickPerson: string
    emoji: string
    message: string
    messagePlaceholder: string
    count: (used: number, max: number) => string
    send: string
    sending: string
    cancel: string
    problems: Record<HighFiveMessageProblem, string>
  }
  sent: (name: string) => string
  errors: Record<HighFiveErrorCode, string> & { generic: string }
}

const da: HighFiveLabels = {
  title: 'High-fives',
  send: 'Send high-five',
  loading: 'Henter high-fives…',
  unavailable: 'High-fives kan ikke hentes lige nu.',
  receivedHeading: 'Du har fået',
  teamHeading: 'I dit team',
  emptyReceived: 'Du har ikke fået nogen high-fives endnu.',
  emptyTeam: 'Ingen high-fives i dit team endnu.',
  from: name => `Fra ${name}`,
  fromTo: (sender, recipient) => `${sender} til ${recipient}`,
  newBadge: 'Ny',
  notification: (name, emoji) => `${name} sendte dig en high-five ${emoji}`,
  emojiNames: { '🙌': 'Hænder i vejret', '👏': 'Klap', '🎉': 'Fest', '💪': 'Stærk', '🔥': 'Ild', '⭐': 'Stjerne', '🙏': 'Tak', '❤️': 'Hjerte' },
  dialog: {
    title: 'Send en high-five',
    description: 'Sig tak eller giv en klapsalve til en kollega i et hvilket som helst team. Beskeden kan ses af modtageren og af de to teams.',
    search: 'Find kollega',
    searchPlaceholder: 'Søg på navn eller team',
    noPeople: 'Ingen kolleger matcher søgningen.',
    pickPerson: 'Vælg en kollega.',
    emoji: 'Vælg en emoji',
    message: 'Besked',
    messagePlaceholder: 'Tak for hjælpen i går!',
    count: (used, max) => `${used} / ${max} tegn`,
    send: 'Send high-five',
    sending: 'Sender…',
    cancel: 'Annuller',
    problems: {
      empty: 'Skriv en kort besked.',
      tooLong: 'Beskeden er for lang.',
      unsafe: 'Beskeden må kun være almindelig tekst på én linje.',
    },
  },
  sent: name => `High-five sendt til ${name}`,
  errors: {
    HIGH_FIVES_INVALID: 'High-fiven kunne ikke sendes. Tjek modtager, emoji og besked.',
    HIGH_FIVES_FORBIDDEN: 'Du kan ikke sende high-fives fra denne visning.',
    HIGH_FIVES_LIMIT: 'Du har sendt mange high-fives den seneste time. Prøv igen lidt senere.',
    HIGH_FIVES_CONFLICT: 'Andre sendte high-fives samtidig. Prøv igen.',
    HIGH_FIVES_OPERATION_CONFLICT: 'High-fiven kunne ikke sendes. Prøv igen.',
    HIGH_FIVES_INVALID_DATA: 'High-fives kan ikke læses lige nu.',
    HIGH_FIVES_DIRECTORY: 'Kollegalisten kan ikke hentes lige nu.',
    HIGH_FIVES_UNAVAILABLE: 'Der er ikke forbindelse til det delte drev. Prøv igen om lidt.',
    AUTH_REQUIRED: 'Du skal være logget ind som godkendt medarbejder for at sende high-fives.',
    generic: 'High-fiven kunne ikke sendes. Prøv igen.',
  },
}

const en: HighFiveLabels = {
  title: 'High-fives',
  send: 'Send high-five',
  loading: 'Loading high-fives…',
  unavailable: 'High-fives cannot be loaded right now.',
  receivedHeading: 'You received',
  teamHeading: 'In your team',
  emptyReceived: 'You have not received any high-fives yet.',
  emptyTeam: 'No high-fives in your team yet.',
  from: name => `From ${name}`,
  fromTo: (sender, recipient) => `${sender} to ${recipient}`,
  newBadge: 'New',
  notification: (name, emoji) => `${name} sent you a high-five ${emoji}`,
  emojiNames: { '🙌': 'Raised hands', '👏': 'Clapping', '🎉': 'Party', '💪': 'Strong', '🔥': 'Fire', '⭐': 'Star', '🙏': 'Thanks', '❤️': 'Heart' },
  dialog: {
    title: 'Send a high-five',
    description: 'Say thanks or give a round of applause to a colleague in any team. The recipient and the two teams can see the message.',
    search: 'Find a colleague',
    searchPlaceholder: 'Search by name or team',
    noPeople: 'No colleagues match the search.',
    pickPerson: 'Pick a colleague.',
    emoji: 'Pick an emoji',
    message: 'Message',
    messagePlaceholder: 'Thanks for the help yesterday!',
    count: (used, max) => `${used} / ${max} characters`,
    send: 'Send high-five',
    sending: 'Sending…',
    cancel: 'Cancel',
    problems: {
      empty: 'Write a short message.',
      tooLong: 'The message is too long.',
      unsafe: 'The message must be plain text on one line.',
    },
  },
  sent: name => `High-five sent to ${name}`,
  errors: {
    HIGH_FIVES_INVALID: 'The high-five could not be sent. Check the recipient, emoji and message.',
    HIGH_FIVES_FORBIDDEN: 'You cannot send high-fives from this view.',
    HIGH_FIVES_LIMIT: 'You have sent many high-fives in the last hour. Try again a little later.',
    HIGH_FIVES_CONFLICT: 'Others sent high-fives at the same time. Try again.',
    HIGH_FIVES_OPERATION_CONFLICT: 'The high-five could not be sent. Try again.',
    HIGH_FIVES_INVALID_DATA: 'High-fives cannot be read right now.',
    HIGH_FIVES_DIRECTORY: 'The colleague list cannot be loaded right now.',
    HIGH_FIVES_UNAVAILABLE: 'There is no connection to the shared drive. Try again shortly.',
    AUTH_REQUIRED: 'You must be signed in as an approved employee to send high-fives.',
    generic: 'The high-five could not be sent. Try again.',
  },
}

const fi: HighFiveLabels = {
  title: 'High five -kiitokset',
  send: 'Lähetä high five',
  loading: 'Ladataan high five -kiitoksia…',
  unavailable: 'High five -kiitoksia ei voi ladata juuri nyt.',
  receivedHeading: 'Saamasi',
  teamHeading: 'Tiimissäsi',
  emptyReceived: 'Et ole vielä saanut yhtään high fivea.',
  emptyTeam: 'Tiimissäsi ei ole vielä high five -kiitoksia.',
  from: name => `Lähettäjä: ${name}`,
  fromTo: (sender, recipient) => `${sender} → ${recipient}`,
  newBadge: 'Uusi',
  notification: (name, emoji) => `${name} lähetti sinulle high fiven ${emoji}`,
  emojiNames: { '🙌': 'Kädet ylhäällä', '👏': 'Aplodit', '🎉': 'Juhla', '💪': 'Vahva', '🔥': 'Tuli', '⭐': 'Tähti', '🙏': 'Kiitos', '❤️': 'Sydän' },
  dialog: {
    title: 'Lähetä high five',
    description: 'Kiitä tai anna aplodit kollegalle mistä tahansa tiimistä. Viestin näkevät vastaanottaja ja molemmat tiimit.',
    search: 'Etsi kollega',
    searchPlaceholder: 'Hae nimellä tai tiimillä',
    noPeople: 'Haulla ei löydy kollegoita.',
    pickPerson: 'Valitse kollega.',
    emoji: 'Valitse emoji',
    message: 'Viesti',
    messagePlaceholder: 'Kiitos eilisestä avusta!',
    count: (used, max) => `${used} / ${max} merkkiä`,
    send: 'Lähetä high five',
    sending: 'Lähetetään…',
    cancel: 'Peruuta',
    problems: {
      empty: 'Kirjoita lyhyt viesti.',
      tooLong: 'Viesti on liian pitkä.',
      unsafe: 'Viestin on oltava pelkkää tekstiä yhdellä rivillä.',
    },
  },
  sent: name => `High five lähetetty: ${name}`,
  errors: {
    HIGH_FIVES_INVALID: 'High fivea ei voitu lähettää. Tarkista vastaanottaja, emoji ja viesti.',
    HIGH_FIVES_FORBIDDEN: 'Tästä näkymästä ei voi lähettää high five -kiitoksia.',
    HIGH_FIVES_LIMIT: 'Olet lähettänyt viime tunnin aikana paljon high five -kiitoksia. Yritä myöhemmin uudelleen.',
    HIGH_FIVES_CONFLICT: 'Muut lähettivät kiitoksia samaan aikaan. Yritä uudelleen.',
    HIGH_FIVES_OPERATION_CONFLICT: 'High fivea ei voitu lähettää. Yritä uudelleen.',
    HIGH_FIVES_INVALID_DATA: 'High five -kiitoksia ei voi lukea juuri nyt.',
    HIGH_FIVES_DIRECTORY: 'Kollegalistaa ei voi ladata juuri nyt.',
    HIGH_FIVES_UNAVAILABLE: 'Yhteys jaettuun asemaan puuttuu. Yritä hetken päästä uudelleen.',
    AUTH_REQUIRED: 'Sinun on oltava kirjautuneena hyväksyttynä työntekijänä, jotta voit lähettää high five -kiitoksia.',
    generic: 'High fivea ei voitu lähettää. Yritä uudelleen.',
  },
}

const sv: HighFiveLabels = {
  title: 'High fives',
  send: 'Skicka high five',
  loading: 'Hämtar high fives…',
  unavailable: 'High fives kan inte hämtas just nu.',
  receivedHeading: 'Du har fått',
  teamHeading: 'I ditt team',
  emptyReceived: 'Du har inte fått några high fives än.',
  emptyTeam: 'Inga high fives i ditt team än.',
  from: name => `Från ${name}`,
  fromTo: (sender, recipient) => `${sender} till ${recipient}`,
  newBadge: 'Ny',
  notification: (name, emoji) => `${name} skickade en high five till dig ${emoji}`,
  emojiNames: { '🙌': 'Händer i luften', '👏': 'Applåd', '🎉': 'Fest', '💪': 'Stark', '🔥': 'Eld', '⭐': 'Stjärna', '🙏': 'Tack', '❤️': 'Hjärta' },
  dialog: {
    title: 'Skicka en high five',
    description: 'Säg tack eller ge en applåd till en kollega i valfritt team. Mottagaren och de två teamen kan se meddelandet.',
    search: 'Hitta en kollega',
    searchPlaceholder: 'Sök på namn eller team',
    noPeople: 'Inga kollegor matchar sökningen.',
    pickPerson: 'Välj en kollega.',
    emoji: 'Välj en emoji',
    message: 'Meddelande',
    messagePlaceholder: 'Tack för hjälpen igår!',
    count: (used, max) => `${used} / ${max} tecken`,
    send: 'Skicka high five',
    sending: 'Skickar…',
    cancel: 'Avbryt',
    problems: {
      empty: 'Skriv ett kort meddelande.',
      tooLong: 'Meddelandet är för långt.',
      unsafe: 'Meddelandet måste vara vanlig text på en rad.',
    },
  },
  sent: name => `High five skickad till ${name}`,
  errors: {
    HIGH_FIVES_INVALID: 'High fiven kunde inte skickas. Kontrollera mottagare, emoji och meddelande.',
    HIGH_FIVES_FORBIDDEN: 'Du kan inte skicka high fives från den här vyn.',
    HIGH_FIVES_LIMIT: 'Du har skickat många high fives den senaste timmen. Försök igen lite senare.',
    HIGH_FIVES_CONFLICT: 'Andra skickade high fives samtidigt. Försök igen.',
    HIGH_FIVES_OPERATION_CONFLICT: 'High fiven kunde inte skickas. Försök igen.',
    HIGH_FIVES_INVALID_DATA: 'High fives kan inte läsas just nu.',
    HIGH_FIVES_DIRECTORY: 'Kollegalistan kan inte hämtas just nu.',
    HIGH_FIVES_UNAVAILABLE: 'Det finns ingen anslutning till den delade enheten. Försök igen om en stund.',
    AUTH_REQUIRED: 'Du måste vara inloggad som godkänd medarbetare för att skicka high fives.',
    generic: 'High fiven kunde inte skickas. Försök igen.',
  },
}

export const HIGH_FIVE_LABELS: Record<Language, HighFiveLabels> = { da, en, fi, sv }

export function getHighFiveLabels(language: Language): HighFiveLabels {
  return HIGH_FIVE_LABELS[language] ?? en
}

export function highFiveErrorText(labels: HighFiveLabels, code: HighFiveErrorCode | null): string {
  return code ? labels.errors[code] : labels.errors.generic
}
