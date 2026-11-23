import { t } from '@/lib/warehouse/text'
export type TeamId = 'TCD' | 'TRR'
export type Role = 'creator' | 'manager' | 'user'
/** Role inside CountPoint: managers come from the Hub; status managers and admins are appointed in CountPoint. */
export type AppRole = 'manager' | 'status-manager' | 'admin' | 'user'

export interface RolesView {
  team: TeamId
  canEdit: boolean
  /** Only a real (Hub) manager may grant or remove the status-manager role. */
  canGrantStatusManager: boolean
  users: { email: string; fullName: string; role: AppRole; locationRole: 'manager' | 'location-admin' | 'user' }[]
  log: { at: number; by: { email: string; name: string }; email: string; name: string; action: 'admin-added' | 'admin-removed' | 'status-manager-added' | 'status-manager-removed' | 'location-admin-added' | 'location-admin-removed' }[]
}

export type SapErrorType = 'count-mismatch' | 'duplicate-serial' | 'stock-without-serials' | 'serials-without-stock'

export interface SapError {
  id: string
  type: SapErrorType
  status: 'new' | 'open'
  firstSeen: number
  material: string
  description: string
  sloc: string
  stockType: StockType
  sapQty: number | null
  serialCount: number
  serials: string[]
  locations: { material: string; sloc: string; stockType: StockType }[]
  /** Who found it: CountPoint (MB52 vs IQ09), SAP's own report ZMS_STOCK_SER_CHK2, or both. */
  source?: 'both' | 'countpoint' | 'sap-report'
}

export type SapCheckScope = 'TCD' | 'TRR' | 'D301'

export interface SapCheckComparison {
  ran: boolean
  error: string | null
  rows: number
  both: number
  onlyCountPoint: number
  onlyReport: number
}

export interface SapCheckSummary {
  total: number
  new: number
  open: number
  fixed: number
  byType: Record<SapErrorType, number>
}

export type MailLanguage = 'da' | 'en'

export interface SapCheckMail {
  by: { email: string; name: string }
  at: number
  mode: 'new' | 'all'
  scope?: SapCheckScope
  language?: MailLanguage
  count: number
  file: string
}

export interface SapCheck {
  id: string
  scope?: SapCheckScope
  at: number
  by: { email: string; name: string; team?: TeamId }
  slocs: string[]
  sapUser: string
  errors: SapError[]
  fixed: { id: string; type: SapErrorType; material: string; description: string; sloc: string; stockType: StockType; firstSeen: number }[]
  summary: SapCheckSummary
  comparison?: SapCheckComparison
  mail: SapCheckMail | null
  mails?: SapCheckMail[]
}

export interface SapCheckEntry {
  id: string
  scope?: SapCheckScope
  at: number
  by: { email: string; name: string; team?: TeamId }
  summary: SapCheckSummary
  comparison?: SapCheckComparison
  mail: SapCheckMail | null
}

export interface SapCheckSettings {
  to: string
  cc: string
  language: MailLanguage
  updatedBy: { email: string; name: string } | null
  updatedAt: number | null
}

export interface SapCheckOverview {
  role: AppRole
  canMail: boolean
  team: TeamId
  settings: SapCheckSettings
  latest: SapCheck | null
  history: SapCheckEntry[]
}

export interface WarehouseUser {
  email: string
  fullName: string
  role: Role
  team: TeamId
  storageLocations: string[]
}

export type SapStateName =
  | 'ready'
  | 'busy'
  | 'popup'
  | 'max-sessions'
  | 'scripting-off'
  | 'not-logged-in'
  | 'not-running'
  | 'wrong-system'
  | 'error'

export interface SapStatus {
  state: SapStateName
  ready: boolean
  system: string | null
  client: string | null
  user: string | null
  reason?: 'timeout' | 'failed'
  /** The SAP system Optælling is set to (PS4, or QS4 when testing). */
  expectedSystem?: string
}

export type Kind = 'new' | 'used' | 'accessory' | 'other'
export type StockType = 'unrestricted' | 'blocked'
export type FetchStep = 'check' | 'mb52' | 'iq09-unrestricted' | 'iq09-blocked' | 'sap-report' | 'done'

export type CountScope =
  | { type: 'slocs'; slocs: string[]; materials: string[]; stockTypes?: StockType[]; kinds?: Kind[] }
  | { type: 'materials'; slocs: string[]; materials: string[]; stockTypes?: StockType[]; kinds?: Kind[] }

export interface Person {
  email: string
  name: string
}

export interface GroupSummary {
  materials: number
  lines: number
  unrestricted: number
  blocked: number
  serials: number
  value: number
}

export interface MisplacedLine {
  material: string
  description: string
  kind: Kind
  sloc: string
  unrestricted: number
  blocked: number
  suggestions: string[]
}

export interface SnapshotSummary {
  slocs: string[]
  groups: Record<'new' | 'used' | 'accessory', GroupSummary>
  misplaced: MisplacedLine[]
  excluded: { other: { materials: number; quantity: number }; manual: { material: string; reason: string }[] }
}

export interface CountPreview {
  token: string
  summary: SnapshotSummary
  accessoryOutside: { sloc: string; materials: number; quantity: number }[]
  placementSheet: { file: string; placements: number } | null
}

export interface CountMeta {
  id: string
  team: TeamId
  name: string
  scope: CountScope
  status: 'open' | 'closed'
  owner: Person
  createdAt: number
  fetchedAt: number
  snapshotVersion?: number
  closedAt?: number
  closedBy?: Person
  statusId?: string | null
}

export interface StatusHistoryEntry {
  at: number
  by: Person
  action: string
  reason?: string
}

export interface CountStatus {
  id: string
  team: TeamId
  name: string
  year: number
  quarter: number
  state: 'open' | 'locked'
  startedBy: Person
  startedAt: number
  lockedBy?: Person
  lockedAt?: number
  history: StatusHistoryEntry[]
  counts: CountListEntry[]
  progress: StatusProgress
  reports?: { version: number; file: string; at: number; counts?: { countId: string; name: string; file: string }[] }[]
  taken?: TakenScope[]
}

export interface StatusChecklist {
  statusId: string
  state: 'open' | 'locked'
  ready: boolean
  counts: { id: string; name: string; owner: Person; open: boolean; materials: number; pending: { material: string; description: string; status: ApprovalStatus }[] }[]
}

export interface StatusProgress {
  counts: number
  closed: number
  reached: number
  total: number
  percent: number
  valueDiff: number
}

/** Over and under both count as difference (|over| + |under|), as a share of the SAP stock. */
export interface DifferenceTotals {
  lines: number
  sapQty: number
  counted: number
  over: number
  under: number
  absDiff: number
  absPercent: number
  sapValue: number
  valueOver: number
  valueUnder: number
  valueAbs: number
  valuePercent: number
  priced: boolean
}

export interface ArchiveLine {
  countId: string
  countName: string
  material: string
  description: string
  kind: Kind
  sloc: string
  stockType: StockType
  sapQty: number
  counted: number
  diff: number
  unitPrice: number | null
  valueDiff: number | null
  approval: { status: ApprovalStatus; by: string | null; at: number | null } | null
  doc: { docNo: string | null; year: string | null; status: PiDocStatus; system: string | null; materialDoc: string | null; materialYear: string | null } | null
}

export interface StatusArchive {
  statusId: string
  totals: DifferenceTotals
  counts: { id: string; name: string; totals: DifferenceTotals }[]
  lines: ArchiveLine[]
}

