import type { Language } from './translations'
import { getImprovementsLabels } from './improvementsLabels'

export type CommandSearchGroupId = 'modules' | 'guides' | 'knowledge' | 'links' | 'people' | 'notes' | 'todos' | 'improvements' | 'messages'

export interface CommandSearchLabels {
  groups: Record<CommandSearchGroupId, string>
  placeholder: string
  loading: string
  guide: string
  article: string
  shared: string
  colleague: string
  manager: string
  creator: string
  note: string
  notePrivate: string
  todo: string
  todoPersonal: string
  todoTeam: string
  todoDone: string
  improvement: string
  link: string
  message: string
  messageFrom: string
  messageTo: string
  noSubject: string
  improvementStatuses: Record<string, string>
}

type Own = Omit<CommandSearchLabels, 'improvementStatuses'>

const LABELS: Record<Language, Own> = {
  da: {
    groups: { modules: 'Moduler', guides: 'Guides', knowledge: 'Knowledge Base', links: 'Links', people: 'Kolleger', notes: 'Noter', todos: 'To-dos', improvements: 'Forbedringer', messages: 'Beskeder' },
    placeholder: 'Søg i moduler, guides, kolleger, noter…', loading: 'Henter…',
    guide: 'Guide', article: 'Artikel', shared: 'delt', colleague: 'Kollega', manager: 'Manager', creator: 'Creator',
    note: 'Note', notePrivate: 'privat', todo: 'To-do', todoPersonal: 'personlig', todoTeam: 'team', todoDone: 'færdig',
    improvement: 'Forbedring', link: 'Link', message: 'Besked', messageFrom: 'fra', messageTo: 'til', noSubject: '(uden emne)',
  },
  en: {
    groups: { modules: 'Modules', guides: 'Guides', knowledge: 'Knowledge Base', links: 'Links', people: 'Colleagues', notes: 'Notes', todos: 'To-dos', improvements: 'Improvements', messages: 'Messages' },
    placeholder: 'Search modules, guides, colleagues, notes…', loading: 'Loading…',
    guide: 'Guide', article: 'Article', shared: 'shared', colleague: 'Colleague', manager: 'Manager', creator: 'Creator',
    note: 'Note', notePrivate: 'private', todo: 'To-do', todoPersonal: 'personal', todoTeam: 'team', todoDone: 'done',
    improvement: 'Improvement', link: 'Link', message: 'Message', messageFrom: 'from', messageTo: 'to', noSubject: '(no subject)',
  },
  fi: {
    groups: { modules: 'Moduulit', guides: 'Oppaat', knowledge: 'Knowledge Base', links: 'Linkit', people: 'Kollegat', notes: 'Muistiinpanot', todos: 'To-do-tehtävät', improvements: 'Parannukset', messages: 'Viestit' },
    placeholder: 'Etsi moduuleista, oppaista, kollegoista, muistiinpanoista…', loading: 'Ladataan…',
    guide: 'Opas', article: 'Artikkeli', shared: 'jaettu', colleague: 'Kollega', manager: 'Johtaja', creator: 'Luoja',
    note: 'Muistiinpano', notePrivate: 'yksityinen', todo: 'To-do', todoPersonal: 'henkilökohtainen', todoTeam: 'tiimi', todoDone: 'valmis',
    improvement: 'Parannus', link: 'Linkki', message: 'Viesti', messageFrom: 'lähettäjä', messageTo: 'vastaanottaja', noSubject: '(ei aihetta)',
  },
  sv: {
    groups: { modules: 'Moduler', guides: 'Guider', knowledge: 'Knowledge Base', links: 'Länkar', people: 'Kollegor', notes: 'Anteckningar', todos: 'Uppgifter', improvements: 'Förbättringar', messages: 'Meddelanden' },
    placeholder: 'Sök i moduler, guider, kollegor, anteckningar…', loading: 'Hämtar…',
    guide: 'Guide', article: 'Artikel', shared: 'delad', colleague: 'Kollega', manager: 'Manager', creator: 'Creator',
    note: 'Anteckning', notePrivate: 'privat', todo: 'Uppgift', todoPersonal: 'personlig', todoTeam: 'team', todoDone: 'klar',
    improvement: 'Förbättring', link: 'Länk', message: 'Meddelande', messageFrom: 'från', messageTo: 'till', noSubject: '(inget ämne)',
  },
}

export function getCommandSearchLabels(language: string): CommandSearchLabels {
  const key: Language = language === 'en' || language === 'fi' || language === 'sv' ? language : 'da'
  return { ...LABELS[key], improvementStatuses: getImprovementsLabels(key).statuses }
}
