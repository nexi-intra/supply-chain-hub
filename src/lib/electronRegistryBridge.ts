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

export interface AccessView {
  viewId: string
  name: string
  teamIds: string[]
  userEmails: string[]
  createdAt: string
  updatedAt: string
}

export interface RegistryUserOption {
  email: string
  fullName: string
  primaryTeamId: string
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
  listAccessViews(requesterEmail: string): Promise<AccessView[]>
  listMyAccessViews(email: string): Promise<AccessView[]>
  createAccessView(requesterEmail: string, input: { name: string; teamIds: string[]; userEmails: string[] }): Promise<AccessView>
  updateAccessView(requesterEmail: string, viewId: string, input: { name: string; teamIds: string[]; userEmails: string[] }): Promise<AccessView>
  deleteAccessView(requesterEmail: string, viewId: string): Promise<boolean>
  listUserOptions(requesterEmail: string): Promise<RegistryUserOption[]>
  readAccessViewKey<T = unknown>(email: string, viewId: string, teamId: string, key: string): Promise<T>
  getCurrentTeam(): Promise<RegisteredTeam | null>
  readTeamKey<T = unknown>(folderName: string, key: string): Promise<T>
  readTeamKeys(folderName: string, keys: string[]): Promise<unknown[]>
  readTeamsKeys(requests: Array<{ folderName: string; keys: string[] }>): Promise<unknown[][]>
  submitGuideAccessRequest<T = unknown>(folderName: string, request: T): Promise<T[]>
}