export interface TakenScope {
  countId: string
  name: string
  ownerName: string
  type: 'slocs' | 'materials'
  slocs: string[]
  materials: string[]
  stockTypes: StockType[]
  kinds: Kind[]
}

export interface StatusOverview {
  active: CountStatus | null
  statuses: CountStatus[]
  unassigned: CountListEntry[]
  canManage: boolean
}

export interface CountListEntry {
  id: string
  name: string
  scope: CountScope
  status: 'open' | 'closed'
  owner: Person
  createdAt: number
  fetchedAt: number
  statusId?: string | null
  summary: { percent: number; reached: number; total: number; valueDiff?: number; updatedAt: number } | null
  members: number
  requests: number
  myStatus: MemberStatus | null
  /** The owner, a manager or an Optælling admin: may approve or reject join requests. */
  canDecideMembers: boolean
}

export type MemberStatus = 'requested' | 'approved' | 'rejected'

export interface Member {
  email: string
  name: string
  role: 'owner' | 'participant'
  status: MemberStatus
  requestedAt?: number
  decidedAt?: number
  decidedBy?: Person
}

/** Something in an open count that waits for the user; shown in the Hub's bell and as a Windows notification. */
export type CountNotice = { countId: string; countName: string; at: number } & (
  | { type: 'join-request'; email: string; name: string }
  | { type: 'join-decided'; approved: boolean; name: string }
  | { type: 'submitted'; material: string; name: string; diff: number | null }
  | { type: 'returned'; material: string; name: string; comment: string }
)

export interface MyAccess {
  email: string
  isOwner: boolean
  isManager: boolean
  /** May fetch SAP again for the count and the stock of the day: owner, manager or Optælling admin. */
  canFetchSap: boolean
  status: MemberStatus | null
  canWrite: boolean
  /** A manager or an Optælling admin: takes part in every count without asking (`status` is then 'approved'). */
  byRole: boolean
  /** The owner, a manager or an Optælling admin: approves and rejects join requests. */
  canDecideMembers: boolean
}

export interface CountListLine {
  lineId: string
  area: string
  place: string
  material: string
  description: string
  sloc: string
  sheetQty: number | null
}

export interface CountMaterial {
  material: string
  description: string
  kind: Kind
  serialManaged: boolean
  sloc: string
  unrestricted: number
  blocked: number
}

export interface Place {
  name: string
  area: string
  source: 'sheet' | 'own'
}

export interface OpenCount {
  meta: CountMeta
  statusLocked: boolean
  /** `fetchedAt` of the SAP snapshot behind `materials` and `countLists`; differs from the state's after "Hent SAP igen" elsewhere. */
  snapshotFetchedAt?: number
  summary: SnapshotSummary
  me: MyAccess
  countLists: CountListLine[]
  materials: CountMaterial[]
  areas: string[]
  places: Place[]
  serialRules: Record<string, SerialRuleFlags>
}

export interface SerialRuleFlags {
  unrestricted: boolean
  blocked: boolean
}

export interface SerialRule extends SerialRuleFlags {
  material: string
  updatedBy?: Person
  updatedAt?: number
}

export interface SerialRulesView {
  supported: boolean
  canEdit: boolean
  rules: SerialRule[]
}

export interface CopySerialsResult {
  long: boolean
  total: number
  withoutLong: string[]
  withoutLongTotal: number
  lookedUp: number
}

/**
 * One line for the SAP count document: quantity = SAP stock of the day + the approved difference. Serial-managed:
 * quantity = the serial list of the day (SAP's serials today minus the ones missing at approval); `expectedQty` is
 * "SAP today + difference", so a mismatch can be shown.
 */
export interface CountDocRow {
  material: string
  description: string
  kind: Kind
  sloc: string
  stockType: StockType
  serialManaged: boolean
  foundSerials: number
  status: ApprovalStatus
  approved: boolean
  sapAtApproval: number | null
  diff: number | null
  sapToday: number | null
  expectedQty: number | null
  docQty: number | null
  /** The stock of the day was fetched before serials were included: fetch again to get the list. */
  needsSerials: boolean
  /** Serial-managed and approved while it had quantity lines: no quantity or list until it is reset and approved again. */
  serialLinesAtApproval?: boolean
}

export interface CountDoc {
  fetchedAt: number | null
  fetchedBy: { email: string; name: string } | null
  canFetch: boolean
  missingApproval: number
  withSerials: boolean
  rows: CountDocRow[]
}

export type PiDocStatus = 'creating' | 'created' | 'printed' | 'counted' | 'posted' | 'deleted'
export type PiDocAction = 'print' | 'count' | 'post'

/** A physical inventory document in SAP, created from CountPoint. */
export interface PiDoc {
  id: string
  docNo?: string
  year?: string
  reference: string
  status: PiDocStatus
  sloc: string
  stockType: StockType
  /** 'terminal' only on documents from before new/used were split. */
  kind: Kind | 'terminal'
  transaction?: 'MI04' | 'ZMS_COUNT_SERIAL'
  lines: { material: string; description: string; kind: Kind; serialManaged: boolean; transaction: 'MI04' | 'ZMS_COUNT_SERIAL' }[]
  createdBy: { email: string; name: string; at: number }
  /** When the SAP figures of the day the document was made from were fetched; missing on documents of older clients. */
  docFetchedAt?: number | null
  printedBy?: { email: string; name: string; at: number; message: string }
  countedBy?: { email: string; name: string; at: number }
  postedBy?: { email: string; name: string; at: number }
  materialDoc?: string | null
  differences?: { material: string; book: number; counted: number; diff: number; amount: number }[]
  entered?: Record<string, { qty?: number; serials?: number; by: string; at: number }>
  next: PiDocAction | null
  canNext: boolean
  canDelete: boolean
  deletedBy?: { email: string; name: string; at: number; message: string }
}

export interface PiDocList {
  system: string
  /** False while CountPoint may not write to this SAP system yet (PS4 until it is enabled). */
  writeEnabled: boolean
  role: AppRole
  canCreate: boolean
  docs: PiDoc[]
}

export interface ResultRow {
  material: string
  description: string
  kind: Kind
  sloc: string
  stockType: StockType
  serialManaged: boolean
  unitPrice: number | null
  sapQty: number
  sapSerials: number
  countedSerials: number
  countedLines: number
  counted: number
  diff: number
  valueDiff: number | null
  misplaced: boolean
  suggestions: string[]
  sapMismatch: boolean
  /** Set when the material is approved: the SAP quantity, count and difference are those frozen at approval. */
  frozenAt?: number
  /** Counted after the approval (not part of the frozen difference). */
  countedAfter?: number
}

export interface CountLine {
  lineId: string
  place: string
  area: string
  material: string
  sloc: string
  stockType: StockType
  qty: number
  status: 'counted' | 'error'
  comment: string
  by: string
  byName: string
  at: number
}

export interface MoveItem {
  serial: string | null
  material: string | null
  description: string
  sloc: string | null
  stockType: StockType | null
  quantity: number
  reason: 'misplaced' | 'other-sloc'
  suggestions: string[]
  by: string
  byName: string
  at: number
  place: string
}

