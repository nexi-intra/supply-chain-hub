import { describe, expect, it } from 'vitest'
import {
  HIGH_FIVE_EMOJIS, HIGH_FIVE_MESSAGE_LIMIT, highFiveErrorCode, highFiveMessageProblem, isHighFiveEmoji, mergeTeamFeed, sortPeople, unreadHighFives,
  type HighFiveReceived, type HighFiveTeamEntry,
} from './highFives'
import { HIGH_FIVE_LABELS, highFiveErrorText } from './highFivesLabels'

const received = (id: string, at: string, readAt: string | null = null): HighFiveReceived => ({
  id, senderName: 'Anna Andersen', senderTeamCode: 'SC', emoji: '🙌', message: `Thanks ${id}`, at, readAt,
})
const entry = (id: string, at: string): HighFiveTeamEntry => ({
  id, senderName: 'Anna Andersen', senderTeamCode: 'SC', recipientName: 'Bo Bertelsen', recipientTeamCode: 'OPS', emoji: '🎉', message: id, at,
})
const actor = (email: string) => ({ email, fullName: 'Bo', teamCode: 'OPS', canSend: true })

describe('highFiveMessageProblem', () => {
  it('accepts plain one-line text up to the limit', () => {
    expect(highFiveMessageProblem('Thanks!')).toBeNull()
    expect(highFiveMessageProblem('x'.repeat(HIGH_FIVE_MESSAGE_LIMIT))).toBeNull()
    expect(highFiveMessageProblem('Tak for hjælpen 🙌 æøå')).toBeNull()
  })

  it('names what is wrong', () => {
    expect(highFiveMessageProblem('')).toBe('empty')
    expect(highFiveMessageProblem('   ')).toBe('empty')
    expect(highFiveMessageProblem('x'.repeat(HIGH_FIVE_MESSAGE_LIMIT + 1))).toBe('tooLong')
    for (const text of ['two\nlines', 'tab\there', 'nul\u0000', 'bell\u0007', 'c1\u0085', 'sep\u2028', 'override\u202e']) expect(highFiveMessageProblem(text)).toBe('unsafe')
  })
})

describe('emoji set', () => {
  it('has eight emojis, the default first, and recognises only those', () => {
    expect(HIGH_FIVE_EMOJIS).toHaveLength(8)
    expect(HIGH_FIVE_EMOJIS[0]).toBe('🙌')
    expect(isHighFiveEmoji('❤️')).toBe(true)
    expect(isHighFiveEmoji('😀')).toBe(false)
    expect(isHighFiveEmoji('❤')).toBe(false)
  })

  it('is named in every language', () => {
    for (const labels of Object.values(HIGH_FIVE_LABELS)) {
      for (const emoji of HIGH_FIVE_EMOJIS) expect(labels.emojiNames[emoji]).toBeTruthy()
    }
  })
})

describe('unreadHighFives', () => {
  const snapshot = { actor: actor('bo@example.test'), received: [received('a', '2026-10-13T08:00:00.000Z'), received('b', '2026-10-13T10:00:00.000Z'), received('c', '2026-10-13T09:00:00.000Z', '2026-10-13T09:30:00.000Z')] }

  it('lists the unread ones newest first', () => {
    expect(unreadHighFives(snapshot, 'bo@example.test').map(item => item.id)).toEqual(['b', 'a'])
  })

  it('ignores the case and spaces of the expected e-mail', () => {
    expect(unreadHighFives(snapshot, ' BO@Example.test ')).toHaveLength(2)
  })

  it('is empty for another user\'s snapshot or no snapshot', () => {
    expect(unreadHighFives(snapshot, 'anna@example.test')).toEqual([])
    expect(unreadHighFives(null, 'bo@example.test')).toEqual([])
    expect(unreadHighFives(snapshot, '')).toEqual([])
  })
})

