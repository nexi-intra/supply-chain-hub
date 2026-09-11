// Raw API exposed by electron/preload.cjs for the central Supply Chain Hub
// team-/user-registry (see electron/registry.cjs). Electron-only — undefined
// when running in the browser (npm run dev), where multi-tenancy doesn't apply.
export interface RegisteredTeam {
  teamId: string
  name: string
  folderName: string
  createdAt: string
}

export interface ElectronRegistryApi {
  lookupTeam(email: string): Promise<RegisteredTeam | null>
  listTeams(): Promise<RegisteredTeam[]>
  assignUser(email: string, teamId: string): Promise<void>
  switchToTeam(folderName: string): Promise<{ dataDir: string }>
  getCreatorEmail(): Promise<string | null>
  setCreatorEmail(email: string): Promise<void>
  createTeam(team: { teamId: string; name: string; folderName: string }): Promise<string>
  getCurrentTeam(): Promise<RegisteredTeam | null>
  readTeamKey<T = unknown>(folderName: string, key: string): Promise<T>
  submitGuideAccessRequest<T = unknown>(folderName: string, request: T): Promise<T[]>
}
