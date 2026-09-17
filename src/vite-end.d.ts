/// <reference types="vite/client" />
import type { KvStore } from './lib/localKvStore'
import type { ElectronKvApi } from './lib/electronKvBridge'
import type { ElectronUpdatesApi } from './lib/electronUpdatesBridge'
import type { ElectronGuidesApi, ElectronTranslationApi, ElectronShellApi } from './lib/electronGuidesBridge'
import type { ElectronRegistryApi } from './lib/electronRegistryBridge'
import type { ElectronAuthApi } from './lib/electronAuthBridge'
import type { BackupFile } from './lib/backup'

declare global {
  interface Window {
    electronAuth?: ElectronAuthApi
    electronAccounts?: {
      status(): Promise<{ id: string; state: string; oldEmail: string; newEmail: string; applied: number; total: number; teamId: string } | null>
      resume(id: string): Promise<{ state: string }>
      rollback(id: string): Promise<{ state: string }>
    }
    electronBackup?: { export(): Promise<BackupFile>; restore?(backup: BackupFile): Promise<number> }
    kv: KvStore
    /** Present only when running inside the Electron desktop app. */
    electronKv?: ElectronKvApi
    /** Present only when running inside the Electron desktop app. */
    electronUpdates?: ElectronUpdatesApi
    /** Present only when running inside the Electron desktop app. */
    electronGuides?: ElectronGuidesApi
    /** Present only when running inside the Electron desktop app. */
    electronTranslation?: ElectronTranslationApi
    /** Present only when running inside the Electron desktop app. */
    electronRegistry?: ElectronRegistryApi
    /** Present only when running inside the Electron desktop app. */
    electronShell?: ElectronShellApi
  }
}

export {}
