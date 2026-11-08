import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ArrowCounterClockwise, ArrowsClockwise, ClockCounterClockwise, Copy, Cursor, DownloadSimple, GridFour, PaperPlaneTilt, Trash, UploadSimple, Warning, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { NativeSelect } from '@/components/warehouse/ui'
import { isAnyDialogOpen } from '@/lib/modalStack'
import { cn } from '@/lib/utils'
import { errorCode, errorDetail, errorMessage } from '@/lib/warehouse/errors'
import { editingOf, editorReducer, initEditor, type EditorAction, type EditorState } from '@/lib/warehouse/layout/editor'
import { fromSpike } from '@/lib/warehouse/layout/fromSpike'
import { cellsOf, clampToHall } from '@/lib/warehouse/layout/geometry'
import { duplicateNames, isPlaceSlot } from '@/lib/warehouse/layout/slots'
import { t, warehouseLocale } from '@/lib/warehouse/text'
import type { LayoutDraft, LayoutItem, LayoutItemType, LayoutVersion, PublishPlan, WarehouseUser } from '@/types/warehouse'
import { Field, ItemPanel } from './ItemPanel'
import { ITEM_TYPES, LayoutCanvas, TYPE_COLORS, typeLabel, type CanvasPointer, type FloorView } from './LayoutCanvas'
import { PublishPanel, slotLinks } from './PublishPanel'

type Action = EditorAction | { type: 'load'; draft: LayoutDraft } | { type: 'saved'; draft: LayoutDraft }
type Tool = 'select' | LayoutItemType
type Drag =
  | { mode: 'create'; type: LayoutItemType; x0: number; y0: number; x1: number; y1: number }
  | { mode: 'move' | 'resize'; id: string; sx: number; sy: number; dx: number; dy: number }
  | { mode: 'shape'; id: string; add: boolean; seen: Set<string> }
type Dialogs =
  | { kind: 'busy'; name: string; retry: () => void; leave: boolean }
  | { kind: 'import'; draft: LayoutDraft; file: string }
  | { kind: 'discard' }
  | { kind: 'versions'; versions: LayoutVersion[]; chosen: number | null }
  | null

const AUTOSAVE_MS = 3000
const ZOOMS = [1, 1.5, 2, 3]
const SHAPEABLE: LayoutItemType[] = ['floor', 'special', 'station', 'receiving', 'office', 'dock', 'shelfrack', 'gate']
const FRONTED: LayoutItemType[] = ['rack', 'floorrow', 'shelfrack']
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const newId = () => crypto.randomUUID()

function reducer(state: EditorState | null, action: Action): EditorState | null {
  if (action.type === 'load') return initEditor(action.draft, { newId })
  if (!state) return state
  // A save only clears `dirty` when nothing changed while it was on its way.
  if (action.type === 'saved') return state.draft === action.draft ? { ...state, dirty: false } : state
  return editorReducer(state, action)
}

const timeOf = (at: number) => new Date(at).toLocaleTimeString(warehouseLocale(), { hour: '2-digit', minute: '2-digit' })
const busyName = (error: unknown) => (errorDetail(error) ?? '').replace(/ redigerer tegningen$/, '') || t('En anden', 'Someone else')
const isExport = (raw: unknown): raw is Pick<LayoutDraft, 'hall' | 'notes' | 'items'> & Partial<Pick<LayoutDraft, 'decisions'>> => {
  const value = raw as { hall?: { w?: unknown; h?: unknown }; items?: unknown }
  return !!value && typeof value.hall?.w === 'number' && typeof value.hall?.h === 'number' && Array.isArray(value.items) && value.items.length > 0 && value.items.every(item => Array.isArray((item as { slots?: unknown })?.slots))
}

