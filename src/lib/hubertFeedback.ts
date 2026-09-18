// Delt lager for "var dette svar nyttigt?"-feedback paa Hubert-svar. Samme
// moenster som vacationRequests.ts/personalTodos.ts: én delt funktion, ét
// KV-array, ingen parallelle skriveveje.
import { newId } from './utils'
import { appendToKvArray } from './kvArrays'
import type { AssistantAnswer } from './assistantBridge'

export interface HubertFeedback {
  id: string
  userEmail: string
  question: string
  mode: AssistantAnswer['mode']
  helpful: boolean
  createdAt: string
}

const FEEDBACK_KEY = 'hubert-feedback'

/** Kaster hvis spørgsmålet er tomt. */
export async function submitHubertFeedback(input: { userEmail: string; question: string; mode: AssistantAnswer['mode']; helpful: boolean }): Promise<HubertFeedback> {
  const question = input.question.trim()
  if (!question) throw new Error('MISSING_QUESTION')

  const feedback: HubertFeedback = {
    id: newId('hubert-feedback'),
    userEmail: input.userEmail,
    question: question.slice(0, 1000),
    mode: input.mode,
    helpful: input.helpful,
    createdAt: new Date().toISOString(),
  }
  await appendToKvArray<HubertFeedback>(FEEDBACK_KEY, [feedback])
  return feedback
}
