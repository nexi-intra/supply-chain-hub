import type { SapStateName, SapStatus } from '@/types/warehouse'
import { t } from './text'

export type SapTone = 'ok' | 'attention' | 'blocked' | 'unknown'

export interface SapStateDescription {
  label: string
  tone: SapTone
  help: string
}

const DESCRIPTIONS: Record<SapStateName, { tone: SapTone; label: [string, string]; help: [string, string] }> = {
  ready: { tone: 'ok', label: ['SAP klar', 'SAP ready'], help: ['SAP er åbent og klar. Optælling åbner sin egen SAP-session, så dit vindue ikke bliver rørt.', 'SAP is open and ready. Stock count opens its own SAP session, so your window is not touched.'] },
  busy: { tone: 'attention', label: ['SAP arbejder', 'SAP is busy'], help: ['SAP er i gang med noget. Vent til det er færdigt.', 'SAP is doing something. Wait until it has finished.'] },
  popup: { tone: 'attention', label: ['SAP har en dialog åben', 'SAP has a dialog open'], help: ['Luk den åbne dialog eller pop-up i SAP, så Optælling kan bruge SAP.', 'Close the open dialog or pop-up in SAP so Stock count can use SAP.'] },
  'max-sessions': { tone: 'attention', label: ['For mange SAP-vinduer', 'Too many SAP windows'], help: ['Der er 6 SAP-sessioner åbne. Luk mindst én, så Optælling kan åbne sin egen.', 'There are 6 SAP sessions open. Close at least one so Stock count can open its own.'] },
  'scripting-off': { tone: 'attention', label: ['SAP-scripting slået fra', 'SAP scripting is off'], help: ['SAP GUI Scripting er slået fra. Det skal være slået til under SAP-indstillinger → Scripting.', 'SAP GUI Scripting is switched off. Switch it on under SAP options → Scripting.'] },
  'not-logged-in': { tone: 'blocked', label: ['Ikke logget ind i SAP', 'Not logged on to SAP'], help: ['Log ind i SAP {system} (klient 100) først.', 'Log on to SAP {system} (client 100) first.'] },
  'not-running': { tone: 'blocked', label: ['SAP er ikke åbent', 'SAP is not open'], help: ['Åbn SAP Logon og log ind på {system} (klient 100).', 'Open SAP Logon and log on to {system} (client 100).'] },
  'wrong-system': { tone: 'attention', label: ['Forkert SAP-system', 'Wrong SAP system'], help: ['Du er logget ind på et andet system. Optælling bruger {system}, klient 100.', 'You are logged on to another system. Stock count uses {system}, client 100.'] },
  error: { tone: 'unknown', label: ['SAP-status ukendt', 'SAP status unknown'], help: ['Kunne ikke læse SAP-status. Prøv igen om lidt.', 'Could not read the SAP status. Try again in a moment.'] },
}

export function describeSapState(status: SapStatus | null): SapStateDescription {
  if (!status) return { label: t('Tjekker SAP…', 'Checking SAP…'), tone: 'unknown', help: t('Optælling tjekker om SAP er klar.', 'Stock count is checking whether SAP is ready.') }
  const system = status.expectedSystem || 'PS4'
  const base = DESCRIPTIONS[status.state] ?? DESCRIPTIONS.error
  const description = { tone: base.tone, label: t(...base.label), help: t(...base.help).replace('{system}', system) }
  if (status.state === 'wrong-system' && status.system) {
    const current = `${status.system}${status.client ? `/${status.client}` : ''}`
    return { ...description, help: t(`Du er logget ind på ${current}. Optælling bruger ${system}, klient 100.`, `You are logged on to ${current}. Stock count uses ${system}, client 100.`) }
  }
  if (status.state === 'error' && status.reason === 'timeout') {
    return { ...description, help: t('SAP svarede ikke i tide. Måske arbejder SAP stadig – prøv igen om lidt.', 'SAP did not answer in time. SAP may still be working – try again in a moment.') }
  }
  return description
}