export interface Progress {
  overall: { reached: number; total: number; percent: number }
  terminals: Record<'new' | 'used', Record<StockType, { found: number; expected: number }>>
  accessory: { lines: { counted: number; total: number }; quantity: { counted: number; sap: number }; serials: { found: number; expected: number } }
  materials: { total: number; counted: number; approved: number; posted: number }
  areas: { area: string; counted: number; total: number }[]
  slocs: { sloc: string; found: number; expected: number; countedQty: number; sapQty: number }[]
  counters: { email: string; name: string; events: number; serials: number; lines: number; lastAt: number }[]
  pace: { perHour: number; etaHours: number | null }
  fetchedAt: number
}

export interface Claim {
  area: string
  email: string
  name: string
  at: number
  lastActivity: number
}

export type ApprovalStatus = 'approved' | 'returned' | 'posted' | 'submitted' | 'open'

/** A manager undid a wrong "Bogført i SAP" mark: who, when, why and the post that was undone. */
export interface Unpost {
  by: Person
  at: number
  reason: string
  postedBy: Person | null
  postedAt: number | null
}

export interface Approval {
  status: ApprovalStatus
  comment?: string
  by?: Person
  at?: number
  postedBy?: Person
  postedAt?: number
  /** Every undone "Bogført i SAP" mark, oldest first; kept through reset, sending back and approving again. */
  unposts?: Unpost[]
  /** Set when a counter sent the material to approval. */
  diff?: number
  sapQty?: number
  counted?: number
}

export interface MaterialLock {
  material: string
  holder: { email: string; name: string }
  at: number
  helpers: { email: string; name: string; at: number }[]
  requests: { email: string; name: string; at: number }[]
}

export interface JournalStatus {
  pending: number
  online: boolean
  lastError: string | null
  lastFlushAt: number | null
  count: number
}

export interface JournalEvent {
  id: string
  type: 'scan' | 'import' | 'line' | 'line-delete' | 'serial-remove' | 'undo'
  at: number
  by: string
  byName: string
  serial?: string
  place?: string
  material?: string
  qty?: number
  serials?: string[]
  document?: string
}

export interface CountState {
  meta: CountMeta
  statusLocked: boolean
  /** `fetchedAt` of the SAP snapshot the figures are built from. */
  snapshotFetchedAt?: number
  me: MyAccess
  progress: Progress
  rows: ResultRow[]
  totals: Partial<Record<Kind, Partial<Record<StockType, { sapQty: number; counted: number; diff: number; valueDiff: number }>>>>
  lines: CountLine[]
  moves: MoveItem[]
  movesTotal: number
  duplicates: { serial: string; by: string; byName: string; at: number; place: string; previous: { byName: string; at: number; place: string } }[]
  serials: { found: number; expected: number; missing: number; extra: number }
  members: Member[]
  claims: Claim[]
  materialLocks: MaterialLock[]
  approvals: Record<string, Approval>
  /** Approved or posted serial-managed materials whose approval held quantity lines (from the journal, so also after the lines are deleted). */
  approvedWithSerialLines?: string[]
  journal: JournalStatus
  myLastEvents: JournalEvent[]
}

export type ScanOutcome = 'found' | 'duplicate' | 'other-sloc' | 'other-count' | 'outside' | 'unknown' | 'invalid'

export interface ScanResult {
  outcome: ScanOutcome
  otherCount?: string
  serial: string
  material: string | null
  description: string
  kind: Kind | null
  sloc: string | null
  stockType: StockType | null
  blocked: boolean
  move: boolean
  suggestions: string[]
  previous?: { by: string; byName: string; at: number; place: string }
  saved: boolean
  eventId?: string
  areaWarning?: { area: string; byName: string } | null
  materialWarning?: { kind: 'locked' | 'approved'; byName: string } | null
  journal?: JournalStatus
}

export interface ImportCheck {
  dryRun: boolean
  total: number
  invalid: number
  repeated: number
  found: number
  blocked: number
  move: number
  duplicate: number
  otherSloc: number
  otherCount: number
  outside: number
  unknown: number
  toImport?: number
  imported?: number
}

export interface MatdocLookup {
  document: string
  transaction: 'ZMS_REP' | 'ZMS_PREP'
  serials: string[]
  materials: { material: string; description: string; count: number }[]
  check: ImportCheck
  alreadyImported: { byName: string; at: number; place: string } | null
}

export interface SerialListItem {
  serial: string
  material: string | null
  description?: string
  sloc: string | null
  stockType: StockType | null
  outcome?: string
  place?: string
  byName?: string
  at?: number
}

export interface MaterialSerialItem {
  serial: string
  sloc: string | null
  stockType: StockType | null
  place?: string
  byName?: string
  at?: number
  source?: 'scan' | 'import'
  outcome?: string
  document?: string
}

export interface MaterialSerials {
  material: string
  description: string
  kind: Kind
  serialManaged: boolean
  expected: number
  totals: { found: number; missing: number; elsewhere: number }
  found: MaterialSerialItem[]
  missing: MaterialSerialItem[]
  elsewhere: MaterialSerialItem[]
}

export interface RulesView {
  team: TeamId
  kinds: Kind[]
  rules: Record<string, Kind[] | null>
  stored: Record<string, { kinds: Kind[]; updatedBy: Person; updatedAt: number }>
  suggestions: { fromCount: string; fetchedAt: number; bySloc: Record<string, { quantities: Record<string, number>; suggested: Kind[] }> } | null
  canEdit: boolean
}

export interface LineInput {
  lineId?: string
  place: string
  area?: string
  material: string
  sloc?: string
  stockType: StockType
  qty: number
  status?: 'counted' | 'error'
  comment?: string
}

// ---------- Placeringer ----------
export type LocationPurpose = 'reserve' | 'pick' | 'station' | 'reserved'
export type LocationType = 'Palle' | 'Hylde' | 'Reol' | 'Bord' | 'Swap' | 'Gulv'
export interface PersonRef { email: string; name: string }

export interface Location {
  id: string
  name: string
  area: string
  type: LocationType
  purpose: LocationPurpose
  capacity: number
  /** Pick places and stations: their materials; reserve places: materials that have a fixed place here. */
  fixedMaterials: string[]
  /** A shelf in a rack ("E9 H5" = rack E9, shelf 5). */
  rack?: string
  shelf?: number
  active: boolean
  note: string
  updatedAt: number
  updatedBy: PersonRef
}

/** Hyldelager: one line per lagerhylde and material (material + quantity, merged per material). */
export interface StockLine {
  id: string
  location: string
  material: string
  quantity: number
  note: string
  updatedAt: number
  updatedBy: PersonRef
}
export type StockLineView = StockLine & { description: string }

export interface Pallet {
  id: string
  location: string
  material: string
  quantity: number | null
  receivedAt: number
  /** The 49/50 material document, normalised ("5000032337 2026 0001"). */
  document: string | null
  serials: string[]
  sloc: string
  tags: string[]
  note: string
  createdAt: number
  createdBy: PersonRef
}
export type PalletView = Pallet & { ageDays: number; description: string }

