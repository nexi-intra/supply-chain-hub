import type { Guide } from './guideTypes'
import type { LibraryKind } from './libraryConfig'

export interface AssistantScope { token: string }
export interface AssistantSource {
  kind: 'guide' | 'shifts' | 'calendar' | 'homeOffice' | 'highscores' | 'module' | 'warehouse'
  teamId: string
  title: string
  guideId?: string
  library?: LibraryKind
  reference?: string
  version?: string
  revision?: string
  text?: string
  imageIds?: string[]
  moduleId?: string
  recordId?: string
}
export type AssistantActionType = 'vacation-request' | 'personal-todo' | 'sick-leave' | 'home-office-day' | 'note' | 'message' | 'team-todo' | 'high-five'
export interface AssistantActionProposal {
  type: AssistantActionType
  /** Strings, except `isPersonal` on a note. */
  params: Record<string, string | boolean>
  summary: string
}
export interface AssistantAnswer {
  mode: 'data' | 'retrieval' | 'ai' | 'unsupported' | 'knowledge' | 'action-proposal' | 'app-guide' | 'general'
  text: string
  sources: AssistantSource[]
  personChoices?: Array<{ id: string; label: string }>
  scoreContext?: string
  contextQuestion?: string
  nextPage?: number
  total?: number
  warning?: string
  usedImage?: boolean
  metrics?: { totalMs: number; loadMs: number; tokens?: number }
  /** Kun ved mode 'action-proposal' med en genkendt handling — se HubAssistant.tsx. */
  actionProposal?: AssistantActionProposal
  /** A button that opens a module (Optælling's live answers): view, deep-link params and the button text. */
  navigation?: { view: string; params?: { tab?: string; itemId?: string }; label: string }
}
export interface AssistantStatus { installed: boolean; running: boolean; busy: boolean; vision: boolean; freeGiB: number; minimumFreeGiB?: number; model: string; sharedAvailable?: boolean; provisioning?: boolean; provisionProgress?: number }
export interface AssistantProvisionProgress { copied: number; total: number; ratio: number }
export interface AssistantApi {
  status(scope: AssistantScope): Promise<AssistantStatus>
  ask(request: AssistantScope & { question: string; language: string; includeImages: boolean; image?: string; selectedPerson?: string; previousQuestion?: string; conversation?: string[]; page?: number; general?: boolean }): Promise<AssistantAnswer>
  stop(options?: { clearCache?: boolean }): Promise<void>
  prepare(scope: AssistantScope): Promise<{ guideCount: number; stepCount: number }>
  provision(scope: AssistantScope): Promise<AssistantStatus>
  onProvisionProgress(callback: (progress: AssistantProvisionProgress) => void): () => void
  onContextChanged(callback: () => void): () => void
  onGuidesChanged(callback: () => void): () => void
  guide(request: AssistantScope & { teamId: string; guideId: string; library?: LibraryKind }): Promise<Guide>
  image(request: AssistantScope & { teamId: string; guideId: string; imageId: string; library?: LibraryKind }): Promise<string>
  record(request: AssistantScope & { teamId: string; moduleId: string; recordId: string; language: string }): Promise<{ title: string; text: string }>
}
declare global { interface Window { electronAssistant?: AssistantApi } }
