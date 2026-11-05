import type { LayoutDraft, LayoutItem, LayoutItemType, LayoutSlot, LayoutSlotKind } from '@/types/warehouse'
import { clampToHall, rotateItem, toggleCell } from './geometry'
import { capName, fillPattern, isUnnamed, proposeNames, regenerateSlots, slotValues } from './slots'

type Patch = Partial<Omit<LayoutItem, 'id' | 'type' | 'slots'>>

export type EditorAction =
  | { type: 'add'; itemType: LayoutItemType; x: number; y: number; w: number; h: number }
  | { type: 'select'; id: string | null }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; w: number; h: number }
  | { type: 'rotate'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'copy'; id: string }
  | { type: 'paste'; x: number; y: number }
  | { type: 'set'; id: string; patch: Patch }
  | { type: 'cycleSlot'; itemId: string; slotId: string }
  | { type: 'setSlotKind'; itemId: string; slotId: string; kind: LayoutSlotKind }
  | { type: 'renameSlot'; itemId: string; slotId: string; name: string }
  | { type: 'renameSlots'; itemId: string; slotIds: string[]; pattern: string }
  | { type: 'resetNames'; itemId: string; slotIds?: string[] }
  | { type: 'toggleCell'; id: string; x: number; y: number; add: boolean }
  | { type: 'setHall'; w: number; h: number }
  | { type: 'decide'; name: string; as: 'outside' | 'remove' | null }
  | { type: 'replace'; draft: LayoutDraft }
  | { type: 'undo' }

// newId is not part of the draft; tests pass a deterministic one to initEditor.
export type EditorState = { draft: LayoutDraft; selected: string | null; undo: string[]; clipboard: LayoutItem | null; dirty: boolean; newId: () => string }

