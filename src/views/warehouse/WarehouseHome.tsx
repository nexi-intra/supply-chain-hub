import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Barcode, ClipboardText, Clock, Cpu, IdentificationCard, MapPin, Package } from '@phosphor-icons/react'
import { SectionTile } from '@/components/arcade/SectionTile'
import { t } from '@/lib/warehouse/text'
import { withoutDeleted } from './pendingDeletes'
import type { WarehouseUser } from '@/types/warehouse'

export type WarehouseTool = 'timeclock' | 'counts' | 'locations' | 'softwareload'

interface ToolTile {
  id: WarehouseTool
  title: string
  description: string
  art: ReactNode
}

function LocationsArt() {
  return (
    <span className="section-art-warehouse">
      <Package className="section-warehouse-side" size={34} weight="duotone" />
      <MapPin className="section-warehouse-main" size={60} weight="duotone" />
      <Package className="section-warehouse-side" size={44} weight="duotone" />
    </span>
  )
}

function CountsArt() {
  return (
    <span className="section-art-warehouse">
      <ClipboardText className="section-warehouse-main" size={60} weight="duotone" />
      <Barcode className="section-warehouse-side" size={46} weight="duotone" />
    </span>
  )
}

function TimeclockArt() {
  return (
    <span className="section-art-warehouse">
      <Clock className="section-warehouse-main" size={60} weight="duotone" />
      <IdentificationCard className="section-warehouse-side" size={46} weight="duotone" />
    </span>
  )
}

function SoftwareloadArt() {
  return (
    <span className="section-art-warehouse">
      <Cpu className="section-warehouse-main" size={60} weight="duotone" />
      <Barcode className="section-warehouse-side" size={46} weight="duotone" />
    </span>
  )
}

/** The tools of Arbejdsværktøjer, Stempelkort first (used every day by everyone). A new tool gets a tile here and its own view in Warehouse.tsx. */
const tools = (): ToolTile[] => [
  {
    id: 'timeclock',
    title: t('Stempelkort', 'Time card'),
    description: t('Stempl ind og ud på dine opgaver: start, pause og stop. Kun managere ser de gemte tider.', 'Clock in and out on your tasks: start, break and stop. Only managers see the saved times.'),
    art: <TimeclockArt />,
  },
  {
    id: 'locations',
    title: t('Placeringer', 'Locations'),
    description: t('Hvor står pallerne? Sæt på plads, tag den ældste først, flyt paller og fyld pluk-pladser op.', 'Where are the pallets? Put away, take the oldest first, move pallets and refill pick places.'),
    art: <LocationsArt />,
  },
  {
    id: 'counts',
    title: t('Optælling', 'Stock count'),
    description: t('Kvartalets statusoptælling: scanning, godkendelse, SAP-dokumenter og arkiv.', 'The quarterly stock count: scanning, approval, SAP documents and archive.'),
    art: <CountsArt />,
  },
  {
    id: 'softwareload',
    title: 'Softwareload',
    description: t('Start en opgave, scan terminalerne og lad appen flytte dem i SAP. Søg på et serienummer for at se hvem der loadede det.', 'Start a task, scan the terminals and let the app move them in SAP. Search a serial number to see who loaded it.'),
    art: <SoftwareloadArt />,
  },
]

/** The Arbejdsværktøjer hub: one large tile per tool, like the sections of the Game Corner. */
export function WarehouseHome({ user, onOpen }: { user: WarehouseUser; onOpen: (tool: WarehouseTool) => void }) {
  // A short live line on the Optælling tile; the page works without it if the drive cannot be read.
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    window.electronWarehouse?.statuses.overview()
      .then(raw => { const overview = withoutDeleted(raw); if (current && overview.active) setActiveStatus(`${overview.active.name} · ${overview.active.progress.percent} %`) })
      .catch(() => {})
    return () => { current = false }
  }, [user.team])

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <p className="text-sm text-muted-foreground">{t(`Arbejdsværktøjer for team ${user.team}. Vælg et værktøj.`, `Work tools for team ${user.team}. Choose a tool.`)}</p>
      <div className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
        {tools().map((tool, index) => (
          <motion.div key={tool.id} className="h-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.4 }}>
            <SectionTile
              game={`section-warehouse-${tool.id}`}
              title={tool.title}
              label={tool.title}
              description={tool.id === 'counts' && activeStatus ? `${tool.description} ${t('Igangværende', 'In progress')}: ${activeStatus}` : tool.description}
              cta={t('Åbn', 'Open')}
              art={tool.art}
              onClick={() => onOpen(tool.id)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