/** 'empty' only appears in history from before pick places lost their status. */
export type LocationEventType = 'putaway' | 'take' | 'move' | 'sloc' | 'empty' | 'refill' | 'edit-pallet' | 'location' | 'import' | 'undo' | 'shelf-put' | 'shelf-take' | 'shelf-move' | 'shelf-set' | 'migrate' | 'layout'
export interface LocationEvent {
  id: string
  at: number
  by: PersonRef
  type: LocationEventType
  pallet?: string
  location?: string
  from?: string
  to?: string
  quantity?: number | null
  material?: string
  changes?: Record<string, [unknown, unknown]>
  /** The action the event belongs to; an undo undoes every event of it. */
  tx?: string
  undoneAt?: number
  undoneBy?: PersonRef
  /** On an 'undo' event: the action it undid. */
  undoes?: string
  /** On a 'location' event for many places (deactivated together). */
  count?: number
  /** On a 'layout' event (a drawing published). */
  counts?: { create: number; rename: number; change: number; remove: number }
  detail?: { created: string[]; renamed: [string, string][]; removed: string[]; changed: string[] }
}

/** The log: events newest first; `canUndo` (with `reason` when not) only for managers and Placerings admins. */
/** What undoing a whole action does (place names): pallets removed, put back or changed (quantity from → to, `now` = where it stands now); places likewise. */
export interface UndoEffect {
  pallets: { remove: string[]; restore: string[]; change: { location: string; from: number | null; to: number | null; now?: string }[] }
  places: { remove: string[]; restore: string[]; change: string[] }
  /** Shelf lines (material + quantity): `from` now → `to` after the undo; null = no line. */
  stock?: { location: string; material: string; from: number | null; to: number | null }[]
}

export interface LocationLog {
  events: (LocationEvent & { canUndo: boolean; reason?: string; effect?: UndoEffect })[]
  canUndo: boolean
  people: { email: string; name: string }[]
}

export interface AreaSummary { area: string; capacity: number; used: number; free: number }
/** `capacity`/`free` are null on a floor (no limit). */
export interface Occupancy { used: number; capacity: number | null; free: number | null }

export interface LocationsOverview {
  areas: AreaSummary[]
  counts: { locations: number; pallets: number; stock?: number }
  imported: boolean
  live: boolean
  /** The hub's labels for pallets (Sluse oppe, Brandskab …). */
  tags: string[]
  /** The published drawing: its version and the place ids on it. */
  drawing: { version: number; linked: string[] } | null
}

export interface SlotSuggestion { location: string; reason: 'fixed' | 'near' | 'free' }
export interface LocationSearch {
  materials: { material: string; description: string }[]
  locations: Location[]
  pallets: PalletView[]
  /** Rack names starting with the query ("E9"). */
  racks: string[]
}
export interface MaterialCard {
  material: string
  description: string
  stations: Location[]
  pickPlaces: Location[]
  reserve: (Pallet & { ageDays: number })[]
  /** The material's lines on shelves, largest first. */
  shelves: { location: string; name: string; quantity: number }[]
  /** The shelf to refill a pick place from when there is no reserve pallet. */
  refillShelf: string | null
  /** Reserve pallets and shelves together. */
  total: number
  history: LocationEvent[]
}
export interface LocationCard {
  location: Location
  fixed: { material: string; description: string }[]
  occupancy: Occupancy
  pallets: PalletView[]
  /** A lagerhylde's lines. */
  stock: StockLineView[]
  history: LocationEvent[]
}
export interface RackCard {
  rack: string
  area: string
  purpose: LocationPurpose
  /** Highest shelf first. */
  shelves: { location: Location; stock: StockLineView[] }[]
  history: LocationEvent[]
}
export interface MapMaterial { material: string; description: string; pallets: number; quantity: number | null; oldestAt: number | null; fixed: boolean }
export interface MapPlaceContent { materials: MapMaterial[] }
/** What stands on every non-empty place, and per material the place of its oldest pallet (as Tag). */
export interface MapContents { places: Record<string, MapPlaceContent>; oldest: Record<string, string> }
export interface DeleteResult { deleted: string[]; kept: { name: string; reason: string }[] }
export interface LocationList {
  locations: (Location & { used: number; stockCount: number })[]
  tags: string[]
  /** Managers, status managers and Optælling's admins maintain the locations. */
  canAdmin: boolean
  imported: boolean
  live: boolean
  /** The published drawing: its version and the place ids on it. */
  drawing: { version: number; linked: string[] } | null
}
export interface PalletCard { pallet: PalletView; location: Location | null; history: LocationEvent[] }
export interface DocumentLookup { document: string; materials: { material: string; description: string; quantity: number; serials: string[] }[] }

export type ImportWarningCode = 'NOT_IN_SAP' | 'DESCRIPTION_DIFFERS' | 'AREA_FROM_NAME' | 'UNKNOWN_TYPE' | 'ROW_SKIPPED' | 'MIXED_PLACE' | 'NOT_CHECKED' | 'PALLET_PLACE_MANY'
export type ImportStep = 'sheet' | 'check' | 'mb52' | 'mm60' | 'plan' | 'done'
export interface ImportPreview {
  file: string
  /** MM60 failed: the materials it should have checked are imported without a description (NOT_CHECKED). */
  mm60Error: string | null
  stats: { locations: number; pallets: number; stock?: number; materials: number; byArea: Record<string, number>; byPurpose: Partial<Record<LocationPurpose, number>> }
  warnings: { row: number; name: string; code: ImportWarningCode; detail: string }[]
  examples: PalletView[]
  token: string
  /** Places already in the Hub (an import then needs `replace`). */
  existing: number
  /** Placeringer is in daily use; the sheet can no longer be imported. */
  live: boolean
}

export interface PalletInput {
  location: string
  material: string
  quantity?: number | null
  document?: string | null
  serials?: string[]
  sloc?: string
  receivedAt?: number
  tags?: string[]
  note?: string
}
export interface LocationInput {
  name: string
  area?: string
  type: LocationType
  purpose: LocationPurpose
  /** Only for Bord, Swap and the old Reol type: a pallet place is 1, a floor has no limit. */
  capacity?: number
  fixedMaterials?: string[]
  note?: string
}

