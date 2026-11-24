import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { NisseSpot } from '@/components/christmas/NisseSpot'
import {
  House, Books, Brain, CalendarBlank, ClipboardText, ShieldCheck, ShieldCheck as ManagerIcon,
  Users, Envelope, ForkKnife, GameController, Kanban, NotePencil, Crown, Buildings, Lightbulb, UserCircle, Lock, CheckSquare, LinkSimple,
} from '@phosphor-icons/react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { useLanguage } from '@/contexts/LanguageContext'
import { useHubNotifications } from '@/contexts/HubNotificationsContext'
import { useCommandSearchRemoteSources } from '@/hooks/useCommandSearchSources'
import { navigateTo, type AppViewId } from '@/lib/appNavigation'
import { useMyHubs } from '@/hooks/useMyHubs'
import { getHubAccessLabels } from '@/lib/hubAccessLabels'
import { requestHubSwitch } from '@/lib/hubSwitch'
import {
  buildCommandSearchEntries, foldSearchText, indexCommandEntries, moduleEntries, searchCommandEntries, type CommandSearchEntry,
} from '@/lib/commandSearch'
import { getCommandSearchLabels } from '@/lib/commandSearchLabels'
import { hasManagerAccess, hasCreatorAccess } from '@/lib/userRoles'
import { getImprovementsLabels } from '@/lib/improvementsLabels'
import { getLinksLabels } from '@/lib/linksLabels'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'

interface CommandPaletteModule {
  id: string
  icon: typeof House
  label: string
  managerOnly?: boolean
  creatorOnly?: boolean
}

interface CommandPaletteProps {
  userEmail: string
}

const CONTENT_ICONS: Record<string, typeof House> = {
  guide: Books, article: Brain, person: UserCircle, note: NotePencil, 'note-personal': Lock,
  todo: CheckSquare, project: Kanban, improvement: Lightbulb, message: Envelope, link: LinkSimple,
}

