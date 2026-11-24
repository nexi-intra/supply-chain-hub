import { describe, expect, it } from 'vitest'
import { MULTIPLAYER_LABELS, getMultiplayerLabels } from './multiplayerLabels'
import { MULTIPLAYER_ERROR_CODES, MULTIPLAYER_FINISHED_REASONS, MULTIPLAYER_MOVE_ERRORS, MULTIPLAYER_NOTIFICATION_TYPES } from './multiplayer'

const languages = Object.keys(MULTIPLAYER_LABELS) as Array<keyof typeof MULTIPLAYER_LABELS>

function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return [[path, String((value as (...args: unknown[]) => unknown)('Anna', 3, 4))]]
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => strings(child, path ? `${path}.${key}` : key))
  return []
}

describe('multiplayer labels', () => {
  it('covers da, en, fi and sv', () => {
    expect(languages.sort()).toEqual(['da', 'en', 'fi', 'sv'])
  })

  it.each(languages)('%s names the game and section the same way everywhere', language => {
    expect(MULTIPLAYER_LABELS[language].gameName).toBe('Word-Puzzle')
    expect(MULTIPLAYER_LABELS[language].sectionName).toBe('Multiplayer')
  })

  it.each(languages)('%s has no empty or leftover text and no escaped characters', language => {
    for (const [path, text] of strings(MULTIPLAYER_LABELS[language])) {
      expect(text.trim(), path).not.toBe('')
      expect(text, path).not.toContain('\\u')
      expect(text, path).not.toContain('undefined')
    }
  })

  it.each(languages)('%s maps every error code, rules code and notification type', language => {
    const labels = MULTIPLAYER_LABELS[language]
    for (const code of MULTIPLAYER_ERROR_CODES) expect(labels.errors[code], code).toBeTruthy()
    for (const code of MULTIPLAYER_MOVE_ERRORS) expect(labels.moveErrors[code], code).toBeTruthy()
    for (const type of MULTIPLAYER_NOTIFICATION_TYPES) expect(labels.notifications[type]('Anna'), type).toContain('Anna')
  })

  it.each(languages)('%s names chess in the invitation, the game names and every finish reason', language => {
    const labels = MULTIPLAYER_LABELS[language]
    const chess = labels.notifications.invite('Anna', 'chess')
    const word = labels.notifications.invite('Anna', 'word-puzzle')
    expect(chess).toContain('Anna')
    expect(chess).not.toContain('Word-Puzzle')
    expect(word).toContain('Word-Puzzle')
    expect(labels.notifications.invite('Anna')).toBe(word)
    expect(labels.gameNames['word-puzzle']).toBe('Word-Puzzle')
    expect(labels.gameNames.chess).not.toBe('Word-Puzzle')
    for (const reason of MULTIPLAYER_FINISHED_REASONS) expect(labels.lobby.reason[reason], reason).toBeTruthy()
  })

  it('keeps the same keyboard help rows in every language', () => {
    const counts = languages.map(language => MULTIPLAYER_LABELS[language].match.keyboard.items.length)
    expect(new Set(counts).size).toBe(1)
  })

  it('falls back to English for unknown languages', () => {
    expect(getMultiplayerLabels('de')).toBe(MULTIPLAYER_LABELS.en)
    expect(getMultiplayerLabels('da')).toBe(MULTIPLAYER_LABELS.da)
  })
})
