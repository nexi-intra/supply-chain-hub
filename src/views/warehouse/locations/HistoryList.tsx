import { formatDateTime } from '@/lib/warehouse/format'
import { describeEvent, formatDate } from '@/lib/warehouse/locations'
import { t } from '@/lib/warehouse/text'
import type { LocationEvent } from '@/types/warehouse'

const FIELD_LABELS: Record<string, [string, string]> = {
  material: ['Materiale', 'Material'], quantity: ['Antal', 'Quantity'], receivedAt: ['Dato', 'Date'], document: ['49/50-nummer', '49/50 number'],
  serials: ['Serienumre', 'Serial numbers'], tags: ['Mærkater', 'Labels'], note: ['Note', 'Note'], name: ['Navn', 'Name'], area: ['Område', 'Area'],
  type: ['Type', 'Type'], purpose: ['Formål', 'Purpose'], capacity: ['Kapacitet', 'Capacity'], fixedMaterials: ['Faste materialer', 'Fixed materials'], active: ['Aktiv', 'Active'],
  created: ['Oprettet', 'Created'], series: ['Serie', 'Series'],
}

function value(field: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '–'
  if (field === 'receivedAt' && typeof raw === 'number') return formatDate(raw)
  if (Array.isArray(raw)) return raw.length > 3 ? t(`${raw.length} stk.`, `${raw.length} items`) : raw.join(', ') || '–'
  return String(raw)
}

/** Who did what and when, newest first; edits show every changed field before → after. */
export function HistoryList({ events }: { events: LocationEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{t('Ingen historik de seneste 3 måneder.', 'No history in the last 3 months.')}</p>
  return (
    <ol className="space-y-2">
      {events.map(event => (
        <li key={event.id} className="rounded-md border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-medium">{describeEvent(event)}</span>
            {event.material && event.type !== 'location' && <span className="font-mono text-xs text-muted-foreground">{event.material}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{event.by?.name} · {formatDateTime(event.at)}</span>
          </div>
          {event.changes && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {Object.entries(event.changes).map(([field, [before, after]]) => (
                <li key={field}>{FIELD_LABELS[field] ? t(...FIELD_LABELS[field]) : field}: {value(field, before)} → <span className="text-foreground">{value(field, after)}</span></li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}