// ---------- Tegningen (the warehouse drawing) ----------
export type LayoutItemType = 'rack' | 'floorrow' | 'shelfrack' | 'floor' | 'special' | 'dock' | 'station' | 'receiving' | 'gate' | 'pc' | 'office' | 'text'
export type LayoutSlotKind = 'pallet' | 'shelf' | 'floor' | 'special' | 'pick-unnamed' | 'aisle' | 'blocked'
export type LayoutOwner = 'TCD' | 'TRR' | 'Andet'
/** rack: pos (bay from start) + level (from below); pull-out: unit + shelf (1 = top); shelfrack: section + shelf; floorrow: pos. `manual`: the name was typed and patterns leave it. */
export interface LayoutSlot { id: string; name: string; kind: LayoutSlotKind; purpose: 'reserve' | 'pick'; capacity?: number; manual?: boolean; pos?: number; level?: number; unit?: number; shelf?: number; section?: number }
export interface LayoutPull { count: number; firstNo: number; shelves: number; perUnit?: Record<number, number>; owner?: LayoutOwner }
export interface LayoutItem {
  id: string
  type: LayoutItemType
  x: number
  y: number
  w: number
  h: number
  rot?: { cx: number; cy: number; x: number; y: number }
  cut?: [number, number][]
  name: string
  note: string
  owner?: LayoutOwner
  floor?: 'ground' | 'mezz'
  visual?: boolean
  bays?: number
  levels?: number
  firstNo?: number
  firstBay?: 'start' | 'end'
  bayLevels?: Record<number, number>
  aisles?: number[]
  spacers?: number[]
  pull?: LayoutPull
  count?: number
  depth?: number
  depthFlip?: boolean
  sections?: number
  shelves?: number
  perSection?: Record<number, number>
  pattern?: string
  levelPatterns?: Record<number, string>
  slots: LayoutSlot[]
}
/** `outside`: the list places decided to stay outside the published drawing; they start the next draft's decisions. */
export interface WarehouseLayout { version: number; hall: { w: number; h: number }; notes: string; items: LayoutItem[]; publishedAt?: number; publishedBy?: PersonRef; outside?: string[] }
/** `rev` goes up with every saved change; a save or publish on another revision is refused (LAYOUT_STALE). */
export interface LayoutDraft extends WarehouseLayout { basedOn: number; rev?: number; editedBy: PersonRef; editedAt: number; free?: { rev: number }; decisions: { outside: string[]; remove: string[] } }
export type PublishBlockCode = 'NAME_TWICE' | 'NAME_TAKEN' | 'NOT_EMPTY' | 'TYPE_REFUSED' | 'SPECIAL_UNKNOWN'
/** What a publish does to the places; `version` is the published one now (0 = none), `linked` the place ids on the drawing after it. */
export interface PublishPlan {
  basedOn: number
  version: number
  /** The draft revision previewed; publishLayout passes it back. */
  rev: number
  create: { slotId: string; name: string; type: 'Palle' | 'Hylde' | 'Gulv' | null; purpose: 'reserve' | 'pick' | null; capacity: number | null }[]
  rename: { slotId: string; from: string; to: string; pallets: number; stock: number }[]
  change: { slotId: string; name: string; changes: Record<string, [unknown, unknown]> }[]
  remove: { name: string; pallets: number; stock: number }[]
  outside: { name: string; type: LocationType; purpose: LocationPurpose; pallets: number; stock: number }[]
  blocked: { code: PublishBlockCode; name: string; detail: string }[]
  linked: string[]
  counts: { create: number; rename: number; change: number; remove: number; outside: number; blocked: number; unchanged: number }
}
export interface LayoutVersion { version: number; publishedAt?: number; publishedBy?: PersonRef }

/** A daily action while M: is down: kept on this PC (`queued`), or already applied before (`duplicate`). */
export type Deferred = { queued: true } | { duplicate: true }
/** Daily actions carry an id so a retry is never applied twice. */
export type WithActionId<T> = T & { actionId?: string; /** What the action was, shown if a replay fails ("Tag R162-0717 fra A1.1"). */ label?: string }
/** A queued action that could not be done when it was replayed. */
export interface SyncFailure { id: string; method: string; label: string; name: string; email: string; code: string; at: number }

export interface LocationsBridge {
  overview(): Promise<LocationsOverview>
  lookupDocument(request: { document: string }): Promise<DocumentLookup>
  suggest(request: { material: string }): Promise<{ slots: SlotSuggestion[] }>
  putAway(request: WithActionId<{ pallets: PalletInput[] }>): Promise<{ created: Pallet[]; /** Pick places filled straight from the pallet (no pallet is kept there). */ filled: string[] } | Deferred>
  take(request: WithActionId<{ pallet: string; quantity?: number }>): Promise<{ pallet: Pallet | null; olderPallet: (Pallet & { ageDays: number }) | null } | Deferred>
  /** From a reserve pallet (`pallet`) or from a shelf (`shelf` + `material` + `quantity`). */
  refill(request: WithActionId<{ location: string; pallet?: string; shelf?: string; material?: string; quantity?: number }>): Promise<{ pallet?: Pallet | null; line?: StockLine | null } | Deferred>
  move(request: WithActionId<{ pallet: string; to: string }>): Promise<{ pallet: Pallet | null } | Deferred>
  changeSloc(request: WithActionId<{ pallet: string; sloc: string }>): Promise<{ pallet: Pallet } | Deferred>
  /** `expected`: what the person saw of each changed field; the edit is refused (PALLET_CHANGED) when the pallet no longer has it. */
  editPallet(request: WithActionId<{ pallet: string; changes: Partial<Omit<Pallet, 'id' | 'location' | 'createdAt' | 'createdBy'>>; expected?: Partial<Omit<Pallet, 'id' | 'location' | 'createdAt' | 'createdBy'>> }>): Promise<{ pallet: Pallet } | Deferred>
  search(request: { query: string }): Promise<LocationSearch>
  materialCard(request: { material: string }): Promise<MaterialCard>
  locationCard(request: { location: string }): Promise<LocationCard>
  palletCard(request: { pallet: string }): Promise<PalletCard>
  list(): Promise<LocationList>
  /** When Placeringer last changed, from any PC. */
  stamp(): Promise<{ changedAt: number }>
  log(request?: { query?: string; person?: string; type?: LocationEventType; days?: number }): Promise<LocationLog>
  /** `at` (the event's time) picks its month file, so the undo locks fewer files on M:. */
  undo(request: WithActionId<{ eventId: string; at?: number }>): Promise<{ undone: number } | Deferred>
  rackCard(request: { rack: string }): Promise<RackCard>
  mapContents(): Promise<MapContents>
  shelfPut(request: WithActionId<{ location: string; material: string; quantity: number }>): Promise<{ line: StockLine } | Deferred>
  /** `quantity` left out: all of it. */
  shelfTake(request: WithActionId<{ location: string; material: string; quantity?: number }>): Promise<{ left: StockLine | null; taken: number } | Deferred>
  shelfMove(request: WithActionId<{ from: string; to: string; material: string; quantity?: number }>): Promise<{ line: StockLine } | Deferred>
  /** The exact quantity; 0 removes the line. */
  shelfSet(request: WithActionId<{ location: string; material: string; quantity: number }>): Promise<{ line: StockLine | null } | Deferred>
  createRack(request: { name: string; shelves: number; area?: string; purpose?: 'reserve' | 'pick' }): Promise<{ created: Location[] }>
  addShelf(request: { rack: string }): Promise<{ location: Location }>
  /** Only empty places are deleted; `allOrNothing` (a rack) deletes none when one is not empty. */
  deleteLocations(request: { locations: string[]; allOrNothing?: boolean }): Promise<DeleteResult>
  setActiveMany(request: { locations: string[]; active: boolean }): Promise<{ changed: number }>
  createLocation(request: LocationInput): Promise<{ location: Location }>
  createSeries(request: { prefix: string; aisles: [number, number]; places: [number, number]; type: LocationType; purpose: LocationPurpose; capacity?: number }): Promise<{ created: Location[]; skipped: string[] }>
  /** `usePallets`: a reserve place with pallets becomes a pick place, and its pallets become the pick pallet. */
  editLocation(request: { location: string; changes: Partial<LocationInput>; usePallets?: boolean }): Promise<{ location: Location }>
  setActive(request: { location: string; active: boolean }): Promise<{ location: Location }>
  setTags(request: { tags: string[] }): Promise<{ tags: string[] }>
  previewImport(): Promise<ImportPreview>
  applyImport(request: { token: string; replace?: boolean }): Promise<{ locations: number; pallets: number }>
  pending(): Promise<{ pending: number; failures: SyncFailure[] }>
  acknowledgeFailures(ids: string[]): Promise<{ ok: true }>
  /** The published drawing; everyone in the hub. The rest are for Placerings admins and need M: (never queued). */
  layout(): Promise<{ layout: WarehouseLayout | null }>
  layoutDraft(): Promise<{ draft: LayoutDraft | null; version: number }>
  layoutPreview(): Promise<PublishPlan>
  layoutVersions(): Promise<{ versions: LayoutVersion[] }>
  startLayoutDraft(): Promise<{ draft: LayoutDraft }>
  /** Saves on the draft's revision `draft.rev`. `takeOver` without a draft makes you the editor of the stored draft and returns it. */
  saveLayoutDraft(request: { draft?: LayoutDraft; takeOver?: boolean }): Promise<{ editedAt: number; rev: number; draft?: LayoutDraft }>
  /** Discards the draft and returns the next one, started from the published drawing in the same write. */
  discardLayoutDraft(): Promise<{ ok: true; draft?: LayoutDraft }>
  /** Publishes the stored draft if it is still revision `rev` (the previewed one); `draft` is the next one, on the new drawing. */
  publishLayout(request: { rev: number }): Promise<{ version: number; counts: PublishPlan['counts']; draft?: LayoutDraft }>
  /** Opens an older version as the draft. */
  openLayoutVersion(request: { version: number; takeOver?: boolean }): Promise<{ draft: LayoutDraft }>
  onChanged(listener: (payload: { team: TeamId }) => void): () => void
  onSyncFailed(listener: (payload: { teams: TeamId[] }) => void): () => void
  /** An action of `team` was kept on this PC (M: down or busy): the waiting count changed. */
  onQueued(listener: (payload: { team: TeamId }) => void): () => void
  /** The steps of previewImport: sheet, check, mb52, mm60, plan, done. */
  onImportProgress(listener: (payload: { step: ImportStep }) => void): () => void
}

