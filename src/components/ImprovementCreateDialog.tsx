import { useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CUSTOM_CATEGORY_LIMIT, IMPROVEMENT_CATEGORIES, customImprovementCategories, resolveImprovementCategory, type ImprovementSnapshot } from '@/lib/improvements'
import type { ImprovementsLabels } from '@/lib/improvementsLabels'
import { ImprovementActionError, type ImprovementActions } from './ImprovementCaseDialog'

const NEW_CATEGORY = '__new__'

export interface ImprovementCreateDialogProps {
  snapshot: ImprovementSnapshot
  labels: ImprovementsLabels
  actions: ImprovementActions
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImprovementCreateDialog({ snapshot, labels, actions, open, onOpenChange }: ImprovementCreateDialogProps) {
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [proposal, setProposal] = useState('')
  const [category, setCategory] = useState<string>('process')
  const [newCategory, setNewCategory] = useState('')
  const [affectedTeams, setAffectedTeams] = useState<string[]>([])
  const [ownerEmail, setOwnerEmail] = useState('')
  const disabled = actions.busy || actions.blocked
  const customCategories = customImprovementCategories(snapshot.cases)
  const chosenCategory = category === NEW_CATEGORY ? resolveImprovementCategory(newCategory, snapshot.cases, labels.categories) : category
  const owners = snapshot.people.filter(person => person.invitable !== false).sort((a, b) => a.fullName.localeCompare(b.fullName))
  const teamName = (code: string) => snapshot.teams.find(team => team.folderName === code)?.name || code
  const incomplete = !title.trim() || !problem.trim() || !chosenCategory || !owners.some(person => person.email === ownerEmail)

  return (
    <Dialog open={open} onOpenChange={value => { if (!actions.busy) onOpenChange(value) }}>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-2xl sm:p-6 [&>button:last-child]:hidden [&_button]:max-w-full [&_button]:whitespace-normal [&_button:not([aria-label])]:h-auto [&_button:not([aria-label])]:min-h-9">
        <DialogHeader className="pr-10 text-left"><DialogTitle className="text-lg leading-snug">{labels.newSuggestion}</DialogTitle></DialogHeader>
        <Button type="button" size="icon" variant="ghost" title={labels.close} aria-label={labels.close} className="absolute right-3 top-3"
          disabled={actions.busy} onClick={() => onOpenChange(false)}><X size={20} /></Button>
        <ImprovementActionError actions={actions} labels={labels} />
        {actions.busy && <p role="status" className="text-sm text-muted-foreground">{labels.saving}</p>}
        <form onSubmit={event => {
          event.preventDefault()
          if (disabled || incomplete || !chosenCategory) return
          actions.command({ type: 'create', title: title.trim(), problem: problem.trim(), proposal: proposal.trim(), category: chosenCategory,
            affectedTeamCodes: affectedTeams.filter(code => snapshot.teams.some(team => team.folderName === code)), ownerEmail,
          }, () => {
            setTitle(''); setProblem(''); setProposal(''); setCategory('process'); setNewCategory(''); setAffectedTeams([]); setOwnerEmail('')
            onOpenChange(false)
          })
        }}>
          <fieldset disabled={disabled} className="min-w-0 space-y-4">
            <div className="space-y-1"><Label htmlFor="improvement-create-title">{labels.caseTitle} *</Label>
              <Input id="improvement-create-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={240} autoFocus /></div>
            <div className="space-y-1"><Label htmlFor="improvement-create-problem">{labels.problem} *</Label>
              <Textarea id="improvement-create-problem" value={problem} onChange={event => setProblem(event.target.value)} required rows={4} maxLength={8000} /></div>
            <div className="space-y-1"><Label htmlFor="improvement-create-proposal">{labels.proposal}</Label>
              <Textarea id="improvement-create-proposal" value={proposal} onChange={event => setProposal(event.target.value)} rows={3} maxLength={8000} /></div>
            <div className="space-y-1"><Label htmlFor="improvement-create-category">{labels.category}</Label>
              <select id="improvement-create-category" value={category} onChange={event => setCategory(event.target.value)}
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <optgroup label={labels.standardCategories}>
                  {IMPROVEMENT_CATEGORIES.map(value => <option key={value} value={value}>{labels.categories[value]}</option>)}
                </optgroup>
                {customCategories.length > 0 && <optgroup label={labels.customCategories}>
                  {customCategories.map(value => <option key={value} value={value}>{value}</option>)}
                </optgroup>}
                <option value={NEW_CATEGORY}>{labels.newCategory}</option>
              </select></div>
            {category === NEW_CATEGORY && <div className="space-y-1"><Label htmlFor="improvement-create-new-category">{labels.newCategoryName} *</Label>
              <Input id="improvement-create-new-category" value={newCategory} onChange={event => setNewCategory(event.target.value)} required
                maxLength={CUSTOM_CATEGORY_LIMIT} autoFocus aria-describedby="improvement-create-new-category-hint" />
              <p id="improvement-create-new-category-hint" className="text-xs text-muted-foreground">{labels.newCategoryHint}</p></div>}
            <div className="space-y-1"><Label htmlFor="improvement-create-owner">{labels.owner} *</Label>
              <select id="improvement-create-owner" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} required aria-describedby="improvement-create-owner-hint"
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{labels.selectPerson}</option>
                {owners.map(person => <option key={person.email} value={person.email}>{person.fullName} / {teamName(person.teamCode)}</option>)}
              </select>
              <p id="improvement-create-owner-hint" className="text-xs text-muted-foreground">{labels.ownerHint}</p></div>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">{labels.affectedTeams}</legend>
              {snapshot.teams.length ? <div className="grid min-w-0 gap-2 sm:grid-cols-2">{snapshot.teams.map(team => <label key={team.folderName} className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={affectedTeams.includes(team.folderName)} className="mt-1 shrink-0 accent-primary"
                  onChange={event => setAffectedTeams(current => event.target.checked ? [...current, team.folderName] : current.filter(code => code !== team.folderName))} />
                <span className="break-words">{team.name}</span>
              </label>)}</div> : <p className="text-sm text-muted-foreground">{labels.noTeams}</p>}
            </fieldset>
          </fieldset>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" disabled={actions.busy} onClick={() => onOpenChange(false)}>{labels.cancel}</Button>
            <Button type="submit" disabled={disabled || incomplete}><Plus size={18} />{actions.busy ? labels.saving : labels.create}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}