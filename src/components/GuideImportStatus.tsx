// Monteres på app-roden (uafhængigt af hvilket view der vises), så Word-guide
// import-fremdriften og afslutnings-toasten følger brugeren rundt i hele appen.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileArrowUp } from '@phosphor-icons/react'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { guideImportManager } from '@/lib/guideImportManager'
import { useLanguage } from '@/contexts/LanguageContext'

interface GuideImportStatusProps {
  /** Kaldes når brugeren klikker "Åbn bibliotek" i afslutnings-toasten. */
  onOpenGuideLibrary: () => void
}

export function GuideImportStatus({ onOpenGuideLibrary }: GuideImportStatusProps) {
  const { t } = useLanguage()
  const job = useSyncExternalStore(guideImportManager.subscribe, guideImportManager.getJob)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!job) return
    const tick = () => setElapsedMs(Date.now() - job.startedAt)
    tick()
    const interval = window.setInterval(tick, 200)
    return () => window.clearInterval(interval)
  }, [job?.startedAt])

  // Job'et går tilbage til null når importen er f\u00e6rdig (b\u00e5de ved succes og fejl) —
  // tjek her om der er en afslutningsbesked klar til at blive vist.
  useEffect(() => {
    if (job) return
    const completion = guideImportManager.takeLastCompletion()
    if (!completion) return
    if (completion.error) {
      toast.error(completion.error)
    } else if (completion.title) {
      toast.success(`"${completion.title}" ${t.guideImportStatus.importedSuffix}`, {
        description: t.guideImportStatus.openLibraryDescription,
        action: { label: t.guideImportStatus.openLibrary, onClick: onOpenGuideLibrary },
        duration: 10000,
      })
    }
  }, [job, onOpenGuideLibrary])

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-6 z-50 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border-2 border-border bg-card/95 backdrop-blur-md shadow-2xl p-4 space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <FileArrowUp size={18} weight="bold" className="text-primary animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{t.guideImportStatus.importingGuide}</div>
              <div className="text-xs text-muted-foreground truncate">{job.fileName}</div>
            </div>
            <div className="text-xs font-mono text-muted-foreground shrink-0">
              {(elapsedMs / 1000).toFixed(1)}s
            </div>
          </div>
          <Progress value={job.progress?.percent ?? 3} className="h-2" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {job.progress?.message || t.guideImportStatus.starting}
            </p>
            <p className="text-xs font-semibold text-primary shrink-0">{Math.round(job.progress?.percent ?? 0)} %</p>
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            {t.guideImportStatus.backgroundHint}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
