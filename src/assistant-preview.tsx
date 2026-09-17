// Isolated development preview. Does not import App or read real hub data.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { HubAssistant } from './components/HubAssistant'
import { LanguageProvider } from './contexts/LanguageContext'
import './main.css'
if (import.meta.env.DEV) {
  window.kv = { get: async () => undefined, set: async () => {}, delete: async () => {}, keys: async () => [], update: async () => [], updateField: async () => ({}), compareAndSet: async (_key, _expected, value) => value, subscribe: () => () => {} }
  window.electronAssistant = {
    status: async () => ({ installed: true, running: false, busy: false, vision: false, freeGiB: 4, model: 'Synthetic preview' }),
    prepare: async () => ({ guideCount: 1, stepCount: 1 }),
    provision: async () => ({ installed: true, running: false, busy: false, vision: false, freeGiB: 4, model: 'Synthetic preview' }),
    onProvisionProgress: () => () => {},
    stop: async () => {}, onContextChanged: () => () => {}, onGuidesChanged: () => () => {},
    ask: async () => { await new Promise(resolve => setTimeout(resolve, 600)); return { mode: 'data', text: 'Dette er et kunstigt testsvar. Cloud-adressen i denne demo er 192.0.2.10. Ingen rigtige hubdata er indlæst.', sources: [] } },
    guide: async () => { throw new Error('Synthetic preview only') }, image: async () => { throw new Error('Synthetic preview only') }, record: async () => ({ title: 'Synthetic preview', text: 'No real data' }),
  }
  function Preview() {
    const [clicks, setClicks] = useState(0)
    return <LanguageProvider userId="isolated-assistant-layout-preview"><main className="min-h-screen bg-[#0c1024] p-8 text-white"><h1 className="text-xl font-semibold">Chat-layout · kunstige testdata</h1><p className="mt-2 text-sm text-slate-400">Ingen forbindelse til guides eller hubdata.</p><button className="mt-6 rounded-xl bg-blue-700 px-5 py-3" onClick={() => setClicks(value => value + 1)}>Brug hubben imens · {clicks} klik</button><div className="mt-8 grid max-w-2xl grid-cols-2 gap-4">{['Opgaver', 'Ferie', 'Madplan', 'Guides'].map(title => <div key={title} className="h-32 rounded-2xl border border-slate-700 bg-slate-900 p-5">{title}</div>)}</div></main><HubAssistant token="synthetic-preview-only" /></LanguageProvider>
  }
  createRoot(document.getElementById('root')!).render(<Preview />)
}
