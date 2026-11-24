import type { SapStateName, SapStatus } from '@/types/warehouse'
import { t } from './text'

export type SapTone = 'ok' | 'attention' | 'blocked' | 'unknown'

export interface SapStateDescription {
  label: string
  tone: SapTone
  help: string
}

/** The tools that show the SAP indicator. */
export type SapTool = 'counts' | 'locations' | 'softwareload'

const TOOL_NAMES: Record<SapTool, [string, string]> = {
  counts: ['Optælling', 'Stock count'],
  locations: ['Placeringer', 'Locations'],
  softwareload: ['Softwareload', 'Softwareload'],
}

// {App} starts a sentence and {app} sits inside one: the tool's name, or "appen" where the tool is not known.
const DESCRIPTIONS: Record<SapStateName, { tone: SapTone; label: [string, string]; help: [string, string] }> = {
  ready: { tone: 'ok', label: ['SAP klar', 'SAP ready'], help: ['SAP er åbent og klar. {App} åbner sin egen SAP-session, så dit vindue ikke bliver rørt.', 'SAP is open and ready. {App} opens its own SAP session, so your window is not touched.'] },
  busy: { tone: 'attention', label: ['SAP arbejder', 'SAP is busy'], help: ['SAP er i gang med noget. Vent til det er færdigt.', 'SAP is doing something. Wait until it has finished.'] },
  popup: { tone: 'attention', label: ['SAP har en dialog åben', 'SAP has a dialog open'], help: ['Luk den åbne dialog eller pop-up i SAP, så {app} kan bruge SAP.', 'Close the open dialog or pop-up in SAP so {app} can use SAP.'] },
  'max-sessions': { tone: 'attention', label: ['For mange SAP-vinduer', 'Too many SAP windows'], help: ['Der er 6 SAP-sessioner åbne. Luk mindst én, så {app} kan åbne sin egen.', 'There are 6 SAP sessions open. Close at least one so {app} can open its own.'] },
  'scripting-off': { tone: 'attention', label: ['SAP-scripting slået fra', 'SAP scripting is off'], help: ['SAP GUI Scripting er slået fra. Det skal være slået til under SAP-indstillinger → Scripting.', 'SAP GUI Scripting is switched off. Switch it on under SAP options → Scripting.'] },
  'not-logged-in': { tone: 'blocked', label: ['Ikke logget ind i SAP', 'Not logged on to SAP'], help: ['Log ind i SAP {system} (klient 100) først.', 'Log on to SAP {system} (client 100) first.'] },
  'not-running': { tone: 'blocked', label: ['SAP er ikke åbent', 'SAP is not open'], help: ['Åbn SAP Logon og log ind på {system} (klient 100).', 'Open SAP Logon and log on to {system} (client 100).'] },
  'wrong-system': { tone: 'attention', label: ['Forkert SAP-system', 'Wrong SAP system'], help: ['Du er logget ind på et andet system. {App} bruger {system}, klient 100.', 'You are logged on to another system. {App} uses {system}, client 100.'] },
  error: { tone: 'unknown', label: ['SAP-status ukendt', 'SAP status unknown'], help: ['Kunne ikke læse SAP-status. Prøv igen om lidt.', 'Could not read the SAP status. Try again in a moment.'] },
}

const appName = (tool?: SapTool) => (tool ? t(...TOOL_NAMES[tool]) : t('appen', 'the app'))
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const withApp = (text: string, tool?: SapTool) => text.replace('{App}', capitalised(appName(tool))).replace('{app}', appName(tool))

/** `tool`: the tool the indicator is shown in; without it the texts say "appen". */
export function describeSapState(status: SapStatus | null, tool?: SapTool): SapStateDescription {
  if (!status) return { label: t('Tjekker SAP…', 'Checking SAP…'), tone: 'unknown', help: withApp(t('{App} tjekker om SAP er klar.', '{App} is checking whether SAP is ready.'), tool) }
  const system = status.expectedSystem || 'PS4'
  const base = DESCRIPTIONS[status.state] ?? DESCRIPTIONS.error
  const description = { tone: base.tone, label: t(...base.label), help: withApp(t(...base.help), tool).replace('{system}', system) }
  if (status.state === 'wrong-system' && status.system) {
    const current = `${status.system}${status.client ? `/${status.client}` : ''}`
    return { ...description, help: withApp(t(`Du er logget ind på ${current}. {App} bruger ${system}, klient 100.`, `You are logged on to ${current}. {App} uses ${system}, client 100.`), tool) }
  }
  if (status.state === 'error' && status.reason === 'timeout') {
    return { ...description, help: t('SAP svarede ikke i tide. Måske arbejder SAP stadig, så prøv igen om lidt.', 'SAP did not answer in time. SAP may still be working, so try again in a moment.') }
  }
  return description
}

/** What the tool does in SAP: Optælling and Placeringer leave every posting to the user, Softwareload posts by itself. */
export function sapToolNote(tool: SapTool, system: string): string {
  if (tool === 'locations') return t('Placeringer læser kun fra SAP (materialedokumenter og beskrivelser).', 'Locations only reads from SAP (material documents and descriptions).')
  if (tool === 'softwareload') return t(`Softwareload flytter terminalerne i SAP selv, når du klikker 'Afslut og flyt i SAP' eller 'Flyt til D005'. Der bogføres i ${system}.`, `Softwareload moves the terminals in SAP itself when you click 'Finish and move in SAP' or 'Move to D005'. It posts in ${system}.`)
  return t('Optælling læser fra SAP. Optællingsdokumenter udfyldes i SAP, men du trykker altid selv F8, Gem eller Post.', 'Stock count reads from SAP. Count documents are filled in in SAP, but you always press F8, Save or Post yourself.')
}

/** The title of the TEST-SAP badge. */
export function sapTestSystemNote(tool: SapTool): string {
  if (tool === 'locations') return t("Placeringer læser fra SAP's testsystem", "Locations reads from SAP's test system")
  if (tool === 'softwareload') return t("Softwareload læser fra og bogfører i SAP's testsystem", "Softwareload reads from and posts in SAP's test system")
  return t("Optælling læser fra og skriver til SAP's testsystem", "Stock count reads from and writes to SAP's test system")
}
