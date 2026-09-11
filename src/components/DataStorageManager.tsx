import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FolderOpen, DownloadSimple, UploadSimple, HardDrives, Info, CloudCheck, CloudSlash, ArrowsClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { createBackup, downloadBackup, parseBackup, restoreBackup, type BackupFile } from '@/lib/backup'
import { useStorageConnection } from '@/hooks/useStorageConnection'
import { useLanguage } from '@/contexts/LanguageContext'

interface StorageInfo {
  dataDir: string
  source: 'env' | 'config' | 'user' | 'default'
}

export function DataStorageManager() {
  const { t, language } = useLanguage()
  const sourceLabels: Record<StorageInfo['source'], string> = t.dataStorageManager.sourceLabels
  const isDesktopApp = !!window.electronKv
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const connectionStatus = useStorageConnection()

  useEffect(() => {
    if (isDesktopApp) {
      window.electronKv!.getStorageInfo().then(setStorageInfo).catch(() => {})
    }
  }, [isDesktopApp])

  const handleChooseFolder = async () => {
    setIsBusy(true)
    try {
      const result = await window.electronKv!.chooseDataDir()
      if (result) {
        setStorageInfo({ dataDir: result.dataDir, source: 'user' })
        toast.success(
          result.migratedFiles > 0
            ? `${t.dataStorageManager.folderChangedWithFilesPrefix} ${result.migratedFiles} ${t.dataStorageManager.folderChangedFilesMiddle}`
            : t.dataStorageManager.folderChanged
        )
      }
    } catch (error) {
      console.error('Kunne ikke skifte datamappe:', error)
      toast.error(t.dataStorageManager.folderChangeFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const handleRetrySync = async () => {
    setIsSyncing(true)
    try {
      const result = await window.electronKv!.retrySync()
      if (result.remaining === 0 && result.succeeded > 0) {
        toast.success(`${result.succeeded} ${result.succeeded === 1 ? t.dataStorageManager.changeSingular : t.dataStorageManager.changePlural} ${t.dataStorageManager.syncedSuffix}`)
      } else if (result.failed > 0) {
        toast.error(`${result.failed} ${result.failed === 1 ? t.dataStorageManager.changeSingular : t.dataStorageManager.changePlural} ${t.dataStorageManager.syncFailedSuffix}`)
      } else {
        toast.info(t.dataStorageManager.noConnectionYet)
      }
    } catch (error) {
      console.error('Manuel gensynkronisering fejlede:', error)
      toast.error(t.dataStorageManager.syncNowFailed)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleExport = async () => {
    setIsBusy(true)
    try {
      const backup = await createBackup()
      const filename = downloadBackup(backup)
      toast.success(`${t.dataStorageManager.backupSavedAsPrefix} ${filename} (${Object.keys(backup.data).length} ${t.dataStorageManager.backupSavedDatasetsSuffix})`)
    } catch (error) {
      console.error('Backup-eksport fejlede:', error)
      toast.error(t.dataStorageManager.backupCreateFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const handleImportFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      setPendingImport(backup)
    } catch (error) {
      console.error('Ugyldig backup-fil:', error)
      toast.error(t.dataStorageManager.invalidBackupFile)
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingImport) return
    setIsBusy(true)
    try {
      const count = await restoreBackup(pendingImport)
      toast.success(`${count} ${t.dataStorageManager.datasetsRestoredSuffix}`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      console.error('Backup-import fejlede:', error)
      toast.error(t.dataStorageManager.restoreFailed)
      setIsBusy(false)
    } finally {
      setPendingImport(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.42_0.19_270)] to-[oklch(0.52_0.15_262)] flex items-center justify-center">
            <HardDrives size={24} weight="duotone" className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold">{t.dataStorageManager.whereIsDataTitle}</h3>
            <p className="text-sm text-muted-foreground">
              {t.dataStorageManager.whereIsDataSubtitle}
            </p>
          </div>
        </div>

        {isDesktopApp ? (
          <>
            <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t.dataStorageManager.currentFolderLabel}</p>
              <p className="font-mono text-sm break-all">{storageInfo?.dataDir || t.common.loading}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {storageInfo && (
                  <Badge variant="secondary">{sourceLabels[storageInfo.source]}</Badge>
                )}
                {connectionStatus && (
                  connectionStatus.connected ? (
                    <Badge className="gap-1 bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30">
                      <CloudCheck size={14} weight="fill" />
                      {t.dataStorageManager.connected}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <CloudSlash size={14} weight="fill" />
                      {connectionStatus.startedDisconnected ? t.dataStorageManager.disconnectedLocalMode : t.dataStorageManager.connectionLost}
                    </Badge>
                  )
                )}
              </div>
              {connectionStatus && !connectionStatus.connected && (
                <p className="text-xs text-muted-foreground pt-1">
                  {connectionStatus.startedDisconnected
                    ? t.dataStorageManager.startedDisconnectedHint
                    : t.dataStorageManager.reconnectingHint}
                </p>
              )}
              {connectionStatus && connectionStatus.pendingSyncCount > 0 && (
                <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{connectionStatus.pendingSyncCount}</span>{' '}
                    {connectionStatus.pendingSyncCount === 1 ? t.dataStorageManager.pendingChangeSingularSuffix : t.dataStorageManager.pendingChangePluralSuffix} {t.dataStorageManager.pendingSyncSuffix}
                  </p>
                  <Button
                    onClick={handleRetrySync}
                    disabled={isSyncing}
                    size="sm"
                    variant="outline"
                    className="gap-2 shrink-0"
                  >
                    <ArrowsClockwise size={14} className={isSyncing ? 'animate-spin' : ''} />
                    {t.dataStorageManager.retry}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info size={18} className="shrink-0 mt-0.5" />
              <p>
                {t.dataStorageManager.folderInfoText}
              </p>
            </div>
            <Button onClick={handleChooseFolder} disabled={isBusy} className="gap-2">
              <FolderOpen size={18} />
              {t.dataStorageManager.chooseFolder}
            </Button>
          </>
        ) : (
          <div className="flex items-start gap-2 text-sm text-muted-foreground rounded-lg border bg-muted/40 p-4">
            <Info size={18} className="shrink-0 mt-0.5" />
            <p>
              {t.dataStorageManager.browserNotice}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[oklch(0.34_0.14_273)] to-[oklch(0.42_0.13_270)] flex items-center justify-center">
            <DownloadSimple size={24} weight="duotone" className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold">{t.dataStorageManager.backupTitle}</h3>
            <p className="text-sm text-muted-foreground">
              {t.dataStorageManager.backupSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info size={18} className="shrink-0 mt-0.5" />
          <p>
            {t.dataStorageManager.backupInfoText}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleExport} disabled={isBusy} className="gap-2">
            <DownloadSimple size={18} />
            {t.dataStorageManager.exportBackup}
          </Button>
          <Button
            variant="outline"
            disabled={isBusy}
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadSimple size={18} />
            {t.dataStorageManager.importBackup}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      <AlertDialog open={!!pendingImport} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.dataStorageManager.restoreDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingImport && (
                <>
                  {t.dataStorageManager.restoreDialogFromPrefix} {new Date(pendingImport.exportedAt).toLocaleString(language === 'en' ? 'en-US' : 'da-DK')} {t.dataStorageManager.restoreDialogContainsMiddle}{' '}
                  {Object.keys(pendingImport.data).length} {t.dataStorageManager.restoreDialogDatasetsMiddle}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmImport}>{t.dataStorageManager.restoreAction}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
