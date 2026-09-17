import type { ReactNode } from 'react'
import { GearSix, Minus, X } from '@phosphor-icons/react'
import { HubertIcon } from './HubertIcon'

export const CHAT_WIDTHS = { compact: 360, standard: 440, wide: 560 } as const
export type ChatWidth = keyof typeof CHAT_WIDTHS
const TEXT = {
  da: { title: 'Hubert', settings: 'Indstillinger', width: 'Bredde', compact: 'Smal', standard: 'Normal', wide: 'Bred', minimize: 'Minimér', close: 'Luk' },
  en: { title: 'Hubert', settings: 'Settings', width: 'Width', compact: 'Compact', standard: 'Standard', wide: 'Wide', minimize: 'Minimize', close: 'Close' },
  fi: { title: 'Hubert', settings: 'Asetukset', width: 'Leveys', compact: 'Kapea', standard: 'Normaali', wide: 'Leveä', minimize: 'Pienennä', close: 'Sulje' },
}
export function AssistantChatWindow({ language, width, onWidthChange, onMinimize, onClose, status, ready, settings, children }: {
  language: 'da' | 'en' | 'fi'; width: ChatWidth; onWidthChange: (value: ChatWidth) => void
  onMinimize: () => void; onClose: () => void; status: string; ready: boolean; settings: ReactNode; children: ReactNode
}) {
  const t = TEXT[language]
  return <section aria-label={t.title} data-assistant-window className="fixed bottom-5 right-5 z-40 flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-[0_20px_70px_rgba(0,0,0,0.35)]" style={{ width: `min(${CHAT_WIDTHS[width]}px, calc(100vw - 24px))`, height: 'min(620px, calc(100dvh - 40px))' }}>
    <header className="relative flex h-14 shrink-0 items-center gap-2 bg-[#142052] px-3 text-white">
      <HubertIcon size={25} className="shrink-0" />
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t.title}</h2>
      <span role="status" aria-label={status} title={status} className={`h-2 w-2 shrink-0 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <details className="group">
        <summary aria-label={t.settings} title={t.settings} className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden"><GearSix size={18} /></summary>
        <div className="absolute right-3 top-12 z-10 w-56 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl">
          <label className="flex items-center justify-between gap-3 text-xs">{t.width}<select aria-label={t.width} value={width} onChange={event => onWidthChange(event.target.value as ChatWidth)} className="rounded-md border bg-background px-2 py-1.5 text-xs"><option value="compact">{t.compact}</option><option value="standard">{t.standard}</option><option value="wide">{t.wide}</option></select></label>
          <div className="mt-3 space-y-3 border-t pt-3">{settings}</div>
        </div>
      </details>
      <button type="button" aria-label={t.minimize} title={t.minimize} onClick={onMinimize} className="flex size-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"><Minus size={18} /></button>
      <button type="button" aria-label={t.close} title={t.close} onClick={onClose} className="flex size-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"><X size={18} /></button>
    </header>
    {children}
  </section>
}
