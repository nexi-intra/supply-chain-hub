export type UserRole = 'creator' | 'manager' | 'user'

// Fallback der virker selv hvis registret/KV er utilgængeligt (fx netværksdrev nede).
export const MANAGER_EMAILS = ['jacob.remmer@nexigroup.com']

// Garanteret adgang for Creator-kontoen, uanset tilstanden af den delte KV-store
// (fx hvis brugerens konto ved et uheld bliver slettet/ændret). Kun en PBKDF2-hash
// er bagt ind i koden — IKKE selve adgangskoden. Creatorens EMAIL er IKKE hardcodet
// her — den hentes fra det centrale register (se getCreatorEmail nedenfor), så rollen
// kan overdrages til en anden konto uden ny build af appen.
export const MASTER_CREATOR_PASSWORD_HASH = 'pbkdf2$150000$yDMn6LPFNdPCNXoGCeHVWg==$7gOEKz3Ovs7I8o2MfwMqJXzSC+uc91L+/BDC/+dPhUY='

interface UserData {
  email: string
  password: string
  fullName: string
  role?: string
  isManager?: boolean
}

let cachedCreatorEmail: string | null | undefined = undefined

/**
 * Creatorens email fra det centrale register, cachet for resten af sessionen (registret
 * ændrer sig stort set aldrig efter opstart). Null i browser-dev-mode (electronRegistry
 * findes kun i den pakkede Electron-app) eller hvis ingen Creator er registreret endnu.
 */
export async function getCreatorEmail(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedCreatorEmail !== undefined) return cachedCreatorEmail
  if (!window.electronRegistry) {
    cachedCreatorEmail = null
    return null
  }
  try {
    cachedCreatorEmail = await window.electronRegistry.getCreatorEmail()
  } catch (error) {
    console.error('Kunne ikke hente Creator-email fra registret:', error)
    cachedCreatorEmail = null
  }
  return cachedCreatorEmail
}

/** Ældre lagrede 'admin'-roller (fra før Supply Chain Hub) svarer i dag til 'manager'. */
function normalizeStoredRole(role: string | undefined): UserRole | undefined {
  if (role === 'admin') return 'manager'
  if (role === 'creator' || role === 'manager' || role === 'user') return role
  return undefined
}

export async function getUserRole(email: string): Promise<UserRole> {
  const normalizedEmail = email.trim().toLowerCase()

  const creatorEmail = await getCreatorEmail()
  if (creatorEmail && normalizedEmail === creatorEmail) {
    return 'creator'
  }
  // Hardcoded roles take precedence and work even if the KV store is unavailable.
  if (MANAGER_EMAILS.some(m => m.toLowerCase() === normalizedEmail)) {
    return 'manager'
  }

  let usersData: Record<string, UserData> | undefined
  try {
    usersData = await window.kv.get<Record<string, UserData>>('users')
  } catch (error) {
    console.error('Kunne ikke hente brugerroller fra KV:', error)
    return 'user'
  }

  const user = usersData?.[email] || usersData?.[normalizedEmail]
  if (!user) {
    return 'user'
  }

  const normalizedRole = normalizeStoredRole(user.role)
  if (normalizedRole) {
    return normalizedRole
  }

  if (user.isManager) {
    return 'manager'
  }

  return 'user'
}

export async function hasCreatorAccess(email: string): Promise<boolean> {
  const role = await getUserRole(email)
  return role === 'creator'
}

/**
 * Fjerner Creator-kontoen fra en liste af brugere til visning — Creator er en
 * platform-konto (ikke et teammedlem) og skal ikke optræde i almindelige
 * bruger-oversigter/dropdowns (Manager Panel, Admin Panel, Team Oversigt osv.).
 */
export async function excludeCreator<T extends { email: string }>(users: T[]): Promise<T[]> {
  const creatorEmail = await getCreatorEmail()
  if (!creatorEmail) return users
  return users.filter((u) => u.email.toLowerCase() !== creatorEmail)
}

export async function hasManagerAccess(email: string): Promise<boolean> {
  const role = await getUserRole(email)
  return role === 'creator' || role === 'manager'
}

export function getRoleDisplayName(role: UserRole, language: 'da' | 'en' = 'da'): string {
  const roleNames = {
    da: {
      creator: 'Creator',
      manager: 'Manager',
      user: 'Bruger'
    },
    en: {
      creator: 'Creator',
      manager: 'Manager',
      user: 'User'
    }
  }
  return roleNames[language][role]
}

export function getRoleDescription(role: UserRole, language: 'da' | 'en' = 'da'): string {
  if (language === 'en') {
    switch (role) {
      case 'creator':
        return 'Full access everywhere, in every team — the only role with access to Arcade highscores and Data Storage'
      case 'manager':
        return 'Can assign permissions, handle sick leave, approve/reject vacation requests and edit guides'
      case 'user':
        return 'Standard user access, can view guides and request vacation'
    }
  }
  switch (role) {
    case 'creator':
      return 'Fuld adgang overalt, i alle teams — eneste rolle med adgang til Arcade-highscores og Datalagring'
    case 'manager':
      return 'Kan tildele rettigheder, håndtere sygemeldinger, godkende/afvise ferieansøgninger og redigere guides'
    case 'user':
      return 'Standard brugeradgang, kan se guides og anmode om ferie'
  }
}
