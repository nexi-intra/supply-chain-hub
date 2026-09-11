import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DownloadSimple, Sparkle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import type { UpdateManifest, UpdateProgress } from '@/lib/electronUpdatesBridge'

// Global opdaterings-popup: lytter på broadcasts fra main-processen og viser
// en dialog, når der ligger en nyere version i den fælles updates-mappe.
export function UpdateNotification() {
  const { language } = useLanguage()
  const [manifest, setManifest] = useState<UpdateManifest | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)

  const da = language === 'da'

  useEffect(() => {
    const api = window.electronUpdates
    if (!api) return

    api.getStatus().then((status) => {
      setCurrentVersion(status.currentVersion)
      if (status.updateAvailable && status.manifest) {
        setManifest(status.manifest)
      }
    }).catch(() => {})

    const unsubscribeAvailable = api.onUpdateAvailable((newManifest) => {
      setManifest(newManifest)
    })
    const unsubscribeProgress = api.onProgress((update) => {
      setProgress(update)
      if (update.phase === 'error') setIsInstalling(false)
    })

    return () => {
      unsubscribeAvailable()
      unsubscribeProgress()
    }
  }, [])

  if (!window.electronUpdates || !manifest) return null

  const open = manifest.version !== dismissedVersion

  const phaseLabel = (phase: UpdateProgress['phase']) => {
    if (da) {
      return {
        comparing: 'Finder ændrede filer…',
        downloading: 'Henter opdatering…',
        verifying: 'Kontrollerer filen…',
        extracting: 'Pakker ud…',
        ready: 'Klar — genstarter…',
        restarting: 'Genstarter appen…',
        error: 'Opdateringen fejlede',
      }[phase]
    }
    return {
      comparing: 'Finding changed files…',
      downloading: 'Downloading update…',
      verifying: 'Verifying file…',
      extracting: 'Extracting…',
      ready: 'Ready — restarting…',
      restarting: 'Restarting the app…',
      error: 'The update failed',
    }[phase]
  }

  const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

  const handleInstall = async () => {
    setIsInstalling(true)
    setProgress({ phase: 'downloading', percent: 0 })
    try {
      await window.electronUpdates!.install()
      // Appen genstarter selv — herefter sker der ikke mere i denne proces.
    } catch (error) {
      console.error('Opdatering fejlede:', error)
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : da ? 'Opdateringen kunne ikke startes' : 'The update could not be started'
      )
      setIsInstalling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isInstalling) setDismissedVersion(manifest.version) }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle size={22} weight="duotone" className="text-primary" />
            {da ? 'Ny version tilgængelig' : 'New version available'}
          </DialogTitle>
          <DialogDescription>
            {da
              ? 'Opdateringen hentes i baggrunden, mens du kan arbejde videre. Når den er klar, genstarter appen selv — alle data bevares.'
              : 'The update downloads in the background while you keep working. When it is ready the app restarts itself and all data is kept.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{da ? 'Nuværende' : 'Current'}: {currentVersion || '…'}</Badge>
            <span className="text-muted-foreground">→</span>
            <Badge>{da ? 'Ny' : 'New'}: {manifest.version}</Badge>
          </div>
          {manifest.notes && !isInstalling && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {da ? 'Nyt i denne version' : "What's new"}
              </p>
              <p className="text-sm whitespace-pre-wrap">{manifest.notes}</p>
            </div>
          )}
          {isInstalling && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{phaseLabel(progress.phase)}</span>
                {(progress.phase === 'downloading' || progress.phase === 'comparing') && (
                  <span className="font-medium tabular-nums">{progress.percent}%</span>
                )}
              </div>
              <Progress value={progress.phase === 'ready' || progress.phase === 'restarting' ? 100 : progress.percent} />
              {progress.phase === 'downloading' && progress.totalBytes !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {progress.fileCount !== undefined
                    ? (da
                      ? `Kun ændrede filer hentes: ${progress.fileCount} filer (${formatMb(progress.totalBytes)})`
                      : `Only changed files are downloaded: ${progress.fileCount} files (${formatMb(progress.totalBytes)})`)
                    : formatMb(progress.totalBytes)}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setDismissedVersion(manifest.version)} disabled={isInstalling}>
            {da ? 'Senere' : 'Later'}
          </Button>
          <Button onClick={handleInstall} disabled={isInstalling} className="gap-2">
            <DownloadSimple size={18} />
            {isInstalling ? (da ? 'Opdaterer…' : 'Updating…') : (da ? 'Opdater nu' : 'Update now')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
