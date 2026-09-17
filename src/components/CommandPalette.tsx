import { useEffect, useState } from 'react'
import {
  House, Books, CalendarBlank, ClipboardText, ShieldCheck, ShieldCheck as ManagerIcon,
  Users, Envelope, ForkKnife, GameController, Kanban, NotePencil, Crown, Buildings,
} from '@phosphor-icons/react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { useLanguage } from '@/contexts/LanguageContext'
import { navigateTo, type AppViewId } from '@/lib/appNavigation'
import { hasManagerAccess, hasCreatorAccess } from '@/lib/userRoles'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'

export interface CommandPaletteModule {
  id: string
  icon: typeof House
  label: string
  managerOnly?: boolean
  creatorOnly?: boolean
}

interface CommandPaletteProps {
  userEmail: string
  modulesOverride?: CommandPaletteModule[]
  onNavigateOverride?: (view: string) => void
}

/** Global hurtig-navigation (Ctrl/Cmd+K) mellem moduler. */
export function CommandPalette({ userEmail, modulesOverride, onNavigateOverride }: CommandPaletteProps) {
  const { language } = useLanguage()
  const usesCustomNavigation = Boolean(modulesOverride)
  const [open, setOpen] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [isCreator, setIsCreator] = useState(false)
  const [teams, setTeams] = useState<RegisteredTeam[]>([])

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
    if (usesCustomNavigation) return
    hasManagerAccess(userEmail).then(setIsManager)
    hasCreatorAccess(userEmail).then((creator) => {
      setIsCreator(creator)
      if (creator) window.electronRegistry?.listTeams().then((list) => setTeams(list || []))
    })
  }, [userEmail, usesCustomNavigation])

  const defaultModules: CommandPaletteModule[] = [
    { id: 'hub', icon: House, label: language === 'da' ? 'Forside' : language === 'fi' ? 'Alkuun' : 'Home' },
    { id: 'guides', icon: Books, label: language === 'da' ? 'Guide Bibliotek' : language === 'fi' ? 'Opaskirjasto' : 'Guide Library' },
    { id: 'calendar', icon: CalendarBlank, label: language === 'da' ? 'Kalender' : language === 'fi' ? 'Kalenteri' : 'Calendar' },
    { id: 'shifts', icon: ClipboardText, label: language === 'da' ? 'Vagtplan' : language === 'fi' ? 'Vaihtoaikataulu' : 'Shift Schedule' },
    { id: 'team', icon: Users, label: language === 'da' ? 'Team Oversigt' : language === 'fi' ? 'Ryhmän yleiskatsaus' : 'Team Overview' },
    { id: 'email', icon: Envelope, label: language === 'da' ? 'Email' : language === 'fi' ? 'Sähköposti' : 'Email' },
    { id: 'meals', icon: ForkKnife, label: language === 'da' ? 'Madplan' : language === 'fi' ? 'Ateriasuunnitelma' : 'Meal Plan' },
    { id: 'games', icon: GameController, label: language === 'da' ? 'Spilhjørnet' : language === 'fi' ? 'Pelikulma' : 'Game Corner' },
    { id: 'projects', icon: Kanban, label: 'To Do' },
    { id: 'notebook', icon: NotePencil, label: language === 'da' ? 'Notesbog' : language === 'fi' ? 'Muistikirja' : 'Notebook' },
    { id: 'manager', icon: ManagerIcon, label: 'Manager Panel', managerOnly: true },
    { id: 'admin', icon: ShieldCheck, label: 'Admin Panel', managerOnly: true },
    { id: 'creator', icon: Crown, label: 'Creator Panel', creatorOnly: true },
  ]
  const modules = modulesOverride || defaultModules

  const go = (view: string) => {
    if (onNavigateOverride) onNavigateOverride(view)
    else navigateTo(view as AppViewId)
    setOpen(false)
  }

  // Skifter storen om til et andet team og lander på Hub bagefter (den aktuelt
  // viste side ville ellers vise data fra det GAMLE team indtil den selv genindlæser).
  const switchTeam = async (folderName: string) => {
    await window.electronRegistry?.switchToTeam(folderName)
    navigateTo('hub')
    setOpen(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={language === 'da' ? 'Hurtig-navigation' : language === 'fi' ? 'Nopea navigointi' : 'Quick navigation'}
      description={language === 'da' ? 'Naviger mellem moduler i Supply Chain Hub' : language === 'fi' ? 'Navigoi Supply Chain Hub -moduulien välillä' : 'Navigate between Supply Chain Hub modules'}
    >
      <CommandInput placeholder={language === 'da' ? 'Søg efter et modul…' : language === 'fi' ? 'Etsi moduulia...' : 'Search for a module…'} />
      <CommandList>
        <CommandEmpty>{language === 'da' ? 'Intet fundet' : language === 'fi' ? 'Mitään ei löytynyt' : 'Nothing found'}</CommandEmpty>

        <CommandGroup heading={language === 'da' ? 'Moduler' : language === 'fi' ? 'Moduulit' : 'Modules'}>
          {modules.filter(m => (!m.managerOnly || isManager) && (!m.creatorOnly || isCreator)).map(m => {
            const Icon = m.icon
            return (
              <CommandItem key={m.id} value={m.label} onSelect={() => go(m.id)}>
                <Icon size={18} className="mr-2" />
                {m.label}
              </CommandItem>
            )
          })}
        </CommandGroup>

        {!modulesOverride && isCreator && teams.length > 0 && (
          <CommandGroup heading={language === 'da' ? 'Skift team' : language === 'fi' ? 'Vaihtoryhmä' : 'Switch team'}>
            {teams.map(team => (
              <CommandItem
                key={team.teamId}
                value={`${language === 'da' ? 'Skift til' : language === 'fi' ? 'Vaihda kohteeseen' : 'Switch to'} ${team.name}`}
                onSelect={() => switchTeam(team.folderName)}
              >
                <Buildings size={18} className="mr-2" />
                {language === 'da' ? `Skift til: ${team.name}` : language === 'fi' ? `Vaihda kohteeseen: ${team.name}` : `Switch to: ${team.name}`}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

