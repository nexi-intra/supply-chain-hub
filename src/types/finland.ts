// Finlandsforsendelser's answers over IPC (electron/warehouse/finland/service.cjs and register.cjs).

export type FinlandCourier = 'Postnord' | 'DHL' | 'DSV'
export type FinlandFollowUpField = 'expected' | 'received' | 'sla' | 'comment' | 'terminal'
/** Columns H (Expected), I (Received), J (SLA), L (Comment) and M (Terminal); dates as yyyy-mm-dd, or the sheet's text. */
export type FinlandFollowUp = Record<FinlandFollowUpField, string>

/** A parcel as a sheet row (new rows, review, in the sheet). `courier` is 'Ukendt' for a T&T of no known courier. */
export interface FinlandParcelRow {
  delivery: number
  orderType: string
  postalCode: number | string
  courier: FinlandCourier | 'Ukendt'
  tracking: string
  /** yyyy-mm-dd */
  pickedUp: string
}

export type FinlandReviewAction =
  | { kind: 'manual'; rows: number[] }
  | { kind: 'add'; afterRow: number; afterDelivery: string }
  | { kind: 'replace-duplicate' | 'replace-unknown'; row: number; oldTracking: string; newTracking: string; courier: FinlandCourier }

export interface FinlandReviewRow extends FinlandParcelRow {
  /** Why the parcel needs a person, in Danish. */
  reason: string
  action: FinlandReviewAction
}

/** A row of the sheet that holds a parcel marked not sent. `shared`: the T&T cell has other parcels too. */
export interface FinlandNotSentSheetRow {
  row: number
  pickedUp: string
  orderType: string | number
  postalCode: string | number
  courier: string
  trackingText: string
  shared: boolean
  followUp: FinlandFollowUp | null
}

export interface FinlandNotSentRow extends FinlandParcelRow {
  /** parcelKey: "<delivery>|<T&T>" */
  key: string
  markedBy: string
  sheetRows: FinlandNotSentSheetRow[]
}

export interface FinlandDay {
  date: string
  total: number
  status: 'full' | 'partial' | 'none'
  missing: FinlandParcelRow[]
  review: FinlandReviewRow[]
  inSheet: FinlandParcelRow[]
  notSent: FinlandNotSentRow[]
}

export interface FinlandConflict {
  key: string
  field: FinlandFollowUpField
  original: string
  current: string
  wanted: string
}

export interface FinlandFollowUpRow {
  /** parcelKey, empty when the row has no T&T. */
  key: string
  row: number
  delivery: string
  orderType: string | number
  postalCode: string | number
  courier: FinlandCourier | 'Ukendt'
  tracking: string
  pickedUp: string
  /** What the sheet holds. */
  sheet: FinlandFollowUp
  /** The sheet with the person's own draft on top. */
  effective: FinlandFollowUp
  /** The person has a change here that is not in the sheet yet. */
  pending: boolean
  slaManual: boolean
  /** Colleagues with a change on this parcel that is not in the sheet yet. */
  othersPending: string[]
  suggestedExpected: string | null
  receivedChoices: string[]
  duplicate: boolean
  noTracking: boolean
  conflicts: FinlandConflict[]
  done: boolean
}

export interface FinlandFollowUpView {
  days: { date: string; total: number; done: number; status: 'done' | 'some' | 'open' }[]
  rows: FinlandFollowUpRow[]
  /** The most used comments, for quick choice. */
  comments: string[]
  pendingTotal: number
  pendingByDay: Record<string, number>
  othersByDay: Record<string, { name: string; count: number }[]>
}

export interface FinlandSnapshot {
  /** The SAP period last fetched (yyyy-mm-dd), null before "Hent fra SAP". */
  range: { from: string; to: string } | null
  today: string
  defaultDay: string | null
  /** ISO time of the last SAP fetch. */
  loadedAt: string | null
  /** `texts`: Danish lines on how the sheet was opened. */
  sheet: { wasOpen: boolean; filterRemoved: boolean; texts: string[]; isTest: boolean } | null
  /** Who wrote each day last, when, and how many parcels in all. */
  dayLog: Record<string, { byName: string; at: number; count: number }>
  /** The shared write lock while someone holds it. `mine`: the person asking holds it (by e-mail, not name). */
  lock: { byName: string; day: string; action: string; mine: boolean } | null
  /** Finland admin (or manager): may delete a not-sent parcel's row in the sheet. */
  isAdmin: boolean
  followUp: FinlandFollowUpView
  days: FinlandDay[]
}

