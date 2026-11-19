// Raw API exposed by electron/preload.cjs for the central Supply Chain Hub
// team-/user-registry (see electron/registry.cjs). Electron-only — undefined
// when running in the browser (npm run dev), where multi-tenancy doesn't apply.
export interface RegisteredTeam {
  teamId: string
  name: string
  abbreviation: string
  folderName: string
  createdAt: string
}

export interface TeamManagerSummary {
  email: string
  fullName: string
}

export interface TeamAdministration extends RegisteredTeam {
  managers: TeamManagerSummary[]
}

export interface RegistryUserOption {
  email: string
  fullName: string
  primaryTeamId: string
}

export interface ManagerAccessEntry {
  email: string
  fullName: string
  homeTeamId: string | null
  teamIds: string[]
  updatedAt: string | null
}

/** A hub the signed-in person may open: the home team or a team where the creator made them manager. */
export interface MyHub extends RegisteredTeam {
  home: boolean
  manager: boolean
  /** Pending user and vacation approvals waiting for this person as manager. */
  pending: number
  active: boolean
}

export interface ExtraManager {
  email: string
  fullName: string
  homeTeam: { teamId: string; name: string; abbreviation: string } | null
}

export interface ElectronRegistryApi {
  lookupTeam(email: string): Promise<RegisteredTeam | null>
  listTeams(): Promise<RegisteredTeam[]>
  assignUser(email: string, teamId: string): Promise<void>
  switchToTeam(folderName: string): Promise<{ dataDir: string }>
  getCreatorEmail(): Promise<string | null>
  setCreatorEmail(email: string): Promise<void>
  createTeam(team: { teamId: string; name: string; folderName: string }): Promise<string>
  listTeamAdministration(requesterEmail: string): Promise<TeamAdministration[]>
  updateTeam(requesterEmail: string, teamId: string, input: { name: string; abbreviation: string }): Promise<RegisteredTeam>
  listUserOptions(requesterEmail: string): Promise<RegistryUserOption[]>
  listManagerAccess(): Promise<ManagerAccessEntry[]>
  setManagerAccess(email: string, teamIds: string[]): Promise<{ email: string; teamIds: string[] }>
  listMyHubs(): Promise<MyHub[]>
  listExtraManagers(): Promise<ExtraManager[]>
  onHubsChanged(callback: () => void): () => void
  getCurrentTeam(): Promise<RegisteredTeam | null>
  readTeamKey<T = unknown>(folderName: string, key: string): Promise<T>
  readTeamKeys(folderName: string, keys: string[]): Promise<unknown[]>
  readTeamsKeys(requests: Array<{ folderName: string; keys: string[] }>): Promise<unknown[][]>
  readSharedGuideFile<T = unknown>(kind: 'guides' | 'knowledge', guideId: string, key: string): Promise<T>
  submitGuideAccessRequest<T = unknown>(folderName: string, request: T): Promise<T[]>
  submitKnowledgeAccessRequest<T = unknown>(folderName: string, request: T): Promise<T[]>
}