describe('mergeTeamFeed', () => {
  const team = [entry('t2', '2026-10-13T10:00:00.000Z'), entry('t1', '2026-10-13T08:00:00.000Z')]

  it('puts own just-sent entries in time order and lets the snapshot win on the same id', () => {
    const merged = mergeTeamFeed(team, [entry('mine', '2026-10-13T09:00:00.000Z'), { ...entry('t1', '2026-10-13T08:00:00.000Z'), message: 'local copy' }])
    expect(merged.map(item => item.id)).toEqual(['t2', 'mine', 't1'])
    expect(merged.find(item => item.id === 't1')?.message).toBe('t1')
  })

  it('hides a pending entry once the snapshot already holds the same high-five', () => {
    const saved = entry('real-1', '2026-10-13T11:00:00.000Z')
    const pending = { ...entry('pending-op1', '2026-10-13T11:00:01.000Z'), message: saved.message }
    expect(mergeTeamFeed([saved], [pending]).map(item => item.id)).toEqual(['real-1'])
    expect(mergeTeamFeed([saved], [{ ...pending, message: 'another one' }]).map(item => item.id)).toEqual(['pending-op1', 'real-1'])
  })

  it('cuts to the limit, keeping the newest', () => {
    const many = Array.from({ length: 15 }, (_, index) => entry(`e${index}`, `2026-10-13T${String(index).padStart(2, '0')}:00:00.000Z`))
    const merged = mergeTeamFeed(many, [], 10)
    expect(merged).toHaveLength(10)
    expect(merged[0].id).toBe('e14')
    expect(mergeTeamFeed(many, [])).toHaveLength(10)
  })
})

describe('sortPeople', () => {
  it('sorts by name without changing the input', () => {
    const people = [{ email: 'b@x.test', fullName: 'Bo', teamCode: 'A' }, { email: 'a@x.test', fullName: 'Anna', teamCode: 'A' }]
    expect(sortPeople(people).map(person => person.fullName)).toEqual(['Anna', 'Bo'])
    expect(people[0].fullName).toBe('Bo')
  })
})

describe('highFiveErrorCode', () => {
  it('finds the code in an IPC error message or code field', () => {
    expect(highFiveErrorCode(new Error("Error invoking remote method 'highFives:command': Error: HIGH_FIVES_LIMIT: Too many high-fives sent recently"))).toBe('HIGH_FIVES_LIMIT')
    expect(highFiveErrorCode({ code: 'AUTH_REQUIRED', message: 'x' })).toBe('AUTH_REQUIRED')
    expect(highFiveErrorCode(new Error('HIGH_FIVES_SOMETHING_NEW: x'))).toBe('HIGH_FIVES_UNAVAILABLE')
    expect(highFiveErrorCode(new Error('boom'))).toBeNull()
    expect(highFiveErrorCode(undefined)).toBeNull()
  })

  it('has a text in every language for every code', () => {
    for (const labels of Object.values(HIGH_FIVE_LABELS)) {
      expect(highFiveErrorText(labels, 'HIGH_FIVES_LIMIT')).toBe(labels.errors.HIGH_FIVES_LIMIT)
      expect(highFiveErrorText(labels, null)).toBe(labels.errors.generic)
      for (const text of Object.values(labels.errors)) expect(text.length).toBeGreaterThan(10)
    }
  })
})

describe('labels', () => {
  it('words the bell title per language with the sender and emoji', () => {
    expect(HIGH_FIVE_LABELS.da.notification('Anna', '🙌')).toBe('Anna sendte dig en high-five 🙌')
    expect(HIGH_FIVE_LABELS.en.notification('Anna', '🙌')).toBe('Anna sent you a high-five 🙌')
    expect(HIGH_FIVE_LABELS.fi.notification('Anna', '🙌')).toContain('Anna')
    expect(HIGH_FIVE_LABELS.sv.notification('Anna', '🙌')).toContain('Anna')
    for (const labels of Object.values(HIGH_FIVE_LABELS)) expect(labels.notification('Anna', '🎉')).toContain('🎉')
  })

  it('keeps fi and sv free of Danish and English fallbacks', () => {
    for (const language of ['fi', 'sv'] as const) {
      const labels = HIGH_FIVE_LABELS[language]
      expect(labels.dialog.title).not.toBe(HIGH_FIVE_LABELS.en.dialog.title)
      expect(labels.dialog.description).not.toBe(HIGH_FIVE_LABELS.da.dialog.description)
      expect(labels.sent('Bo')).not.toBe(HIGH_FIVE_LABELS.en.sent('Bo'))
    }
  })
})
