import { useEffect, useMemo, useState } from 'react'
import { Crown, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useLanguage } from '@/contexts/LanguageContext'
import { getHubAccessLabels } from '@/lib/hubAccessLabels'
import type { ManagerAccessEntry, RegisteredTeam, RegistryUserOption } from '@/lib/electronRegistryBridge'
import { cn } from '@/lib/utils'
import { trackPendingWrite } from '@/lib/pendingWrites'

/** Creator Panel: give a person manager rights in teams other than their own. */
export function CrossTeamManagersCard({ teams }: { teams: RegisteredTeam[] }) {
  const { language } = useLanguage()
  const labels = getHubAccessLabels(language)
  const [entries, setEntries] = useState<ManagerAccessEntry[]>([])
  const [people, setPeople] = useState<RegistryUserOption[]>([])
  const [editing, setEditing] = useState<{ email: string; teamIds: string[]; isNew: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const [removing, setRemoving] = useState<ManagerAccessEntry | null>(null)

  const load = async () => {
    const registry = window.electronRegistry
    if (!registry) return
    try {
      const [access, options] = await Promise.all([registry.listManagerAccess(), registry.listUserOptions('')])
      setEntries(access)
      setPeople(options)
    } catch (error) {
      console.error(error)
      toast.error(labels.loadFailed)
    }
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const teamLabel = (teamId: string | null) => {
    const team = teams.find(item => item.teamId === teamId)
    return team ? team.abbreviation || team.name : teamId || '?'
  }
  const editingPerson = editing ? people.find(person => person.email === editing.email) : undefined
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase()
    return people
      .filter(person => !entries.some(entry => entry.email === person.email))
      .filter(person => !query || person.fullName.toLowerCase().includes(query) || person.email.includes(query))
      .slice(0, 8)
  }, [people, entries, search])

  // Shown and closed at once (the registry write can take a long time on M:); a failed save puts the entry back.
  const save = () => {
    if (!editing?.email) return
    const { email, teamIds } = editing
    const previous = entries.find(entry => entry.email === email)
    const person = people.find(item => item.email === email)
    const shown: ManagerAccessEntry | null = teamIds.length === 0 ? null : {
      email,
      fullName: previous?.fullName || person?.fullName || email,
      homeTeamId: previous?.homeTeamId ?? person?.primaryTeamId ?? null,
      teamIds,
      updatedAt: new Date().toISOString(),
    }
    const putBack = (entry: ManagerAccessEntry | null | undefined) => setEntries(current => {
      const others = current.filter(item => item.email !== email)
      return entry ? [...others, entry].sort((a, b) => a.email.localeCompare(b.email)) : others
    })
    putBack(shown)
    setEditing(null)
    toast.success(labels.saved)
    void trackPendingWrite(window.electronRegistry!.setManagerAccess(email, teamIds)).then(() => load(), error => {
      console.error(error)
      putBack(previous)
      toast.error(labels.saveFailed)
    })
  }

  const remove = (entry: ManagerAccessEntry) => {
    setEntries(current => current.filter(item => item.email !== entry.email))
    toast.success(labels.removed(entry.fullName))
    void trackPendingWrite(window.electronRegistry!.setManagerAccess(entry.email, [])).catch(error => {
      console.error(error)
      setEntries(current => [...current.filter(item => item.email !== entry.email), entry].sort((a, b) => a.email.localeCompare(b.email)))
      toast.error(labels.saveFailed)
    })
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Crown size={28} className="text-primary" weight="duotone" />
          <h2 className="text-2xl font-bold">{labels.sectionTitle}</h2>
        </div>
        <Button onClick={() => { setSearch(''); setEditing({ email: '', teamIds: [], isNew: true }) }} className="gap-2">
          <Plus size={18} weight="bold" />
          {labels.add}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">{labels.sectionDescription}</p>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">{labels.empty}</p>
      ) : (
        <div className="divide-y rounded-md border">
          {entries.map(entry => (
            <div key={entry.email} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{entry.fullName} <Badge variant="secondary" className="ml-1 align-middle">{teamLabel(entry.homeTeamId)}</Badge></div>
                <div className="text-xs text-muted-foreground break-all">{entry.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">{labels.managerIn}</span>
                {entry.teamIds.map(teamId => <Badge key={teamId} variant="outline">{teamLabel(teamId)}</Badge>)}
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label={labels.edit} onClick={() => setEditing({ email: entry.email, teamIds: entry.teamIds, isNew: false })}>
                  <PencilSimple size={18} />
                </Button>
                <Button size="icon" variant="ghost" aria-label={labels.remove} onClick={() => setRemoving(entry)}>
                  <Trash size={18} className="text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.isNew ? labels.dialogTitleAdd : labels.dialogTitleEdit}</DialogTitle>
            <DialogDescription>{labels.sectionDescription}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="cross-team-person">{labels.person}</Label>
                {editing.isNew && !editing.email ? (
                  <>
                    <Input id="cross-team-person" autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder={labels.personPlaceholder} />
                    <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                      {matches.map(person => (
                        <button key={person.email} type="button" className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => setEditing({ ...editing, email: person.email })}>
                          <span className="font-medium">{person.fullName}</span> <span className="text-xs text-muted-foreground">{teamLabel(person.primaryTeamId)} · {person.email}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border px-3 py-2">
                    <span className="font-medium">{editingPerson?.fullName || entries.find(entry => entry.email === editing.email)?.fullName || editing.email}</span>
                    <span className="text-xs text-muted-foreground"> · {editing.email}</span>
                  </div>
                )}
              </div>
              {editing.email && (
                <div className="space-y-2">
                  <Label>{labels.teams}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {teams.map(team => {
                      const own = team.teamId === (editingPerson?.primaryTeamId ?? entries.find(entry => entry.email === editing.email)?.homeTeamId)
                      const checked = editing.teamIds.includes(team.teamId)
                      return (
                        <label key={team.teamId} className={cn('flex items-center gap-2 rounded-md border px-3 py-2', own ? 'opacity-50' : 'cursor-pointer hover:bg-muted')}>
                          <Checkbox
                            disabled={own}
                            checked={checked}
                            onCheckedChange={value => setEditing({ ...editing, teamIds: value === true ? [...editing.teamIds, team.teamId] : editing.teamIds.filter(id => id !== team.teamId) })}
                          />
                          <span className="min-w-0 flex-1 truncate">{team.name}</span>
                          <span className="text-xs text-muted-foreground">{own ? labels.ownTeamHint : team.abbreviation}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{labels.cancel}</Button>
            <Button onClick={save} disabled={!editing?.email || (editing.isNew && editing.teamIds.length === 0)}>{labels.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing ? labels.removeConfirm(removing.fullName) : ''}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (removing) void remove(removing); setRemoving(null) }}>{labels.remove}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