const UNDO_MAX = 200
const HALL_MIN = 10
const HALL_MAX = 300
const SIZES: Record<LayoutItemType, [number, number]> = {
  rack: [10, 1], floorrow: [12, 2], shelfrack: [3, 1], floor: [4, 3], special: [2, 2], dock: [8, 6],
  station: [3, 2], receiving: [4, 3], gate: [3, 1], pc: [1, 1], office: [4, 4], text: [5, 1],
}
const STRUCTURE = ['bays', 'levels', 'firstNo', 'firstBay', 'bayLevels', 'aisles', 'spacers', 'pull', 'count', 'depth', 'sections', 'shelves', 'perSection', 'name', 'pattern', 'levelPatterns', 'visual', 'owner']
const CYCLE: Pick<LayoutSlot, 'kind' | 'purpose'>[] = [
  { kind: 'pallet', purpose: 'reserve' }, { kind: 'pallet', purpose: 'pick' }, { kind: 'pick-unnamed', purpose: 'reserve' },
  { kind: 'shelf', purpose: 'reserve' }, { kind: 'blocked', purpose: 'reserve' },
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T

export function initEditor(draft: LayoutDraft, { newId = () => crypto.randomUUID() }: { newId?: () => string } = {}): EditorState {
  return { draft, selected: null, undo: [], clipboard: null, dirty: false, newId }
}

function commit(state: EditorState, draft: LayoutDraft, selected = state.selected): EditorState {
  return { ...state, draft, selected, undo: [...state.undo, JSON.stringify(state.draft)].slice(-UNDO_MAX), dirty: true }
}

function updateItem(state: EditorState, id: string, change: (item: LayoutItem) => LayoutItem): EditorState {
  const item = state.draft.items.find(x => x.id === id)
  const changed = item && change(item)
  if (!changed || changed === item) return state
  return commit(state, { ...state.draft, items: state.draft.items.map(x => (x.id === id ? changed : x)) })
}

function nextLetter(items: LayoutItem[]): string {
  const used = new Set(items.filter(x => x.type === 'rack').map(x => x.name.toUpperCase()))
  return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(c => !used.has(c)) ?? ''
}

function newItem(state: EditorState, { itemType, x, y, w, h }: Extract<EditorAction, { type: 'add' }>): LayoutItem {
  const [sw, sh] = SIZES[itemType]
  const box = clampToHall({ id: state.newId(), type: itemType, x, y, w: w > 0 ? w : sw, h: h > 0 ? h : sh, name: '', note: '', slots: [] }, state.draft.hall)
  const long = Math.max(box.w, box.h)
  const extra: Partial<LayoutItem> =
    itemType === 'rack' ? { name: nextLetter(state.draft.items), bays: long, levels: 4, firstBay: 'start', aisles: [] }
    : itemType === 'floorrow' ? { name: 'S', firstNo: 0, count: Math.max(1, Math.round(long / 2)), depth: 2, firstBay: 'start', floor: 'mezz' }
    : itemType === 'shelfrack' ? { sections: 1, shelves: 5 }
    : itemType === 'dock' ? { name: 'Loading dock' }
    : {}
  const item = { ...box, ...extra }
  return { ...item, slots: regenerateSlots(item, state.newId) }
}

// regenerateSlots keeps a slot's kind, so a bay that becomes (or stops being) an aisle is fixed here.
function syncAisles(item: LayoutItem): LayoutItem {
  if (item.type !== 'rack') return item
  const aisles = item.aisles ?? []
  const changed: string[] = []
  const slots = item.slots.map(slot => {
    if (slot.unit != null || slot.level !== 1) return slot
    const aisle = aisles.includes(slot.pos!)
    if (aisle === (slot.kind === 'aisle')) return slot
    changed.push(slot.id)
    return { ...slot, kind: (aisle ? 'aisle' : 'pallet') as LayoutSlotKind, purpose: 'reserve' as const }
  })
  return changed.length ? proposeNames({ ...item, slots }, { slotIds: changed }) : item
}

function setItem(item: LayoutItem, patch: Patch, newId: () => string): LayoutItem {
  const next = defined({ ...item, ...patch })
  if (!Object.keys(patch).some(key => STRUCTURE.includes(key))) return next
  return proposeNames(syncAisles({ ...next, slots: regenerateSlots(next, newId) }), {})
}

// In a rack bay the other slots' {n} follow the change; elsewhere only the slot itself is renamed.
function withKind(item: LayoutItem, slot: LayoutSlot, kind: Pick<LayoutSlot, 'kind' | 'purpose'>): LayoutItem {
  const slots = item.slots.map(x => (x.id === slot.id ? { ...x, ...kind } : x))
  const bay = item.type === 'rack' && slot.unit == null && slot.pos != null
    ? slots.filter(x => x.pos === slot.pos && x.unit == null && (!x.manual || x.id === slot.id)).map(x => x.id)
    : [slot.id]
  return proposeNames({ ...item, slots }, { slotIds: bay })
}

function cycleSlot(item: LayoutItem, slotId: string): LayoutItem {
  const slot = item.slots.find(x => x.id === slotId)
  if (item.type !== 'rack' || !slot || slot.unit != null || slot.level == null || slot.kind === 'aisle') return item
  const at = CYCLE.findIndex(c => c.kind === slot.kind && c.purpose === slot.purpose)
  return withKind(item, slot, CYCLE[(at + 1) % CYCLE.length])
}

function setSlotKind(item: LayoutItem, slotId: string, kind: LayoutSlotKind): LayoutItem {
  const slot = item.slots.find(x => x.id === slotId)
  if (!slot || slot.kind === kind || slot.kind === 'aisle' || kind === 'aisle') return item
  return withKind(item, slot, { kind, purpose: 'reserve' })
}

function renameSlots(item: LayoutItem, slotIds: string[], pattern: string): LayoutItem {
  const chosen = new Set(slotIds)
  const slots = item.slots.map(slot => {
    if (!chosen.has(slot.id)) return slot
    if (!isUnnamed(slot)) return { ...slot, name: capName(fillPattern(pattern, slotValues(item, slot))), manual: true }
    const { manual: _manual, ...rest } = slot
    return { ...rest, name: '' }
  })
  return { ...item, slots }
}

function resetNames(item: LayoutItem, slotIds?: string[]): LayoutItem {
  const next = proposeNames(item, { slotIds: slotIds ?? item.slots.map(slot => slot.id) })
  return JSON.stringify(next.slots) === JSON.stringify(item.slots) ? item : next
}

function paste(state: EditorState, x: number, y: number): EditorState {
  if (!state.clipboard) return state
  const source = state.clipboard
  const copy = clampToHall({ ...source, id: state.newId(), x, y, slots: source.slots.map(slot => ({ ...slot, id: state.newId() })) }, state.draft.hall)
  return commit(state, { ...state.draft, items: [...state.draft.items, copy] }, copy.id)
}

function decide(draft: LayoutDraft, name: string, as: 'outside' | 'remove' | null): LayoutDraft {
  const outside = draft.decisions.outside.filter(x => x !== name)
  const remove = draft.decisions.remove.filter(x => x !== name)
  if (as === 'outside') outside.push(name)
  if (as === 'remove') remove.push(name)
  return { ...draft, decisions: { outside, remove } }
}

/** All drawing changes; each one that changes the draft can be undone (select and copy can't). */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { hall } = state.draft
  switch (action.type) {
    case 'add': {
      const item = newItem(state, action)
      return commit(state, { ...state.draft, items: [...state.draft.items, item] }, item.id)
    }
    case 'select':
      return { ...state, selected: action.id }
    case 'move':
      return updateItem(state, action.id, item => {
        const moved = clampToHall({ ...item, x: action.x, y: action.y }, hall)
        return moved.x === item.x && moved.y === item.y ? item : moved
      })
    case 'resize':
      return updateItem(state, action.id, item => {
        const sized = clampToHall({ ...item, w: action.w, h: action.h }, hall)
        if (sized.w === item.w && sized.h === item.h) return item
        const cut = item.cut?.filter(([dx, dy]) => dx < sized.w && dy < sized.h)
        return defined({ ...sized, cut: cut?.length ? cut : undefined })
      })
    case 'rotate':
      return updateItem(state, action.id, item => rotateItem(item, hall))
    case 'remove': {
      if (!state.draft.items.some(x => x.id === action.id)) return state
      const items = state.draft.items.filter(x => x.id !== action.id)
      return commit(state, { ...state.draft, items }, state.selected === action.id ? null : state.selected)
    }
    case 'copy': {
      const item = state.draft.items.find(x => x.id === action.id)
      return item ? { ...state, clipboard: item } : state
    }
    case 'paste':
      return paste(state, action.x, action.y)
    case 'set':
      return updateItem(state, action.id, item => setItem(item, action.patch, state.newId))
    case 'cycleSlot':
      return updateItem(state, action.itemId, item => cycleSlot(item, action.slotId))
    case 'setSlotKind':
      return updateItem(state, action.itemId, item => setSlotKind(item, action.slotId, action.kind))
    case 'renameSlot':
      return updateItem(state, action.itemId, item =>
        item.slots.some(x => x.id === action.slotId) ? { ...item, slots: item.slots.map(x => (x.id === action.slotId ? { ...x, name: capName(action.name), manual: true } : x)) } : item)
    case 'renameSlots':
      return updateItem(state, action.itemId, item => (action.slotIds.length ? renameSlots(item, action.slotIds, action.pattern) : item))
    case 'resetNames':
      return updateItem(state, action.itemId, item => resetNames(item, action.slotIds))
    case 'toggleCell':
      return updateItem(state, action.id, item => toggleCell(item, { x: action.x, y: action.y }, action.add))
    case 'setHall': {
      const next = { w: clamp(Math.round(action.w) || HALL_MIN, HALL_MIN, HALL_MAX), h: clamp(Math.round(action.h) || HALL_MIN, HALL_MIN, HALL_MAX) }
      if (next.w === hall.w && next.h === hall.h) return state
      return commit(state, { ...state.draft, hall: next, items: state.draft.items.map(item => clampToHall(item, next)) })
    }
    case 'decide': {
      const draft = decide(state.draft, action.name, action.as)
      return JSON.stringify(draft.decisions) === JSON.stringify(state.draft.decisions) ? state : commit(state, draft)
    }
    case 'replace':
      return commit(state, action.draft, null)
    case 'undo': {
      const previous = state.undo[state.undo.length - 1]
      if (previous == null) return state
      const draft = JSON.parse(previous) as LayoutDraft
      const selected = draft.items.some(x => x.id === state.selected) ? state.selected : null
      return { ...state, draft, selected, undo: state.undo.slice(0, -1), dirty: true }
    }
  }
}