/** Tegning af lageret: the admin's editor for the hub's one draft; changes are autosaved, publishing is a separate step. */
export function LayoutEditor({ user, onDone }: { user: WarehouseUser; onDone: () => void }) {
  const bridge = window.electronWarehouse!.locations
  const [state, dispatch] = useReducer(reducer, null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [zoom, setZoom] = useState(1)
  const [floorView, setFloorView] = useState<FloorView>('all')
  const [shapeId, setShapeId] = useState<string | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<'discard' | 'versions' | 'open' | null>(null)
  // Why the draft cannot be saved any more (LAYOUT_STALE); null while it can.
  const [stale, setStale] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ name: string; since: number } | null>(null)
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [publishing, setPublishing] = useState(false)
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  // The list place whose slot is being picked on the drawing ("Find på tegningen").
  const [picking, setPicking] = useState<string | null>(null)
  const pickingRef = useRef(picking)
  pickingRef.current = picking
  const latest = useRef(state)
  latest.current = state
  const dragRef = useRef<Drag | null>(null)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const staleRef = useRef(false)
  // The stored draft's revision this editor builds on; sent with every save, kept out of the draft so undo cannot change it.
  const revRef = useRef(0)
  // A takeover is pending, or was declined: nothing is saved until it is answered.
  const pausedRef = useRef(false)
  // The draft a save was refused for; it is not sent again until it changes.
  const failedRef = useRef<LayoutDraft | null>(null)
  // The save on its way: the draft it sent and whether it was saved, when it is done.
  const inflightRef = useRef<{ draft: LayoutDraft; done: Promise<boolean> } | null>(null)

  const setDrag = (next: Drag | null) => { dragRef.current = next; setDragState(next) }

  /** Shows a draft as it is stored: its revision, its editor and nothing unsaved. */
  const show = useCallback((draft: LayoutDraft) => {
    dispatch({ type: 'load', draft })
    revRef.current = draft.rev ?? 0
    failedRef.current = null
    staleRef.current = false
    setStale(null)
    setSavedAt(draft.editedAt)
    setEditing(editingOf(draft))
    setShapeId(null)
  }, [])

  const load = useCallback(async () => {
    try {
      const stored = (await bridge.layoutDraft()).draft
      show(stored ?? (await bridge.startLayoutDraft()).draft)
    } catch (error) {
      setLoadError(errorMessage(error))
    }
  }, [bridge, show])

  useEffect(() => { void load() }, [load])

  // Taking over continues from the stored draft (the other admin's latest save); what is not saved here is dropped.
  const takeOver = useCallback(async (): Promise<boolean> => {
    try {
      const { draft } = await bridge.saveLayoutDraft({ takeOver: true })
      const dropped = latest.current?.dirty
      pausedRef.current = false
      if (draft) show(draft)
      if (dropped) toast(t('Dine ændringer, der ikke var gemt, er droppet – du fortsætter fra den gemte kladde.', 'Your changes that were not saved are dropped – you continue from the saved draft.'))
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }, [bridge, show])

  const save = useCallback(async (): Promise<boolean> => {
    const current = latest.current
    if (!current || staleRef.current || savingRef.current || pausedRef.current) return false
    savingRef.current = true
    setSaving(true)
    let finish = (_saved: boolean) => {}
    let saved = false
    inflightRef.current = { draft: current.draft, done: new Promise<boolean>(resolve => { finish = resolve }) }
    try {
      const { editedAt, rev } = await bridge.saveLayoutDraft({ draft: { ...current.draft, rev: revRef.current } })
      revRef.current = rev
      dispatch({ type: 'saved', draft: current.draft })
      setSavedAt(editedAt)
      saved = true
      return true
    } catch (error) {
      const code = errorCode(error)
      if (code === 'LAYOUT_DRAFT_BUSY') {
        pausedRef.current = true
        setDialog({ kind: 'busy', name: busyName(error), retry: () => void takeOver(), leave: true })
      } else if (code === 'LAYOUT_STALE') {
        staleRef.current = true
        setStale(errorMessage(error))
        toast.error(errorMessage(error))
      } else {
        failedRef.current = current.draft
        toast.error(errorMessage(error))
      }
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
      finish(saved)
    }
  }, [bridge, takeOver])

  // Before a preview or a publish the draft is always saved, even unchanged, so another admin's takeover shows up
  // (LAYOUT_DRAFT_BUSY). A save on its way that sends the latest draft counts; otherwise the latest is saved once after it.
  const flush = useCallback(async () => {
    while (savingRef.current && inflightRef.current) {
      const { draft, done } = inflightRef.current
      if ((await done) && latest.current?.draft === draft) return true
    }
    return save()
  }, [save])

  const onStale = useCallback(() => { setPublishing(false); setPlan(null); void load() }, [load])

  // Escape ends picking a slot before Placeringer's own Escape (which leaves the editor) sees it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !pickingRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setPicking(null)
      setPublishing(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (!state?.dirty || stale || saving || dialog?.kind === 'busy' || failedRef.current === state.draft) return
    const timer = window.setTimeout(() => void save(), AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [state?.draft, state?.dirty, stale, saving, dialog, save])

  // Leaving (Escape or the back button) saves what is not saved yet – after a save on its way, if it sent something older.
  useEffect(() => () => {
    const current = latest.current
    const send = () => {
      if (!current?.dirty || staleRef.current) return
      if (pausedRef.current) return void toast.error(t('Dine seneste ændringer i tegningen er ikke gemt', 'Your latest changes to the drawing are not saved'))
      bridge.saveLayoutDraft({ draft: { ...current.draft, rev: revRef.current } }).catch(error => toast.error(errorMessage(error)))
    }
    const inflight = savingRef.current ? inflightRef.current : null
    if (inflight) void inflight.done.then(() => { if (current?.draft !== inflight.draft) send() })
    else if (!pausedRef.current) send()
  }, [bridge])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]') || isAnyDialogOpen()) return
      const current = latest.current
      if (!current) return
      const ctrl = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const selected = current.selected
      // R and Delete act on the whole item only from the drawing itself, never from a focused slot or button.
      const onDrawing = !target || target === document.body || !!target.closest?.('svg')
      if (ctrl && key === 'z') dispatch({ type: 'undo' })
      else if (ctrl && key === 'c' && selected) dispatch({ type: 'copy', id: selected })
      else if (ctrl && key === 'v' && current.clipboard) dispatch({ type: 'paste', ...(hover.current ?? { x: current.clipboard.x + 1, y: current.clipboard.y + 1 }) })
      else if (!ctrl && !event.altKey && key === 'r' && selected && onDrawing) dispatch({ type: 'rotate', id: selected })
      else if (key === 'delete' && selected && onDrawing) dispatch({ type: 'remove', id: selected })
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const duplicates = useMemo(() => (state ? duplicateNames(state.draft, user.team) : new Set<string>()), [state, user.team])
  const links = useMemo(() => (state ? slotLinks(state.draft, plan, user.team) : undefined), [state, plan, user.team])
  // While dragging, the item is drawn at the pointer; the reducer gets one move/resize when it is dropped.
  const shown = useMemo(() => {
    if (!state || !drag || (drag.mode !== 'move' && drag.mode !== 'resize')) return state?.draft
    const { hall } = state.draft
    return {
      ...state.draft,
      items: state.draft.items.map(item => item.id !== drag.id ? item
        : drag.mode === 'move' ? clampToHall({ ...item, x: item.x + drag.dx, y: item.y + drag.dy }, hall)
          : clampToHall({ ...item, w: Math.max(1, item.w + drag.dx), h: Math.max(1, item.h + drag.dy) }, hall)),
    }
  }, [state, drag])

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>
  if (!state || !shown) return <Skeleton className="h-[32rem] rounded-xl" />

  const { draft, selected } = state
  const item = draft.items.find(x => x.id === selected) ?? null
  const cellOf = (x: number, y: number) => ({ x: clamp(Math.floor(x), 0, draft.hall.w - 1), y: clamp(Math.floor(y), 0, draft.hall.h - 1) })

  function onPointer(event: CanvasPointer) {
    const cell = cellOf(event.x, event.y)
    const current = dragRef.current
    if (event.kind === 'move') hover.current = cell
    if (event.kind === 'down') {
      // A field being typed in is applied to its own item before the selection changes.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      const shaped = shapeId ? draft.items.find(x => x.id === shapeId) : undefined
      if (shaped) {
        const add = !cellsOf(shaped).some(([x, y]) => x === cell.x && y === cell.y)
        dispatch({ type: 'toggleCell', id: shaped.id, ...cell, add })
        setDrag({ mode: 'shape', id: shaped.id, add, seen: new Set([`${cell.x},${cell.y}`]) })
      } else if (tool !== 'select') {
        setDrag({ mode: 'create', type: tool, x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y })
      } else if (event.itemId) {
        dispatch({ type: 'select', id: event.itemId })
        // A floor or special area has no front view: its one slot is picked by clicking the area.
        const target = draft.items.find(x => x.id === event.itemId)
        if (picking && target && !FRONTED.includes(target.type) && target.slots.length === 1) return pickSlot(target, target.slots[0].id)
        setDrag({ mode: event.handle ? 'resize' : 'move', id: event.itemId, sx: event.x, sy: event.y, dx: 0, dy: 0 })
      } else {
        dispatch({ type: 'select', id: null })
      }
      return
    }
    if (!current) return
    if (event.kind === 'move') {
      if (current.mode === 'create' && (cell.x !== current.x1 || cell.y !== current.y1)) setDrag({ ...current, x1: cell.x, y1: cell.y })
      if (current.mode === 'shape' && !current.seen.has(`${cell.x},${cell.y}`)) {
        current.seen.add(`${cell.x},${cell.y}`)
        dispatch({ type: 'toggleCell', id: current.id, ...cell, add: current.add })
      }
      if (current.mode === 'move' || current.mode === 'resize') {
        const dx = Math.round(event.x - current.sx)
        const dy = Math.round(event.y - current.sy)
        if (dx !== current.dx || dy !== current.dy) setDrag({ ...current, dx, dy })
      }
      return
    }
    setDrag(null)
    if (current.mode === 'create') {
      const moved = current.x0 !== current.x1 || current.y0 !== current.y1
      dispatch({
        type: 'add', itemType: current.type, x: Math.min(current.x0, current.x1), y: Math.min(current.y0, current.y1),
        w: moved ? Math.abs(current.x1 - current.x0) + 1 : 0, h: moved ? Math.abs(current.y1 - current.y0) + 1 : 0,
      })
      setTool('select')
    }
    const target = draft.items.find(x => x.id === (current.mode === 'create' ? '' : current.id))
    if (target && current.mode === 'move' && (current.dx || current.dy)) dispatch({ type: 'move', id: target.id, x: target.x + current.dx, y: target.y + current.dy })
    if (target && current.mode === 'resize' && (current.dx || current.dy)) dispatch({ type: 'resize', id: target.id, w: Math.max(1, target.w + current.dx), h: Math.max(1, target.h + current.dy) })
  }

  function findSlot(name: string) {
    setPublishing(false)
    setPicking(name)
    setTool('select')
    setShapeId(null)
  }

  function pickSlot(target: LayoutItem, slotId: string) {
    const slot = target.slots.find(x => x.id === slotId)
    if (!picking || !slot) return
    if (!isPlaceSlot(target, slot, user.team)) {
      toast.error(t('Den bliver ikke en plads i listen (ingen plads, køregang, pluk uden navn eller en anden ejer). Klik på en palleplads, hylde eller gulvplads.', 'That does not become a place in the list (no place, aisle, pick without a name or another owner). Click a pallet place, shelf or floor place.'))
      return
    }
    dispatch({ type: 'renameSlot', itemId: target.id, slotId, name: picking })
    setPicking(null)
    setPublishing(true)
  }

  async function published(version: number, next?: LayoutDraft) {
    setPublishing(false)
    setPlan(null)
    toast.success(t(`Tegningen er udgivet (version ${version})`, `The drawing is published (version ${version})`))
    // The publish made the next draft on the new version in the same write.
    if (next) show(next)
    else await load()
  }

  async function onFile(file: File) {
    try {
      const raw: unknown = JSON.parse(await file.text())
      const base = isExport(raw) ? { hall: raw.hall, notes: raw.notes ?? '', items: raw.items, decisions: raw.decisions ?? { outside: [], remove: [] } } : fromSpike(raw, newId)
      setDialog({ kind: 'import', file: file.name, draft: { ...draft, hall: base.hall, notes: base.notes, items: base.items, decisions: base.decisions } })
    } catch (error) {
      toast.error(error instanceof SyntaxError ? t('Filen er ikke en tegning (JSON).', 'The file is not a drawing (JSON).') : errorMessage(error))
    }
  }

  function saveAsFile() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `lager-tegning-${user.team}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function discard() {
    // An autosave in between would bring the discarded draft back.
    pausedRef.current = true
    setPendingAction('discard')
    try {
      const { draft: next } = await bridge.discardLayoutDraft()
      // The discard started the next draft from the published drawing in the same write.
      if (next) show(next)
      else await load()
      setDialog(null)
      toast.success(t('Kladden er kasseret', 'The draft has been discarded'))
    } catch (error) {
      // Another admin edits the draft: take it over first, then it is discarded.
      if (errorCode(error) === 'LAYOUT_DRAFT_BUSY') setDialog({ kind: 'busy', name: busyName(error), retry: () => void takeOver().then(taken => { if (taken) void discard() }), leave: false })
      else toast.error(errorMessage(error))
    } finally {
      pausedRef.current = false
      setPendingAction(null)
    }
  }

  async function showVersions() {
    setPendingAction('versions')
    try {
      const { versions } = await bridge.layoutVersions()
      setDialog({ kind: 'versions', versions, chosen: null })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  async function openVersion(version: number, takeOver = false) {
    pausedRef.current = true
    setPendingAction('open')
    try {
      const { draft: opened } = await bridge.openLayoutVersion({ version, takeOver })
      pausedRef.current = false
      show(opened)
      setDialog(null)
      toast.success(t(`Version ${version} er åbnet som kladde`, `Version ${version} is open as the draft`))
    } catch (error) {
      pausedRef.current = false
      if (errorCode(error) === 'LAYOUT_DRAFT_BUSY') setDialog({ kind: 'busy', name: busyName(error), retry: () => void openVersion(version, true), leave: false })
      else toast.error(errorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  const status = stale || (state.dirty && !saving && failedRef.current === state.draft) ? t('Ikke gemt', 'Not saved') : saving ? t('Gemmer …', 'Saving …') : state.dirty ? t('Ændret', 'Changed') : savedAt ? t(`Kladde gemt ${timeOf(savedAt)}`, `Draft saved ${timeOf(savedAt)}`) : ''
  const preview = drag?.mode === 'create'
    ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0) + 1, h: Math.abs(drag.y1 - drag.y0) + 1, color: TYPE_COLORS[drag.type] }
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{t('Tegning af lageret', 'Drawing of the warehouse')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`Kladde${draft.basedOn ? ` til version ${draft.basedOn + 1}` : ''} · ${draft.items.length} ting`, `Draft${draft.basedOn ? ` for version ${draft.basedOn + 1}` : ''} · ${draft.items.length} items`)}
            {status && <span className="ml-2" data-testid="layout-status">· {status}</span>}
            {editing && <span className="ml-2" data-testid="layout-editor">· {t(`Redigeres af ${editing.name} siden ${timeOf(editing.since)}`, `Edited by ${editing.name} since ${timeOf(editing.since)}`)}</span>}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!state.undo.length} onClick={() => dispatch({ type: 'undo' })} title="Ctrl+Z"><ArrowCounterClockwise size={14} /> {t('Fortryd', 'Undo')}</Button>
        <Button size="sm" variant="outline" disabled={!item} onClick={() => item && dispatch({ type: 'copy', id: item.id })} title="Ctrl+C"><Copy size={14} /> {t('Kopiér', 'Copy')}</Button>
        <Button size="sm" variant="outline" disabled={!state.clipboard} onClick={() => state.clipboard && dispatch({ type: 'paste', x: state.clipboard.x + 1, y: state.clipboard.y + 1 })} title={t('Ctrl+V – sættes ind, hvor musen står', 'Ctrl+V – pasted where the mouse is')}>{t('Indsæt', 'Paste')}</Button>
        <Button size="sm" variant="outline" disabled={!item} onClick={() => item && dispatch({ type: 'rotate', id: item.id })} title="R"><ArrowsClockwise size={14} /> {t('Rotér', 'Rotate')}</Button>
        <Button size="sm" variant="outline" disabled={!item} onClick={() => item && dispatch({ type: 'remove', id: item.id })} title="Delete"><Trash size={14} /> {t('Slet', 'Delete')}</Button>
        <Button size="sm" variant={shapeId ? 'default' : 'outline'} disabled={!shapeId && !(item && SHAPEABLE.includes(item.type))} onClick={() => setShapeId(shapeId ? null : item?.id ?? null)}>
          <GridFour size={14} /> {shapeId ? t('Færdig med formen', 'Done with the shape') : t('Form', 'Shape')}
        </Button>
        <Button size="sm" disabled={!!stale} onClick={() => { setPicking(null); setPublishing(true) }}><PaperPlaneTilt size={14} /> {t('Udgiv …', 'Publish …')}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label={t('Fil med tegning', 'File with a drawing')} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onFile(file) }} />
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}><UploadSimple size={14} /> {t('Hent tegning fra fil', 'Load drawing from file')}</Button>
        <Button size="sm" variant="outline" onClick={saveAsFile}><DownloadSimple size={14} /> {t('Gem som fil', 'Save as file')}</Button>
        <Button size="sm" variant="outline" loading={pendingAction === 'versions'} onClick={() => showVersions()}><ClockCounterClockwise size={14} /> {t('Tidligere versioner', 'Earlier versions')}</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDialog({ kind: 'discard' })}><X size={14} /> {t('Kassér kladde', 'Discard draft')}</Button>
        {duplicates.size > 0 && <span className="ml-auto inline-flex items-center gap-1 text-sm text-destructive"><Warning size={14} /> {t(`${duplicates.size} navne bruges to gange (rød kant)`, `${duplicates.size} names are used twice (red outline)`)}</span>}
      </div>

      {stale && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="layout-stale">
          <span>{stale.replace(/\.?$/, '.')} {t('Dine seneste ændringer er ikke gemt.', 'Your latest changes are not saved.')}</span>
          <Button size="sm" onClick={() => load()}>{t('Hent den nye kladde', 'Fetch the new draft')}</Button>
        </div>
      )}

      {picking && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm" data-testid="layout-picking">
          <span><strong>{t(`Klik på den plads på tegningen, der skal hedde ${picking}`, `Click the place on the drawing that should be called ${picking}`)}</strong> – {t('vælg reolen, og klik på pladsen i "Reolen forfra". Esc annullerer.', 'select the rack and click the place in "The rack from the front". Esc cancels.')}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setPicking(null); setPublishing(true) }}>{t('Annullér', 'Cancel')}</Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <aside className="space-y-1 rounded-lg border p-2" aria-label={t('Værktøjer', 'Tools')}>
          {(['select', ...ITEM_TYPES] as Tool[]).map(value => (
            <button
              key={value}
              type="button"
              aria-pressed={tool === value}
              onClick={() => { setTool(value); setShapeId(null) }}
              className={cn('flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:bg-muted', tool === value && 'border-primary bg-primary/10')}
            >
              {value === 'select' ? <Cursor size={14} /> : <span className="size-3.5 shrink-0 rounded-sm" style={{ background: TYPE_COLORS[value] }} />}
              {value === 'select' ? t('Vælg og flyt', 'Select and move') : typeLabel(value)}
            </button>
          ))}
          <p className="px-1 pt-2 text-xs text-muted-foreground">{t('Vælg en ting og træk et felt på tegningen. Træk i det blå hjørne for at ændre størrelse. R roterer, Ctrl+C / Ctrl+V kopierer, Delete sletter, Ctrl+Z fortryder.', 'Choose an item and drag a field on the drawing. Drag the blue corner to resize. R rotates, Ctrl+C / Ctrl+V copies, Delete deletes, Ctrl+Z undoes.')}</p>
        </aside>

        <div className="max-h-[calc(100vh-15rem)] min-h-96 overflow-auto rounded-lg border bg-card" onPointerLeave={() => { hover.current = null }}>
          <LayoutCanvas
            layout={shown}
            selected={selected}
            duplicates={duplicates}
            floorView={floorView}
            zoom={zoom}
            team={user.team}
            cursor={shapeId ? 'cell' : tool !== 'select' ? 'crosshair' : undefined}
            preview={preview}
            onPointer={onPointer}
          />
        </div>

        <aside className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field id="hall-w" label={t('Hallens bredde (ruder)', 'Hall width (cells)')} number min={10} max={300} value={draft.hall.w} onCommit={value => dispatch({ type: 'setHall', w: Number(value), h: draft.hall.h })} />
            <Field id="hall-h" label={t('Hallens længde (ruder)', 'Hall length (cells)')} number min={10} max={300} value={draft.hall.h} onCommit={value => dispatch({ type: 'setHall', w: draft.hall.w, h: Number(value) })} />
            <div className="space-y-1">
              <label htmlFor="layout-zoom" className="text-xs text-muted-foreground">Zoom</label>
              <NativeSelect id="layout-zoom" className="h-8 w-full" value={String(zoom)} onChange={event => setZoom(Number(event.target.value))}>
                {ZOOMS.map(value => <option key={value} value={String(value)}>{value * 100} %</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="layout-floor" className="text-xs text-muted-foreground">{t('Vis etage', 'Show floor')}</label>
              <NativeSelect id="layout-floor" className="h-8 w-full" value={floorView} onChange={event => setFloorView(event.target.value as FloorView)}>
                <option value="all">{t('Begge', 'Both')}</option>
                <option value="ground">{t('Kun gulv', 'Ground only')}</option>
                <option value="mezz">{t('Kun ovenpå', 'Upstairs only')}</option>
              </NativeSelect>
            </div>
          </div>
          {shapeId && <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs">{t('Klik eller træk på tegningen: en tom rude bliver tilføjet, en rude i formen bliver fjernet.', 'Click or drag on the drawing: an empty cell is added, a cell in the shape is removed.')}</p>}
          {item
            ? <ItemPanel key={item.id} item={item} dispatch={dispatch} duplicates={duplicates} link={links} onSlot={picking ? slotId => pickSlot(item, slotId) : undefined} />
            : <p className="text-sm text-muted-foreground">{t('Klik på en ting på tegningen for at rette den – eller vælg en ting til venstre og træk et felt.', 'Click an item on the drawing to edit it – or choose an item on the left and drag a field.')}</p>}
        </aside>
      </div>

      {publishing && !stale && (
        <PublishPanel
          draft={draft} team={user.team} dispatch={dispatch} save={flush} onPlan={setPlan} onStale={onStale}
          onFindSlot={findSlot} onShow={id => { dispatch({ type: 'select', id }); setPublishing(false) }} onPublished={(version, next) => void published(version, next)} onClose={() => setPublishing(false)}
        />
      )}
      {dialog?.kind === 'busy' && (
        <Dialog open onOpenChange={open => { if (!open) { setDialog(null); if (dialog.leave) onDone() } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(`${dialog.name} redigerer tegningen – overtag?`, `${dialog.name} is editing the drawing – take over?`)}</DialogTitle>
              <DialogDescription>{t('Overtager du, fortsætter du fra den gemte kladde – ændringer her, der ikke er gemt, går tabt. Den anden kan ikke gemme sine, før hun eller han overtager igen.', 'If you take over, you continue from the saved draft – changes here that are not saved are lost. The other person cannot save theirs until taking over again.')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setDialog(null); if (dialog.leave) onDone() }}>{dialog.leave ? t('Annullér og gå tilbage', 'Cancel and go back') : t('Annullér', 'Cancel')}</Button>
              <Button onClick={() => { const { retry } = dialog; setDialog(null); retry() }}>{t('Overtag', 'Take over')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {dialog?.kind === 'import' && (
        <Dialog open onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Erstat tegningen?', 'Replace the drawing?')}</DialogTitle>
              <DialogDescription>{t(`Kladden erstattes af ${dialog.file} (${dialog.draft.items.length} ting). Du kan fortryde med Fortryd.`, `The draft is replaced by ${dialog.file} (${dialog.draft.items.length} items). You can undo it with Undo.`)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>{t('Annullér', 'Cancel')}</Button>
              <Button onClick={() => { dispatch({ type: 'replace', draft: dialog.draft }); setDialog(null); setShapeId(null) }}>{t('Erstat', 'Replace')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {dialog?.kind === 'discard' && (
        <Dialog open onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Kassér kladden?', 'Discard the draft?')}</DialogTitle>
              <DialogDescription>{t('Alle ændringer siden sidste udgivelse forsvinder, og du starter forfra fra den udgivne tegning.', 'All changes since the last publish are lost, and you start again from the published drawing.')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>{t('Annullér', 'Cancel')}</Button>
              <Button variant="destructive" loading={pendingAction === 'discard'} onClick={() => discard()}><Trash size={16} /> {t('Kassér', 'Discard')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {dialog?.kind === 'versions' && (
        <Dialog open onOpenChange={open => { if (!open) setDialog(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Tidligere versioner', 'Earlier versions')}</DialogTitle>
              <DialogDescription>{dialog.chosen == null
                ? t('Vælg en udgivet version for at åbne den som kladde.', 'Choose a published version to open it as the draft.')
                : t(`Åbn version ${dialog.chosen} som kladde? Den nuværende kladde erstattes.`, `Open version ${dialog.chosen} as the draft? The current draft is replaced.`)}</DialogDescription>
            </DialogHeader>
            {dialog.chosen == null && (
              dialog.versions.length
                ? <ul className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
                  {dialog.versions.map(version => (
                    <li key={version.version}>
                      <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted" onClick={() => setDialog({ ...dialog, chosen: version.version })}>
                        <span className="font-semibold">{t(`Version ${version.version}`, `Version ${version.version}`)}</span>
                        <span className="text-muted-foreground">{version.publishedAt ? new Date(version.publishedAt).toLocaleString(warehouseLocale()) : ''}{version.publishedBy ? ` · ${version.publishedBy.name}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                : <p className="text-sm text-muted-foreground">{t('Der er ingen udgivne versioner endnu.', 'There are no published versions yet.')}</p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialog(null)}>{t('Annullér', 'Cancel')}</Button>
              {dialog.chosen != null && <Button loading={pendingAction === 'open'} onClick={() => openVersion(dialog.chosen!)}>{t('Åbn som kladde', 'Open as draft')}</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
