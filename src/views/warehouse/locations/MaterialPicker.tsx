import { useEffect, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from '@/lib/warehouse/text'

type Suggestion = { material: string; description: string }
const SUGGESTIONS = 8

/**
 * A material field with suggestions while typing (material numbers by prefix, SAP descriptions by words). A scanner
 * types the whole number and Enter: an exact number wins over the highlighted suggestion.
 */
export function MaterialPicker({ value, chosen, onValueChange, onChoose, label, listId, placeholder, autoFocus, className, icon }: {
  value: string
  /** The chosen material, so its own suggestion list stays closed. */
  chosen: string | null
  onValueChange: (value: string) => void
  onChoose: (material: string) => void
  label: string
  listId: string
  placeholder?: string
  autoFocus?: boolean
  className?: string
  icon?: ReactNode
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const bridge = window.electronWarehouse!.locations

  useEffect(() => {
    const text = value.trim()
    if (!text || text.toUpperCase() === chosen) { setSuggestions([]); return }
    let current = true
    const timer = window.setTimeout(() => {
      bridge.search({ query: text })
        .then(found => { if (current) { setSuggestions(found.materials.slice(0, SUGGESTIONS)); setActive(0); setOpen(true) } })
        .catch(() => {})
    }, 150)
    return () => { current = false; window.clearTimeout(timer) }
  }, [bridge, value, chosen])

  function choose(code: string) {
    onChoose(code)
    setSuggestions([])
    setOpen(false)
  }

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, suggestions.length - 1)) }
    else if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
    else if (event.key === 'Enter') {
      event.preventDefault()
      const exact = suggestions.find(item => item.material === value.trim().toUpperCase())
      const pick = exact || (open ? suggestions[active] : null) || (suggestions.length === 1 ? suggestions[0] : null)
      if (pick) choose(pick.material)
      else if (value.trim()) choose(value.trim().toUpperCase())
    }
  }

  const showList = open && suggestions.length > 0
  return (
    <div className="relative">
      {icon}
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={onKey}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={cn('font-mono', className)}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {suggestions.map((item, index) => (
            <li key={item.material} role="option" aria-selected={index === active}
              onMouseDown={event => { event.preventDefault(); choose(item.material) }}
              onMouseEnter={() => setActive(index)}
              className={cn('flex cursor-pointer items-baseline gap-3 px-3 py-2 text-sm', index === active ? 'bg-primary/10' : '')}>
              <span className="font-mono font-semibold">{item.material}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.description || t('Ingen beskrivelse fra SAP endnu', 'No description from SAP yet')}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !suggestions.length && value.trim() && !chosen && (
        <p className="mt-1 text-xs text-muted-foreground">{t('Intet materiale i Placeringer passer endnu – tryk Enter for at bruge nummeret.', 'No material in Locations matches yet – press Enter to use the number.')}</p>
      )}
    </div>
  )
}
