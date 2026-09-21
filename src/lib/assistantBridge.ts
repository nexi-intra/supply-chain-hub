import type { Guide } from './guideTypes'

export interface AssistantScope { token: string; viewId?: string }
export interface AssistantSource {
  kind: 'guide' | 'shifts' | 'calendar' | 'homeOffice' | 'highscores' | 'module'
  teamId: string
  title: string
  guideId?: string
  reference?: string
  version?: string
  revision?: string
  text?: string
  imageIds?: string[]
  moduleId?: string
  recordId?: string
}
export interface AssistantActionProposal {
  type: 'vacation-request' | 'personal-todo'
  params: Record<string, string>
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
  guide(request: AssistantScope & { teamId: string; guideId: string }): Promise<Guide>
  image(request: AssistantScope & { teamId: string; guideId: string; imageId: string }): Promise<string>
  record(request: AssistantScope & { teamId: string; moduleId: string; recordId: string; language: string }): Promise<{ title: string; text: string }>
}
declare global { interface Window { electronAssistant?: AssistantApi } }
