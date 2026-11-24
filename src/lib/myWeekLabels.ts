import type { Language } from './translations'
import type { MyWeekItem } from './myWeek'

export interface MyWeekLabels {
  title: string
  today: string
  nothing: string
  pending: string
  overdue: string
  unknownRole: string
  week: (number: number) => string
  /** "Du har ingen planer" shown for a day without items. */
  emptyDay: string
  kinds: { shift: string; vacation: string; dayOff: string; parental: string; sick: string; homeOffice: string }
  details: { todoPersonal: string; todoTeam: string; event: string; review: string; improvementDue: string; improvementFeedback: string; improvementRespond: string }
  quickAdd: { open: (day: string) => string; placeholder: string; hint: string; todo: string; event: string; save: string; saved: string; missingTitle: string; invalidTime: string; failed: string }
}

const da: MyWeekLabels = {
  title: 'Min uge',
  today: 'I dag',
  nothing: 'Ingen planer denne uge',
  pending: 'afventer',
  overdue: 'forfalden',
  unknownRole: 'Ukendt opgave',
  week: number => `Uge ${number}`,
  emptyDay: 'Ingen planer',
  kinds: { shift: 'Vagt', vacation: 'Ferie', dayOff: 'Fridag', parental: 'Barsel', sick: 'Syg', homeOffice: 'Hjemmearbejde' },
  details: { todoPersonal: 'Personlig to-do', todoTeam: 'Team to-do', event: 'Aftale', review: 'Guide skal gennemgås', improvementDue: 'Frist på forbedring', improvementFeedback: 'Frist for tilbagemelding', improvementRespond: 'Svarfrist på invitation' },
  quickAdd: { open: day => `Tilføj til ${day}`, placeholder: 'Fx Ring til DHL kl. 10:30', hint: 'Skriv et klokkeslæt i teksten, fx "kl. 13-14".', todo: 'To-do', event: 'Aftale', save: 'Tilføj', saved: 'Tilføjet', missingTitle: 'Skriv hvad det drejer sig om', invalidTime: 'Sluttiden skal ligge efter starttiden', failed: 'Kunne ikke gemme - prøv igen' },
}

const en: MyWeekLabels = {
  title: 'My week',
  today: 'Today',
  nothing: 'No plans this week',
  pending: 'pending',
  overdue: 'overdue',
  unknownRole: 'Unknown task',
  week: number => `Week ${number}`,
  emptyDay: 'No plans',
  kinds: { shift: 'Shift', vacation: 'Vacation', dayOff: 'Day off', parental: 'Parental leave', sick: 'Sick', homeOffice: 'Home office' },
  details: { todoPersonal: 'Personal to-do', todoTeam: 'Team to-do', event: 'Appointment', review: 'Guide review due', improvementDue: 'Improvement deadline', improvementFeedback: 'Feedback deadline', improvementRespond: 'Invitation response deadline' },
  quickAdd: { open: day => `Add to ${day}`, placeholder: 'E.g. Call DHL at 10:30', hint: 'Type a time in the text, e.g. "at 13-14".', todo: 'To-do', event: 'Appointment', save: 'Add', saved: 'Added', missingTitle: 'Type what it is about', invalidTime: 'The end time must be after the start time', failed: 'Could not save - please try again' },
}

const fi: MyWeekLabels = {
  title: 'Oma viikkoni',
  today: 'Tänään',
  nothing: 'Ei suunnitelmia tällä viikolla',
  pending: 'odottaa',
  overdue: 'myöhässä',
  unknownRole: 'Tuntematon tehtävä',
  week: number => `Viikko ${number}`,
  emptyDay: 'Ei suunnitelmia',
  kinds: { shift: 'Vuoro', vacation: 'Loma', dayOff: 'Vapaapäivä', parental: 'Perhevapaa', sick: 'Sairaana', homeOffice: 'Etätyö' },
  details: { todoPersonal: 'Oma to-do', todoTeam: 'Tiimin to-do', event: 'Tapaaminen', review: 'Opas tarkistettava', improvementDue: 'Parannuksen määräaika', improvementFeedback: 'Palautteen määräaika', improvementRespond: 'Kutsun vastausmääräaika' },
  quickAdd: { open: day => `Lisää: ${day}`, placeholder: 'Esim. Soita DHL:lle klo 10:30', hint: 'Kirjoita kellonaika tekstiin, esim. "klo 13-14".', todo: 'To-do', event: 'Tapaaminen', save: 'Lisää', saved: 'Lisätty', missingTitle: 'Kirjoita, mistä on kyse', invalidTime: 'Päättymisajan on oltava alkamisajan jälkeen', failed: 'Tallennus epäonnistui - yritä uudelleen' },
}

const sv: MyWeekLabels = {
  title: 'Min vecka',
  today: 'Idag',
  nothing: 'Inga planer den här veckan',
  pending: 'väntar',
  overdue: 'försenad',
  unknownRole: 'Okänd uppgift',
  week: number => `Vecka ${number}`,
  emptyDay: 'Inga planer',
  kinds: { shift: 'Pass', vacation: 'Semester', dayOff: 'Ledig dag', parental: 'Föräldraledig', sick: 'Sjuk', homeOffice: 'Hemarbete' },
  details: { todoPersonal: 'Personlig att göra', todoTeam: 'Teamets att göra', event: 'Möte', review: 'Guide ska granskas', improvementDue: 'Frist för förbättring', improvementFeedback: 'Frist för återkoppling', improvementRespond: 'Svarsfrist för inbjudan' },
  quickAdd: { open: day => `Lägg till ${day}`, placeholder: 'T.ex. Ring DHL kl. 10:30', hint: 'Skriv en tid i texten, t.ex. "kl. 13-14".', todo: 'Att göra', event: 'Möte', save: 'Lägg till', saved: 'Tillagd', missingTitle: 'Skriv vad det gäller', invalidTime: 'Sluttiden måste vara efter starttiden', failed: 'Kunde inte spara - försök igen' },
}

export const MY_WEEK_LABELS: Record<Language, MyWeekLabels> = { da, en, fi, sv }

export function getMyWeekLabels(language: Language): MyWeekLabels {
  return MY_WEEK_LABELS[language] ?? en
}

/** Main text and the secondary line of one row. */
export function myWeekItemText(labels: MyWeekLabels, item: MyWeekItem): { label: string; detail: string } {
  switch (item.kind) {
    case 'shift': return { label: item.title || labels.unknownRole, detail: labels.kinds.shift }
    case 'todo': return { label: item.title, detail: item.variant === 'team' ? labels.details.todoTeam : labels.details.todoPersonal }
    case 'event': return { label: item.title, detail: labels.details.event }
    case 'review': return { label: item.title, detail: labels.details.review }
    case 'improvement': return {
      label: item.title,
      detail: item.variant === 'feedback' ? labels.details.improvementFeedback : item.variant === 'respond' ? labels.details.improvementRespond : labels.details.improvementDue,
    }
    default: return { label: labels.kinds[item.kind], detail: '' }
  }
}
