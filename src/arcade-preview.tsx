// Isolated, development-only arcade preview. Never loads the main app or hub data.
import { createRoot } from 'react-dom/client'
import { Arcade } from './views/Arcade'
import { LanguageProvider } from './contexts/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { localKv, type KvStore } from './lib/localKvStore'
import './main.css'

if (import.meta.env.DEV) {
  const prefix = 'arcade-preview:'
  const previewKv: KvStore = {
    get: key => localKv.get(prefix + key),
    set: (key, value) => localKv.set(prefix + key, value),
    delete: key => localKv.delete(prefix + key),
    keys: async () => (await localKv.keys()).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)),
    update: (key, operation) => localKv.update(prefix + key, operation),
    updateField: (key, operation) => localKv.updateField(prefix + key, operation),
    compareAndSet: (key, expected, value) => localKv.compareAndSet(prefix + key, expected, value),
    subscribe: listener => localKv.subscribe(keys => {
      const changed = keys.filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
      if (changed.length > 0) listener(changed)
    }),
  }

  window.kv = previewKv
  createRoot(document.getElementById('root')!).render(
    <ThemeProvider userId="arcade-preview">
      <LanguageProvider userId="arcade-preview">
        <div className="bg-background px-4 py-2 text-center text-sm text-foreground">
          Spiltest · kun browserlokale testdata, ingen forbindelse til hubbens data
        </div>
        <Arcade onNavigateBack={() => {}} userEmail="arcade.preview@example.test" />
      </LanguageProvider>
    </ThemeProvider>,
  )
}