/** Global hurtig-navigation (Ctrl/Cmd+K): moduler samt guides, artikler, kolleger, noter, to-dos, forbedringer og beskeder. */
export function CommandPalette({ userEmail }: CommandPaletteProps) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const { searchData } = useHubNotifications()
  const remote = useCommandSearchRemoteSources(userEmail, open, true)
  // Content entries are built after the dialog has painted so Ctrl+K opens instantly.
  const contentReady = useDeferredValue(open) && open
  const searchLabels = useMemo(() => getCommandSearchLabels(language), [language])

  useEffect(() => {
    if (!open) { setInputValue(''); setQuery('') }
  }, [open])

  useEffect(() => {
    if (!inputValue.trim()) { setQuery(inputValue); return }
    const timer = setTimeout(() => setQuery(inputValue), 100)
    return () => clearTimeout(timer)
  }, [inputValue])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(current => !current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    hasManagerAccess(userEmail).then(setIsManager)
    hasCreatorAccess(userEmail).then((creator) => {
      setIsCreator(creator)
      if (creator) window.electronRegistry?.listTeams().then((list) => setTeams(list || []))
    })
  }, [userEmail])
  const { hubs } = useMyHubs()
  const hubLabels = getHubAccessLabels(language)

  const defaultModules: CommandPaletteModule[] = [
    { id: 'hub', icon: House, label: language === 'da' ? 'Forside' : language === 'fi' ? 'Alkuun' : language === 'sv' ? 'Hem' : 'Home' },
    { id: 'guides', icon: Books, label: language === 'da' ? 'Guide Bibliotek' : language === 'fi' ? 'Opaskirjasto' : language === 'sv' ? 'Guidebibliotek' : 'Guide Library' },
    { id: 'knowledge', icon: Brain, label: 'Knowledge Base' },
    { id: 'links', icon: LinkSimple, label: getLinksLabels(language).title },
    { id: 'calendar', icon: CalendarBlank, label: language === 'da' ? 'Kalender' : language === 'fi' ? 'Kalenteri' : language === 'sv' ? 'Kalender' : 'Calendar' },
    { id: 'shifts', icon: ClipboardText, label: language === 'da' ? 'Vagtplan' : language === 'fi' ? 'Vaihtoaikataulu' : language === 'sv' ? 'Skiftschema' : 'Shift Schedule' },
    { id: 'team', icon: Users, label: language === 'da' ? 'Team Oversigt' : language === 'fi' ? 'Ryhmän yleiskatsaus' : language === 'sv' ? 'Teamöversikt' : 'Team Overview' },
    { id: 'email', icon: Envelope, label: language === 'da' ? 'Email' : language === 'fi' ? 'Sähköposti' : language === 'sv' ? 'E-post' : 'Email' },
    { id: 'meals', icon: ForkKnife, label: language === 'da' ? 'Madplan' : language === 'fi' ? 'Ateriasuunnitelma' : language === 'sv' ? 'Matsedel' : 'Meal Plan' },
    { id: 'games', icon: GameController, label: language === 'da' ? 'Spilhjørnet' : language === 'fi' ? 'Pelikulma' : language === 'sv' ? 'Spelhörnan' : 'Game Corner' },
    { id: 'projects', icon: Kanban, label: 'To Do' },
    { id: 'improvements', icon: Lightbulb, label: getImprovementsLabels(language).title },
    { id: 'notebook', icon: NotePencil, label: language === 'da' ? 'Notesbog' : language === 'fi' ? 'Muistikirja' : language === 'sv' ? 'Anteckningsbok' : 'Notebook' },
    { id: 'manager', icon: ManagerIcon, label: 'Manager Panel', managerOnly: true },
    { id: 'admin', icon: ShieldCheck, label: 'Admin Panel', managerOnly: true },
    { id: 'creator', icon: Crown, label: 'Creator Panel', creatorOnly: true },
  ]
  const modules = defaultModules
  const visibleModules = useMemo(
    () => modules.filter(m => (!m.managerOnly || isManager) && (!m.creatorOnly || isCreator)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, isManager, isCreator],
  )
  const moduleIcons = useMemo(() => new Map(visibleModules.map(m => [m.id, m.icon])), [visibleModules])

  const contentEntries = useMemo<CommandSearchEntry[]>(() => {
    if (!contentReady) return []
    return buildCommandSearchEntries({
      ...remote.sources,
      userEmail,
      guides: searchData.guides,
      emails: searchData.emails,
      projects: searchData.projects,
      personalTodos: searchData.personalTodos,
      improvements: searchData.improvements,
      links: searchData.links,
    }, searchLabels)
  }, [contentReady, remote.sources, userEmail, searchData, searchLabels])
  const searchIndex = useMemo(
    () => indexCommandEntries([...moduleEntries(visibleModules), ...contentEntries]),
    [visibleModules, contentEntries],
  )
  const results = useMemo(() => searchCommandEntries(searchIndex, query), [searchIndex, query])
  // cmdk does not auto-select the first row when the caller filters, so selection is controlled here.
  const rows = useMemo(() => {
    let next = 0
    return results.map(result => ({ group: result.group, entries: result.entries.map(entry => ({ entry, value: `r${next++}` })) }))
  }, [results])
  const loadingContent = contentReady && remote.loading && foldSearchText(query).length >= 2

  const go = (entry: CommandSearchEntry) => {
    if (entry.group === 'modules') navigateTo(entry.target.view as AppViewId)
    else navigateTo(entry.target.view as AppViewId, entry.target.params)
    setOpen(false)
  }

  // App.tsx switches the team and remounts every module on the new team's data.
  const switchTeam = (folderName: string) => {
    requestHubSwitch(folderName)
    setOpen(false)
  }

  const switchPrefix = language === 'da' ? 'Skift til' : language === 'fi' ? 'Vaihda kohteeseen' : language === 'sv' ? 'Byt till' : 'Switch to'
  const foldedQuery = foldSearchText(query)
  // The creator may open every team; anyone else the hubs the creator gave them.
  const switchable: Array<RegisteredTeam & { pending?: number }> = isCreator ? teams : hubs.length > 1 ? hubs.filter(hub => !hub.active) : []
  const matchingTeams = switchable.filter(team => !foldedQuery || foldSearchText(`${switchPrefix} ${team.name} ${hubLabels.switchHub}`).includes(foldedQuery))
  const showTeams = matchingTeams.length > 0

  const [selected, setSelected] = useState('')
  const firstValue = rows[0]?.entries[0]?.value ?? (showTeams ? 't0' : '')
  const hasValue = (value: string) => rows.some(row => row.entries.some(item => item.value === value)) || (showTeams && /^t\d+$/.test(value) && Number(value.slice(1)) < matchingTeams.length)
  useEffect(() => { setSelected(firstValue) }, [query, open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!hasValue(selected)) setSelected(firstValue) }) // eslint-disable-line react-hooks/exhaustive-deps

  const renderIcon = (entry: CommandSearchEntry) => {
    const Icon = entry.group === 'modules' ? moduleIcons.get(entry.icon) ?? House : CONTENT_ICONS[entry.icon] ?? House
    return <Icon size={18} className="mr-2 shrink-0" />
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      title={language === 'da' ? 'Hurtig-navigation' : language === 'fi' ? 'Nopea navigointi' : language === 'sv' ? 'Snabbnavigering' : 'Quick navigation'}
      description={language === 'da' ? 'Søg i moduler, guides, kolleger, noter, to-dos, forbedringer og beskeder' : language === 'fi' ? 'Etsi moduuleista, oppaista, kollegoista, muistiinpanoista, to-do-tehtävistä, parannuksista ja viesteistä' : language === 'sv' ? 'Sök i moduler, guider, kollegor, anteckningar, uppgifter, förbättringar och meddelanden' : 'Search modules, guides, colleagues, notes, to-dos, improvements and messages'}
    >
      <CommandInput
        value={inputValue}
        onValueChange={setInputValue}
        placeholder={searchLabels.placeholder}
      />
      <div className="relative empty:hidden"><NisseSpot spot="command-palette" pose="hang" className="absolute -top-[3px] right-6" /></div>
      <CommandList>
        {!loadingContent && !showTeams && rows.length === 0 && (
          <CommandEmpty>{language === 'da' ? 'Intet fundet' : language === 'fi' ? 'Mitään ei löytynyt' : language === 'sv' ? 'Inget hittades' : 'Nothing found'}</CommandEmpty>
        )}

        {rows.map(row => (
          <CommandGroup key={row.group} heading={searchLabels.groups[row.group]}>
            {row.entries.map(({ entry, value }) => (
              <CommandItem key={entry.id} value={value} onSelect={() => go(entry)}>
                {renderIcon(entry)}
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                {entry.detail && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{entry.detail}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {loadingContent && <div className="py-3 text-center text-xs text-muted-foreground">{searchLabels.loading}</div>}

        {showTeams && (
          <CommandGroup heading={isCreator ? (language === 'da' ? 'Skift team' : language === 'fi' ? 'Vaihtoryhmä' : language === 'sv' ? 'Byt team' : 'Switch team') : hubLabels.switchHub}>
            {matchingTeams.map((team, index) => (
              <CommandItem
                key={team.teamId}
                value={`t${index}`}
                onSelect={() => switchTeam(team.folderName)}
              >
                <Buildings size={18} className="mr-2" />
                <span className="min-w-0 flex-1 truncate">{language === 'da' ? `Skift til: ${team.name}` : language === 'fi' ? `Vaihda kohteeseen: ${team.name}` : language === 'sv' ? `Byt till: ${team.name}` : `Switch to: ${team.name}`}</span>
                {!!team.pending && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{hubLabels.waiting(team.pending)}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

