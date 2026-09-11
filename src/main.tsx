import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { localKv } from './lib/localKvStore'
import { createElectronKv } from './lib/electronKvBridge'
import { withErrorToast } from './lib/kvErrorToast'

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import "./main.css"

// In the desktop app, data lives as files in a shared (network) folder so all
// clients see the same data. In the browser, localStorage is used instead.
async function bootstrap() {
  if (window.electronKv) {
    window.kv = withErrorToast(createElectronKv(window.electronKv))

    // One-time migration: carry over old localStorage data into the shared
    // store the first time the desktop app starts against an empty folder.
    try {
      const [sharedKeys, localKeys] = await Promise.all([window.kv.keys(), localKv.keys()])
      if (sharedKeys.length === 0 && localKeys.length > 0) {
        for (const key of localKeys) {
          const value = await localKv.get(key)
          if (value !== undefined) await window.kv.set(key, value)
        }
      }
    } catch (error) {
      console.error('KV migration from localStorage failed:', error)
    }
  } else {
    window.kv = withErrorToast(localKv)
  }

  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>
  )
}

bootstrap()
