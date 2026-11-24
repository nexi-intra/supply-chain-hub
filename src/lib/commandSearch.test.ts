import { describe, expect, it } from 'vitest'
import {
  MAX_PER_GROUP, MAX_TOTAL, buildCommandSearchEntries, foldSearchText, indexCommandEntries, moduleEntries, searchCommandEntries,
  type CommandSearchEntry, type CommandSearchSources,
} from './commandSearch'
import { getCommandSearchLabels } from './commandSearchLabels'

const labels = getCommandSearchLabels('da')
const ME = 'me@example.test'

const entry = (id: string, group: CommandSearchEntry['group'], title: string, terms: string[] = []): CommandSearchEntry =>
  ({ id, group, icon: group, title, detail: '', terms, target: { view: 'hub' } })
const run = (entries: CommandSearchEntry[], query: string) => searchCommandEntries(indexCommandEntries(entries), query)
const flat = (results: ReturnType<typeof run>) => results.flatMap(group => group.entries.map(item => item.id))

describe('foldSearchText', () => {
  it('folds Nordic letters, accents and punctuation', () => {
    expect(foldSearchText('Bjørn Æble Åse')).toBe('bjorn aeble ase')
    expect(foldSearchText('Mäkelä Östman')).toBe('makela ostman')
    expect(foldSearchText('Café-Müller')).toBe('cafe muller')
    expect(foldSearchText('  e-mail   ')).toBe('e mail')
  })
})

describe('searchCommandEntries', () => {
  it('shows only modules for an empty query', () => {
    const entries = [entry('m1', 'modules', 'Kalender'), entry('g1', 'guides', 'Kalender guide')]
    expect(flat(run(entries, ''))).toEqual(['m1'])
    expect(flat(run(entries, '   '))).toEqual(['m1'])
  })

  it('is accent-insensitive in both directions', () => {
    const entries = [entry('p1', 'people', 'Søren Ørsted'), entry('p2', 'people', 'Åsa Mäkelä'), entry('p3', 'people', 'Aeble Test')]
    expect(flat(run(entries, 'soren'))).toEqual(['p1'])
    expect(flat(run(entries, 'ørsted'))).toEqual(['p1'])
    expect(flat(run(entries, 'asa makela'))).toEqual(['p2'])
    expect(flat(run(entries, 'æble'))).toEqual(['p3'])
  })

  it('ranks exact title above prefix above word-prefix above substring', () => {
    const entries = [
      entry('sub', 'guides', 'Xxrapportxx'),
      entry('word', 'guides', 'Ugentlig rapport'),
      entry('prefix', 'guides', 'Rapport til chef'),
      entry('exact', 'guides', 'Rapport'),
    ]
    expect(flat(run(entries, 'rapport'))).toEqual(['exact', 'prefix', 'word', 'sub'])
  })

  it('requires every token to match and lets terms such as tags and categories match', () => {
    const entries = [
      entry('a', 'guides', 'Terminal opsætning', ['Betalinger', 'pos']),
      entry('b', 'guides', 'Terminal fejl', ['Fejlkoder']),
    ]
    expect(flat(run(entries, 'terminal pos'))).toEqual(['a'])
    expect(flat(run(entries, 'fejlkoder'))).toEqual(['b'])
    expect(flat(run(entries, 'terminal xyz'))).toEqual([])
  })

  it('puts modules before other groups on equal scores and keeps a fixed group order', () => {
    const entries = [
      entry('i', 'improvements', 'Kalender'), entry('g', 'guides', 'Kalender'), entry('m', 'modules', 'Kalender'),
      entry('n', 'notes', 'Kalender'), entry('p', 'people', 'Kalender'),
    ]
    expect(run(entries, 'kalender').map(group => group.group)).toEqual(['modules', 'guides', 'people', 'notes', 'improvements'])
  })

  it('does not search content groups for a single character, but still filters modules', () => {
    const entries = [entry('m', 'modules', 'Kalender'), entry('g', 'guides', 'Kalender guide')]
    expect(flat(run(entries, 'k'))).toEqual(['m'])
  })

  it('caps every group and the total', () => {
    const many = (group: CommandSearchEntry['group'], count: number) => Array.from({ length: count }, (_, index) => entry(`${group}-${index}`, group, `Rapport ${group} ${index}`))
    const groups: CommandSearchEntry['group'][] = ['guides', 'knowledge', 'people', 'notes', 'todos', 'improvements', 'messages']
    const results = run([...many('modules', 3), ...groups.flatMap(group => many(group, 20))], 'rapport')
    for (const result of results) expect(result.entries.length).toBeLessThanOrEqual(MAX_PER_GROUP)
    expect(flat(results).length).toBeLessThanOrEqual(MAX_TOTAL)
    expect(flat(results).length).toBe(MAX_TOTAL)
    expect(results[0].group).toBe('modules')
    expect(results[0].entries).toHaveLength(3)
  })
})

