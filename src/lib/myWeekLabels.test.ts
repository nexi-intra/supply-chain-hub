import { describe, expect, it } from 'vitest'
import { MY_WEEK_LABELS, getMyWeekLabels, myWeekItemText } from './myWeekLabels'
import type { MyWeekItem } from './myWeek'

const item = (overrides: Partial<MyWeekItem>): MyWeekItem => ({ id: 'x', kind: 'shift', title: 'Lead', target: { view: 'shifts' }, ...overrides })

describe('my week labels', () => {
  it('has complete text in all four languages, and fi/sv never repeat the Danish or English text', () => {
    const flatten = (value: unknown): string[] => typeof value === 'string' ? [value] : typeof value === 'function' ? [String((value as (n: number) => string)(42))] : Object.values(value as object).flatMap(flatten)
    const da = flatten(MY_WEEK_LABELS.da)
    expect(da.every(text => text.trim().length > 0)).toBe(true)
    for (const language of ['en', 'fi', 'sv'] as const) {
      const texts = flatten(MY_WEEK_LABELS[language])
      expect(texts).toHaveLength(da.length)
      expect(texts.every(text => text.trim().length > 0)).toBe(true)
    }
    for (const language of ['fi', 'sv'] as const) {
      expect(MY_WEEK_LABELS[language].title).not.toBe(MY_WEEK_LABELS.en.title)
      expect(MY_WEEK_LABELS[language].nothing).not.toBe(MY_WEEK_LABELS.da.nothing)
    }
    expect(MY_WEEK_LABELS.da.week(42)).toBe('Uge 42')
    expect(getMyWeekLabels('sv').title).toBe('Min vecka')
  })

  it('names a shift by its role and falls back for a deleted role', () => {
    expect(myWeekItemText(MY_WEEK_LABELS.da, item({}))).toEqual({ label: 'Lead', detail: 'Vagt' })
    expect(myWeekItemText(MY_WEEK_LABELS.da, item({ title: '' })).label).toBe('Ukendt opgave')
  })

  it('names absence and home office by kind', () => {
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'vacation', title: '' })).label).toBe('Vacation')
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'homeOffice', title: '' })).label).toBe('Home office')
    expect(myWeekItemText(MY_WEEK_LABELS.fi, item({ kind: 'parental', title: '' })).label).toBe('Perhevapaa')
  })

  it('describes to-dos, reviews and improvement deadlines', () => {
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'todo', title: 'Order', variant: 'team' }))).toEqual({ label: 'Order', detail: 'Team to-do' })
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'todo', title: 'Order', variant: 'personal' })).detail).toBe('Personal to-do')
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'review', title: 'Guide' })).detail).toBe('Guide review due')
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'improvement', title: 'Idea', variant: 'respond' })).detail).toBe('Invitation response deadline')
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'improvement', title: 'Idea', variant: 'feedback' })).detail).toBe('Feedback deadline')
    expect(myWeekItemText(MY_WEEK_LABELS.en, item({ kind: 'improvement', title: 'Idea', variant: 'due' })).detail).toBe('Improvement deadline')
  })
})
