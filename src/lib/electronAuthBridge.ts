import type { RegisteredTeam } from './electronRegistryBridge'
export interface NativeSession {
  token: string
  email: string
  userId: string
  teamId: string
  expiresAt: number
  createdAt: number
  role: 'creator' | 'manager' | 'user'
  home: RegisteredTeam
  /** The open hub; null when access to it was just removed. */
  activeTeam: RegisteredTeam | null
  /** Home team plus the teams where the creator made this person manager. */
  teams: RegisteredTeam[]
}
export interface ElectronAuthApi {
  login(request: { email: string; password: string; rememberMe: boolean }): Promise<NativeSession>
  signup(request: { email: string; password: string; fullName: string; phone: string; language: string }): Promise<{ email: string; status: 'pending' }>
  resume(token: string): Promise<NativeSession>
  current(): Promise<NativeSession>
  renew(): Promise<NativeSession>
  logout(): Promise<void>
  profile(request: { phone: string; currentPassword?: string; newPassword?: string }): Promise<{ passwordChanged: boolean }>
}