export interface WarehouseBridge {
  me(): Promise<WarehouseUser>
  app: {
    copyText(text: string): Promise<{ ok: true }>
  }
  sap: {
    status(options?: { fresh?: boolean }): Promise<SapStatus>
    onFetchProgress(listener: (progress: { step: FetchStep }) => void): () => void
  }
  statuses: {
    overview(): Promise<StatusOverview>
    start(request: { year: number; quarter: number; name?: string }): Promise<CountStatus>
    checklist(id: string): Promise<StatusChecklist>
    /** Locks the status; the final reports are written in `language` (Danish unless 'en'). */
    lock(id: string, language?: 'da' | 'en'): Promise<CountStatus>
    unlock(request: { id: string; reason: string }): Promise<CountStatus>
    remove(id: string): Promise<{ ok: true; counts: number }>
    archive(id: string): Promise<StatusArchive>
    showInSap(request: { system: string | null; kind: 'mi03' | 'mb03'; docNo: string; year: string }): Promise<{ ok: true }>
  }
  counts: {
    list(): Promise<CountListEntry[]>
    preview(request: { scope: { type: 'slocs'; slocs: string[]; stockTypes?: StockType[]; kinds?: Kind[] } | { type: 'materials'; materials: string[]; stockTypes?: StockType[] }; exclusions?: { material: string; reason: string }[] }): Promise<CountPreview>
    create(request: { token: string; name: string }): Promise<CountMeta>
    open(id: string): Promise<OpenCount>
    state(id: string): Promise<CountState>
    serials(request: { id: string; kind: 'missing' | 'extra' | 'duplicates'; query?: string; limit?: number }): Promise<{ total: number; items: SerialListItem[] }>
    materialSerials(request: { id: string; material: string; query?: string; limit?: number }): Promise<MaterialSerials>
    scan(request: { id: string; serial: string; place: string }): Promise<ScanResult>
    undo(request: { id: string; eventId?: string }): Promise<{ undone: JournalEvent }>
    removeSerial(request: { id: string; serial: string }): Promise<{ serial: string; material: string | null; previous: { byName: string; at: number; place: string }; eventId: string }>
    saveLine(request: { id: string; line: LineInput }): Promise<{ lineId: string; eventId: string }>
    deleteLine(request: { id: string; lineId: string }): Promise<{ ok: true }>
    importSerials(request: { id: string; text?: string; serials?: string[]; place: string; document?: string; dryRun: boolean }): Promise<ImportCheck>
    lookupMatdoc(request: { id: string; document: string }): Promise<MatdocLookup>
    importFile(title?: string): Promise<{ fileName: string; serials: string[] } | null>
    requestJoin(id: string): Promise<Member>
    decideMember(request: { id: string; email: string; approve: boolean }): Promise<Member>
    /** What waits for the user in the team's open counts (the Hub's bell). */
    notifications(): Promise<CountNotice[]>
    /** A count changed through this PC in a way that can change someone's notifications. */
    onChanged(listener: (payload: { team: TeamId }) => void): () => void
    claim(request: { id: string; area: string }): Promise<Claim>
    release(request: { id: string; area: string }): Promise<{ ok: true }>
    close(id: string): Promise<CountMeta>
    reopen(id: string): Promise<CountMeta>
    remove(id: string): Promise<{ ok: true }>
    refetchPreview(id: string): Promise<{ token: string; diff: { changes: { material: string; sloc: string; before: Record<StockType, number>; after: Record<StockType, number>; frozen?: boolean }[]; serials: { added: number; removed: number } } }>
    refetchApply(request: { id: string; token: string }): Promise<CountMeta>
    approval(request: { id: string; material: string; status: 'approved' | 'returned' | 'posted' | 'reset'; comment?: string }): Promise<Approval>
    /** Managers only: undoes a wrong manual "Bogført i SAP" mark (back to approved). Refused while an SAP document holds the material. */
    unpost(request: { id: string; material: string; reason: string }): Promise<Approval>
    lockMaterial(request: { id: string; material: string }): Promise<MaterialLock>
    requestMaterial(request: { id: string; material: string }): Promise<MaterialLock>
    answerMaterialRequest(request: { id: string; material: string; email: string; allow: boolean }): Promise<MaterialLock>
    releaseMaterial(request: { id: string; material: string }): Promise<{ ok: true }>
    submitMaterial(request: { id: string; material: string; comment?: string; acceptDiff?: boolean }): Promise<Approval>
    approveClean(id: string): Promise<{ approved: number }>
    copySerials(request: { id: string; material: string; sloc: string; stockType: StockType; forDoc?: boolean }): Promise<CopySerialsResult>
    doc(id: string): Promise<CountDoc>
    /** Refused with DOC_STOCK_MISSING when an approved material with SAP stock at approval has no line today; saved only when every missing line is on `confirmMissing` (the list shown). */
    fetchDoc(id: string, options?: { confirmMissing?: string[] }): Promise<CountDoc>
    flush(id: string): Promise<{ ok: boolean; pending: number }>
    report(id: string, language?: 'da' | 'en'): Promise<{ file: string; name: string }>
    openReport(file: string): Promise<{ ok: true }>
    showReport(file: string): Promise<{ ok: true }>
  }
  rules: {
    get(): Promise<RulesView>
    set(request: { sloc: string; kinds: Kind[] }): Promise<unknown>
  }
  serialRules: {
    get(): Promise<SerialRulesView>
    set(request: { material: string; unrestricted: boolean }): Promise<SerialRule | null>
  }
  placements: {
    save(request: { name: string; area?: string; type?: string }): Promise<{ name: string; area: string }>
  }
  roles: {
    /** `locationAdmin`: may maintain Placeringer and undo (a Hub manager or Placerings admin). */
    me(): Promise<{ role: AppRole; locationAdmin: boolean }>
    list(): Promise<RolesView>
    setAdmin(request: { email: string; admin: boolean }): Promise<{ email: string; role: AppRole }>
    setRole(request: { email: string; role: Exclude<AppRole, 'manager'> }): Promise<{ email: string; role: AppRole }>
    setLocationAdmin(request: { email: string; admin: boolean }): Promise<{ email: string; locationAdmin: boolean }>
  }
  piDocs: {
    list(id: string): Promise<PiDocList>
    create(request: { id: string; materials: string[]; sloc: string; stockType: StockType }): Promise<PiDocList & { created: string[]; missing: string[] }>
    print(request: { id: string; docId: string }): Promise<PiDocList>
    /** Refused with PIDOC_ZERO_CONFIRM when an empty serial list would be a Zero Count while SAP has stock today; entered only when every such material is on `confirmZero` (the list shown). */
    count(request: { id: string; docId: string; confirmZero?: string[] }): Promise<PiDocList>
    post(request: { id: string; docIds: string[] }): Promise<PiDocList & { posted: string[]; open: string[] }>
    remove(request: { id: string; docId: string }): Promise<PiDocList>
  }
  sapCheck: {
    overview(): Promise<SapCheckOverview>
    latest(): Promise<SapCheckEntry | null>
    run(request: { scope: SapCheckScope }): Promise<SapCheck>
    setSettings(request: { to: string; cc: string; language: MailLanguage }): Promise<SapCheckSettings>
    /** `to`/`cc`: addresses typed but not saved yet (saved alongside), used instead of the saved ones. */
    mail(request: { id: string; mode: 'new' | 'all'; language: MailLanguage; scope: SapCheckScope; to?: string; cc?: string }): Promise<{ file: string; count: number; to: string }>
  }
  locations: LocationsBridge
  timeclock: TimeclockBridge
  softwareload: SoftwareloadBridge
}