describe('buildCommandSearchEntries', () => {
  const base: CommandSearchSources = { userEmail: ME, teamCode: 'TRR', teamLabel: 'TRR', creatorEmail: 'creator@example.test' }
  const build = (sources: Partial<CommandSearchSources>) => buildCommandSearchEntries({ ...base, ...sources }, labels)
  const ids = (entries: CommandSearchEntry[]) => entries.map(item => item.id).sort()

  it('lists own-team guides and shared guides for my team, not shared guides for other teams', () => {
    const entries = build({
      guides: [
        { id: 'own', title: 'Egen guide', category: 'Proces', tags: ['pos'] },
        { id: 'legacy-shared', title: 'Delt i egen nøgle', sharedWithTeamCodes: ['TRR', 'ABC'] },
      ],
      sharedGuides: [
        { id: 'mine', title: 'Delt med mig', sharedWithTeamCodes: ['ABC', 'TRR'] },
        { id: 'theirs', title: 'Kun for andre', sharedWithTeamCodes: ['ABC', 'XYZ'] },
      ],
      articles: [{ id: 'art', title: 'Artikel', category: 'Fejlkoder' }],
      sharedArticles: [{ id: 'art-shared', title: 'Delt artikel', sharedWithTeamCodes: ['TRR'] }],
    })
    expect(ids(entries.filter(item => item.group === 'guides'))).toEqual(['guides:mine', 'guides:own'])
    expect(ids(entries.filter(item => item.group === 'knowledge'))).toEqual(['knowledge:art', 'knowledge:art-shared'])
    const own = entries.find(item => item.id === 'guides:own')!
    expect(own.detail).toBe('Guide · TRR')
    expect(own.terms).toEqual(['Proces', 'pos'])
    expect(own.target).toEqual({ view: 'guides', params: { itemId: 'own' } })
    expect(entries.find(item => item.id === 'guides:mine')!.detail).toBe('Guide · delt')
    expect(entries.find(item => item.id === 'knowledge:art')!.target).toEqual({ view: 'knowledge', params: { itemId: 'art' } })
  })

  it('ignores shared guides until the current team is known', () => {
    const entries = build({ teamCode: undefined, sharedGuides: [{ id: 's', title: 'Delt', sharedWithTeamCodes: ['TRR'] }] })
    expect(entries).toEqual([])
  })

  it('builds colleagues from own and other teams without the creator or unapproved users and without phone numbers', () => {
    const entries = build({
      users: {
        'anna@example.test': { email: 'anna@example.test', fullName: 'Anna Jensen', role: 'manager' },
        'creator@example.test': { email: 'creator@example.test', fullName: 'Platform Creator' },
        'pending@example.test': { email: 'pending@example.test', fullName: 'Pending Person', status: 'pending' },
        'ben@example.test': { email: 'ben@example.test', fullName: 'Ben Hansen', status: 'approved', phone: '12345678' } as never,
      },
      otherTeams: [{ label: 'ABC', users: { 'cara@example.test': { email: 'cara@example.test', fullName: 'Cara Nielsen' }, 'anna@example.test': { email: 'anna@example.test', fullName: 'Anna Dup' } } }],
    })
    const people = entries.filter(item => item.group === 'people')
    expect(ids(people)).toEqual(['people:anna@example.test', 'people:ben@example.test', 'people:cara@example.test'])
    expect(people.find(item => item.id === 'people:anna@example.test')!.title).toBe('Anna Jensen')
    expect(people.find(item => item.id === 'people:anna@example.test')!.detail).toBe('Kollega · TRR · Manager')
    expect(people.find(item => item.id === 'people:cara@example.test')!.detail).toBe('Kollega · ABC')
    expect(people.find(item => item.id === 'people:cara@example.test')!.target).toEqual({ view: 'team', params: { search: 'Cara Nielsen' } })
    expect(JSON.stringify(people)).not.toContain('12345678')
  })

  it('shows shared notes and only my own personal notes', () => {
    const entries = build({
      notes: [
        { id: 'shared', title: 'Delt note', creatorEmail: 'other@example.test', isPersonal: false, tags: ['proces'] },
        { id: 'mine', title: 'Min private', creatorEmail: 'ME@example.test', isPersonal: true },
        { id: 'theirs', title: 'Andres private hemmelighed', creatorEmail: 'other@example.test', isPersonal: true },
      ],
    })
    expect(ids(entries)).toEqual(['notes:mine', 'notes:shared'])
    expect(entries.find(item => item.id === 'notes:shared')!.detail).toBe('Note · delt')
    expect(entries.find(item => item.id === 'notes:shared')!.target).toEqual({ view: 'notebook', params: { search: 'Delt note', tab: 'shared' } })
    expect(entries.find(item => item.id === 'notes:mine')!.detail).toBe('Note · privat')
    expect(entries.find(item => item.id === 'notes:mine')!.target.params).toEqual({ search: 'Min private', tab: 'personal' })
  })

  it('builds personal and team to-dos that open the right tab', () => {
    const entries = build({
      personalTodos: [{ id: 'p1', title: 'Ring til leverandør', status: 'open' }, { id: 'p2', title: 'Færdig opgave', status: 'completed' }],
      projects: [{ id: 't1', title: 'Lagerflytning', status: 'in-progress' }],
    })
    expect(ids(entries)).toEqual(['todos:personal:p1', 'todos:personal:p2', 'todos:team:t1'])
    expect(entries.find(item => item.id === 'todos:personal:p1')!.target).toEqual({ view: 'projects', params: { tab: 'personal' } })
    expect(entries.find(item => item.id === 'todos:personal:p2')!.detail).toBe('To-do · personlig · færdig')
    expect(entries.find(item => item.id === 'todos:team:t1')!.target).toEqual({ view: 'projects', params: { tab: 'team', search: 'Lagerflytning' } })
  })

  it('lists improvements that are not deleted and opens them by id', () => {
    const entries = build({
      improvements: [
        { id: 'i1', title: 'Hurtigere pakning', status: 'in-progress' },
        { id: 'i2', title: 'Slettet forslag', status: 'new', deletedAt: '2026-01-01T00:00:00Z' },
      ],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].detail).toBe('Forbedring · I gang')
    expect(entries[0].target).toEqual({ view: 'improvements', params: { itemId: 'i1' } })
  })

  it('only lists messages where I am sender or recipient, and mail in folders only when the folder is mine', () => {
    const entries = build({
      users: { 'anna@example.test': { email: 'anna@example.test', fullName: 'Anna Jensen' } },
      folders: [{ id: 'f-mine', userId: ME }, { id: 'f-theirs', userId: 'anna@example.test' }],
      emails: [
        { id: 'in', from: 'anna@example.test', to: ME, subject: 'Rapport klar', timestamp: 3 },
        { id: 'out', from: ME, to: 'anna@example.test', subject: 'Svar på rapport', timestamp: 2 },
        { id: 'foreign', from: 'anna@example.test', to: 'ben@example.test', subject: 'Privat mellem andre', timestamp: 1 },
        { id: 'filed', from: 'anna@example.test', to: ME, subject: 'I min mappe', timestamp: 4, folderId: 'f-mine' },
        { id: 'hidden', from: 'anna@example.test', to: ME, subject: 'I hendes mappe', timestamp: 5, folderId: 'f-theirs' },
        { id: 'blank', from: 'anna@example.test', to: ME, subject: '', timestamp: 6 },
      ],
    }).filter(item => item.group === 'messages')
    expect(ids(entries)).toEqual(['messages:blank', 'messages:filed', 'messages:in', 'messages:out'])
    expect(JSON.stringify(entries)).not.toContain('Privat mellem andre')
    expect(entries.find(item => item.id === 'messages:in')!.detail).toBe('Besked · fra Anna Jensen')
    expect(entries.find(item => item.id === 'messages:in')!.target).toEqual({ view: 'email', params: { search: 'Rapport klar' } })
    expect(entries.find(item => item.id === 'messages:out')!.detail).toBe('Besked · til Anna Jensen')
    expect(entries.find(item => item.id === 'messages:out')!.target).toEqual({ view: 'email', params: { tab: 'sent', search: 'Svar på rapport' } })
    expect(entries.find(item => item.id === 'messages:filed')!.target).toEqual({ view: 'email', params: { tab: 'folder', itemId: 'f-mine', search: 'I min mappe' } })
    expect(entries.find(item => item.id === 'messages:blank')!.title).toBe('(uden emne)')
    expect(entries.find(item => item.id === 'messages:blank')!.target.params).toEqual({})
  })

  it('leaves groups out whose source has not arrived yet', () => {
    expect(build({})).toEqual([])
    expect(build({ notes: [] })).toEqual([])
  })

  it('localises detail lines', () => {
    const [item] = buildCommandSearchEntries({ ...base, improvements: [{ id: 'i', title: 'Idé', status: 'new' }] }, getCommandSearchLabels('sv'))
    expect(item.detail).toBe('Förbättring · Ny')
  })

  it('finds only approved Link Library links that are not reported as suspicious, by title, description or domain', () => {
    const entries = buildCommandSearchEntries({ ...base, links: [
      { id: 'ok', title: 'SAP portal', description: 'Ordrer og fakturaer', category: 'Systemer', domain: 'sap.example.com', status: 'approved' },
      { id: 'pending', title: 'Afventer', domain: 'x.example.com', status: 'pending' },
      { id: 'rejected', title: 'Afvist', domain: 'y.example.com', status: 'rejected' },
      { id: 'hidden', title: 'Mistænkelig', domain: 'z.example.com', status: 'approved', hidden: true },
    ] }, getCommandSearchLabels('da'))
    expect(entries.map(entry => entry.id)).toEqual(['links:ok'])
    expect(entries[0]).toMatchObject({ group: 'links', icon: 'link', detail: 'Link · sap.example.com', target: { view: 'links', params: { itemId: 'ok' } } })
    const index = indexCommandEntries(entries)
    expect(searchCommandEntries(index, 'faktura')[0]?.entries[0]?.id).toBe('links:ok')
  })
})

describe('moduleEntries', () => {
  it('maps modules to entries that navigate to their view', () => {
    expect(moduleEntries([{ id: 'calendar', label: 'Kalender' }])).toEqual([
      { id: 'modules:calendar', group: 'modules', icon: 'calendar', title: 'Kalender', detail: '', terms: [], target: { view: 'calendar' } },
    ])
  })
})