export interface FinlandAppendResult {
  added: number
  skipped: number
  firstRow: number | null
  lastRow: number | null
  weekFormulaOk: boolean
}

export type FinlandFixed =
  | { kind: 'already'; tracking: string }
  | { kind: 'add'; tracking: string; row: number; skipped: number }
  | { kind: 'replace'; tracking: string; row: number; oldTracking: string }

export type FinlandDeleted =
  | { kind: 'gone'; tracking: string }
  | { kind: 'deleted'; tracking: string; row: number }

export interface FinlandFollowUpResult {
  written: number
  moved: number
  conflicts: number
  notFound: number
}

/** A row typed in by hand, as the window sends it (all text; checked in the main process). */
export interface FinlandManualInput {
  delivery: string
  orderType: string
  postalCode: string
  courier: string
  tracking: string
  /** yyyy-mm-dd */
  pickedUp: string
}

export type FinlandManualCheck =
  | { ok: true; row: Omit<FinlandParcelRow, 'courier'> & { courier: FinlandCourier } }
  | { ok: false; errors: Partial<Record<keyof FinlandManualInput, string>> }

export type FinlandManualResult =
  | { ok: true; row: number | null; skipped: number; weekFormulaOk: boolean; tracking: string }
  | { ok: false; errors: Partial<Record<keyof FinlandManualInput, string>> }

/** Which sheet everyone writes. `isTest`: the test sheet (the default). */
export interface FinlandSettings {
  workbookUrl: string
  sheetName: string
  tableName: string
  isTest: boolean
}

/** One person's changes not in the sheet yet (Administration). */
export interface FinlandDraftsPerson {
  email: string
  name: string
  count: number
  byDay: Record<string, number>
  /** ISO time of the newest change. */
  updatedAt: string
}

export interface FinlandBridge {
  /** Reads the sheet and fetches two months of parcels from SAP (FINLAND_SAP_NOT_READY when SAP is not ready). */
  load(): Promise<FinlandSnapshot>
  /** Reads only the sheet, so Opfølgning works while SAP is not ready. */
  loadSheet(): Promise<FinlandSnapshot>
  /** How many of the person's own follow-up changes are not in the sheet yet; reads only the shared drafts, never Excel. */
  pending(): Promise<number>
  writeDay(request: { date: string }): Promise<FinlandSnapshot & { result: FinlandAppendResult }>
  fixReview(request: { delivery: string; tracking: string }): Promise<FinlandSnapshot & { fixed: FinlandFixed }>
  /** `base`: the sheet values the form was opened with. */
  saveDraft(request: { key: string; wanted: Partial<FinlandFollowUp>; slaManual: boolean; base: Partial<FinlandFollowUp> }): Promise<FinlandSnapshot>
  /** The person's own drafts for `date`; `null` for every day. */
  saveFollowUp(request: { date: string | null }): Promise<FinlandSnapshot & { followUpResult: FinlandFollowUpResult }>
  resolveConflict(request: { key: string; field: FinlandFollowUpField; choice: 'sheet' | 'mine' }): Promise<FinlandSnapshot>
  checkManual(request: FinlandManualInput): Promise<FinlandManualCheck>
  addManualRow(request: FinlandManualInput): Promise<FinlandSnapshot & { manual: FinlandManualResult }>
  markNotSent(request: { delivery: string; tracking: string }): Promise<FinlandSnapshot>
  restoreNotSent(request: { key: string }): Promise<FinlandSnapshot>
  /** Finland admins only; `row` is the row number shown in the confirmation. */
  deleteNotSentRow(request: { key: string; row: number }): Promise<FinlandSnapshot & { deleted: FinlandDeleted }>
  /** Opens the courier's page in its own window; DSV's T&T is copied for Ctrl+V (`copied`). */
  openTracking(request: { courier: FinlandCourier; tracking: string }): Promise<{ copied: boolean }>
  settings(): Promise<FinlandSettings>
  /** Managers and the creator only (MANAGER_ONLY). */
  setSettings(request: { workbookUrl: string; sheetName: string; tableName: string }): Promise<FinlandSettings>
  /** Managers and the creator only (MANAGER_ONLY). */
  draftsOverview(): Promise<FinlandDraftsPerson[]>
  /** Deletes the person's drafts in the app, never in the sheet. Managers and the creator only. */
  clearDrafts(request: { email: string }): Promise<{ email: string; cleared: number }>
}