/** A task as the clock knows it (from the shift schedule's tasks). */
export interface TimeclockTask { taskId: string; taskName: string; taskColor: string }

/** The user's own running clock. `now` is the main process's clock when it answered. */
export interface TimeclockRunning extends TimeclockTask {
  startedAt: number
  paused: boolean
  pausedMs: number
  workedMs: number
  now: number
}

/** A saved registration (managers only). Filed under the day it started. */
export interface TimeclockEntry extends TimeclockTask {
  id: string
  email: string
  name: string
  date: string
  startedAt: number
  endedAt: number
  pauses: { from: number; to: number }[]
  pausedMs: number
  workedMs: number
  savedAt: number
  endCorrected?: boolean
  editedBy?: Person
  editedAt?: number
}

export interface TimeclockBridge {
  status(): Promise<{ running: TimeclockRunning | null; isManager: boolean }>
  /** `switchTask`: saves the running clock and starts this task in one go. */
  start(request: TimeclockTask & { switchTask?: boolean }): Promise<TimeclockRunning & { saved?: { taskName: string; workedMs: number } }>
  pause(): Promise<TimeclockRunning>
  resume(): Promise<TimeclockRunning>
  /** Fails with TIMECLOCK_LONG_RUN after 10 hours without `endAt` (when the work really stopped). */
  stop(request?: { endAt?: number }): Promise<{ taskName: string; workedMs: number; pausedMs: number }>
  cancel(): Promise<{ ok: true }>
  entries(request: { from: string; to: string }): Promise<{ entries: TimeclockEntry[]; running: (TimeclockRunning & { email: string; name: string })[] }>
  updateEntry(request: { email: string; id: string; startedAt?: number; endedAt?: number } & Partial<TimeclockTask>): Promise<TimeclockEntry>
  deleteEntry(request: { email: string; id: string }): Promise<{ ok: true }>
}

/** What is loaded on the terminals: software and key, software only, or key only. */
export type SoftwareloadType = 'sw+key' | 'sw' | 'key'

/**
 * Where a terminal ends up. `to-target`/`to-blocked`/`to-d002` are moves; `not-found` (not in SAP), `blocked-stock`,
 * `already-blocked`, `skipped` (already on the target) and `manual` (a failed terminal of another kind) need no move.
 * `failed-sap`: SAP refused it; `abandoned`: a manager gave up its move; `interrupted`: a KIF move stopped before it.
 */
export type SoftwareloadOutcome = 'to-target' | 'to-blocked' | 'to-d002' | 'not-found' | 'blocked-stock' | 'already-blocked' | 'skipped' | 'manual' | 'failed-sap' | 'abandoned' | 'interrupted'

/** The user's own running task. `now` is the main process's clock when it answered; terminals newest first. */
export interface SoftwareloadTaskView {
  id: string
  type: SoftwareloadType
  kif: boolean
  target: string
  version: string
  startedAt: number
  paused: boolean
  pausedMs: number
  workedMs: number
  now: number
  terminals: { serial: string; at: number; failed?: { note: string } }[]
}

/** A finished task waiting for its moves in SAP; the owner sees their own, a manager the whole hub's. */
export interface SoftwareloadPending {
  id: string
  name: string
  email: string
  endedAt: number
  count: number
  /** Someone is moving the task in SAP right now (a fresh claim, on this or another PC). */
  movingBy?: { name: string }
}

/** Where SAP says a serial stands now. */
export interface SoftwareloadSapRow {
  serial: string
  material: string
  plant: string
  sloc: string
  blocked: boolean
  userStatus: string
}

/** One Transfer group: wave 1 runs before wave 2 (in KIF, into D005 and then out of it). */
export interface SoftwareloadTransfer { wave: 1 | 2; from: string; to: string; serials: string[] }
/** Serials of one material for MIGO 344 (blocked stock). */
export interface SoftwareloadBlock { material: string; serials: string[] }

/**
 * A saved SAP document on a serial: a Transfer (`from`/`to`) or MIGO 344 (`bwart`). `by` is an email. `unverified`: SAP
 * posted it, but the app lost the answer; the next run found the terminal where the step put it, so `doc` is unknown.
 */
export type SoftwareloadStep = ({ from: string; to: string } | { bwart: '344' }) & { doc: string | null; by: string; at: number; unverified?: true }

/** A step a run was about to ask SAP for, saved before SAP answered; it goes when the answer is saved. */
export type SoftwareloadMark = ({ from: string; to: string } | { bwart: '344' }) & { by: string; at: number }

export interface SoftwareloadResult {
  material: string | null
  from: string | null
  outcome: SoftwareloadOutcome
  steps: SoftwareloadStep[]
  /** SAP's message when it refused the serial. */
  message?: string
  /** SAP was asked for this step but never answered (kept in the history of an interrupted move). */
  uncertain?: SoftwareloadMark
}

export type SoftwareloadCounts = Partial<Record<SoftwareloadOutcome, number>>

export interface SoftwareloadPreview {
  /** The task and the choices the plan was made with; finishing must be confirmed with exactly these. */
  taskId: string
  choice: SoftwareloadChoice
  outcomes: Record<string, SoftwareloadOutcome>
  transfers: SoftwareloadTransfer[]
  blocks: SoftwareloadBlock[]
  rows: SoftwareloadSapRow[]
}

/** A task whose moves are all done or given up. */
export interface SoftwareloadFinishResult {
  taskId: string
  results: Record<string, SoftwareloadResult>
  counts: SoftwareloadCounts
  state: 'faerdig'
}

export interface SoftwareloadKifPreview {
  serials: string[]
  /** The material document whose serials these are, with its year; only when one was given. */
  document?: string
  outcomes: Record<string, SoftwareloadOutcome>
  transfers: SoftwareloadTransfer[]
}

