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
  viewId: string | null
}
export interface ElectronAuthApi {
  login(request: { email: string; password: string; rememberMe: boolean }): Promise<NativeSession>
  signup(request: { email: string; password: string; fullName: string; phone: string; language: string }): Promise<{ email: string; status: 'pending' }>
  resume(token: string): Promise<NativeSession>
  current(): Promise<NativeSession>
  renew(): Promise<NativeSession>
  logout(): Promise<void>
  selectView(viewId: string | null): Promise<NativeSession>
  profile(request: { phone: string; currentPassword?: string; newPassword?: string }): Promise<{ passwordChanged: boolean }>
}