export interface SoftwareloadKifMoveResult {
  id: string
  results: Record<string, SoftwareloadResult>
  counts: SoftwareloadCounts
}

/** One search line per serial and event: a finished task (`load`) or a move into KIF (`kif`). `to` is where it ended. */
export type SoftwareloadIndexLine = {
  serial: string
  team: TeamId
  email: string
  name: string
  at: number
  from: string | null
  to: string | null
  docs: string[]
  outcome: SoftwareloadOutcome
  /** A step was made without the app reading SAP's document number. */
  unverified?: true
} & (
  | { kind: 'load'; taskId: string; type: SoftwareloadType; version: string; kif: boolean; note?: string }
  /** `moveId` is given to a manager for the own team's moves: the move "Slet" deletes. */
  | { kind: 'kif'; moveId?: string }
)

/** A finished task as saved for its owner's month. */
export interface SoftwareloadTask {
  id: string
  team: TeamId
  email: string
  name: string
  type: SoftwareloadType
  kif: boolean
  target: string
  version: string
  startedAt: number
  endedAt: number
  pauses: { from: number; to: number }[]
  pausedMs: number
  workedMs: number
  terminals: Record<string, { at: number; failed?: { note: string; at: number; by: Person } }>
  results: Record<string, SoftwareloadResult>
  state: 'faerdig'
  /** `by` is the manager's email. */
  abandoned?: { by: string; reason: string; at: number }
  /** Corrections of the choices while the task ran, oldest first; `by` is the owner's email. */
  edits?: SoftwareloadEdit[]
}

export type SoftwareloadChoice = { type: SoftwareloadType; kif: boolean; target: string; version: string }
export interface SoftwareloadEdit { at: number; by: string; from: SoftwareloadChoice; to: SoftwareloadChoice }

/**
 * A manager's comment on a period of the statistics (`YYYY-MM-DD`, both days included), per team. Without `material`
 * or `version` it concerns the whole period. `by` and `at` stay when it is edited.
 */
export interface SoftwareloadComment {
  id: string
  from: string
  to: string
  material?: string
  version?: string
  text: string
  by: Person
  at: number
  editedBy?: Person
  editedAt?: number
}

export type SoftwareloadCommentInput = { from: string; to: string; material?: string; version?: string; text: string }

export type SoftwareloadProgressStep = 'lookup' | 'transfer' | 'block'

/** Broadcast to every window; a window shows only its own user's (`email`). */
export interface SoftwareloadProgress { email: string; done: number; total: number; step: SoftwareloadProgressStep }

export interface SoftwareloadBridge {
  status(): Promise<{ running: SoftwareloadTaskView | null; pending: SoftwareloadPending[]; isManager: boolean; writeEnabled: boolean }>
  /** Stops a running Stempelkort first (`stoppedTimeclock`); fails with SOFTWARELOAD_TIMECLOCK_LONG_RUN after 10 hours. */
  start(request: { type: SoftwareloadType; kif?: boolean; target: string; version: string }): Promise<SoftwareloadTaskView & { stoppedTimeclock?: { taskName: string; workedMs: number } }>
  /**
   * Corrects the own running task's choices with the same rules as start; the change is kept in the task's `edits`.
   * `taskId` is the task shown; another (or none) running refuses it with SOFTWARELOAD_NOT_RUNNING.
   */
  edit(request: { type: SoftwareloadType; kif?: boolean; target: string; version: string; taskId: string }): Promise<SoftwareloadTaskView>
  /** `taskId` is the task the scan belongs to; another running task refuses it with SOFTWARELOAD_NOT_RUNNING. */
  scan(request: { serial: string; taskId: string }): Promise<{ serial: string; count: number }>
  unscan(request: { serial: string; taskId: string }): Promise<{ serial: string; count: number }>
  markFailed(request: { serial: string; note: string }): Promise<SoftwareloadTaskView>
  unmarkFailed(request: { serial: string }): Promise<SoftwareloadTaskView>
  pause(): Promise<SoftwareloadTaskView>
  /** Stops a running Stempelkort first (`stoppedTimeclock`), like start; fails with SOFTWARELOAD_TIMECLOCK_LONG_RUN after 10 hours. */
  resume(): Promise<SoftwareloadTaskView & { stoppedTimeclock?: { taskName: string; workedMs: number } }>
  cancel(): Promise<{ ok: true }>
  /** The hub's latest versions, newest first. */
  versions(): Promise<string[]>
  /** The plan for the running task, without moving anything. */
  preview(): Promise<SoftwareloadPreview>
  /**
   * Stops the time and moves the terminals in SAP; on an error the task waits in `pending` to be continued. `taskId` and
   * `choice` come from the preview the user confirmed: a task edited since is refused with SOFTWARELOAD_CHANGED.
   */
  finish(request: { taskId: string; choice: SoftwareloadChoice }): Promise<SoftwareloadFinishResult>
  /** The owner or a manager. */
  continueFinish(request: { taskId: string }): Promise<SoftwareloadFinishResult>
  /** Managers only. */
  abandon(request: { taskId: string; reason: string }): Promise<SoftwareloadFinishResult>
  /** The serials of `document` (a material document) when given, else `serials`. */
  kifPreview(request: { serials?: string[]; document?: string }): Promise<SoftwareloadKifPreview>
  /**
   * `planned` is the from-location of every serial the confirmed preview moves to D005. When SAP now has a different
   * plan, nothing moves and SOFTWARELOAD_KIF_CHANGED is thrown, so the preview must be shown again.
   */
  kifMove(request: { serials: string[]; document?: string; planned: Record<string, string> }): Promise<SoftwareloadKifMoveResult>
  /** Every event for the serial in TCD and TRR, newest first; `unreadable` counts index files that could not be read. */
  search(request: { serial: string }): Promise<{ lines: SoftwareloadIndexLine[]; unreadable: number }>
  /** Managers only (MANAGER_ONLY otherwise): the team's finished tasks started in the period (`YYYY-MM-DD`). */
  tasks(request: { from: string; to: string }): Promise<SoftwareloadTask[]>
  /** Managers only: the team's comments whose period overlaps the given one, by start date. */
  comments(request: { from: string; to: string }): Promise<SoftwareloadComment[]>
  /** Managers only; an empty text, a bad period or an invalid material is refused with SOFTWARELOAD_INVALID. */
  addComment(request: SoftwareloadCommentInput): Promise<SoftwareloadComment>
  /** Managers only; an unknown or deleted comment is refused with SOFTWARELOAD_NOT_FOUND. */
  updateComment(request: SoftwareloadCommentInput & { id: string }): Promise<SoftwareloadComment>
  /** Managers only; who deleted it and when is kept. */
  deleteComment(request: { id: string }): Promise<{ ok: true }>
  /**
   * Managers only: deletes a finished task of the own team from the statistics and the search (SAP is not changed).
   * A running or pending task is refused with SOFTWARELOAD_NOT_FINISHED, an unknown one with SOFTWARELOAD_NOT_FOUND.
   */
  deleteTask(request: { taskId: string }): Promise<{ ok: true }>
  /** Managers only: deletes a move into KIF (`moveId` of a search line) and its search lines (SAP is not changed). */
  deleteKifMove(request: { id: string }): Promise<{ ok: true }>
  onProgress(listener: (progress: SoftwareloadProgress) => void): () => void
}

declare global {
  interface Window {
    electronWarehouse?: WarehouseBridge
  }
}
