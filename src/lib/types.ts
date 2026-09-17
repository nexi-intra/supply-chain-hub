import type { UserRole } from './userRoles'

export type GuideCategory = 'Procedures' | 'Technical' | 'HR' | 'Safety' | 'General'

// Guide-domænet (v2 m. sektioner/trin, versionering og opdaterings-interval) bor i guideTypes.ts.
export type { Guide, GuideSection, GuideStep, GuideVersionEntry } from './guideTypes'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  relatedGuides?: string[]
}

// ---- Fælles domænetyper (KV-storens datamodel) ----

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type VacationStatus = ApprovalStatus

/**
 * KV: 'guide-access-requests' — gemt i den EJENDE teams egen store (så deres manager ser
 * anmodningen som en helt normal del af deres eget team, uden ekstra tværgående mekanik).
 * Skrevet af den ANMODENDE bruger via den ephemere registry:submit-guide-access-request-IPC
 * (samme mønster som registry:read-team-key, se plans/supply-chain-hub-multitenancy.md Fase 8).
 * Godkendelse giver 2 dages adgang (`expiresAt`).
 */
export interface GuideAccessRequest {
  id: string
  guideId: string
  guideTitle: string
  requestingTeamCode: string
  requestingUserEmail: string
  requestingUserName: string
  status: ApprovalStatus
  requestedAt: string
  reviewedBy?: string
  reviewedAt?: string
  expiresAt?: string
}

/** Bruger som gemt i KV-nøglen 'users' (Record<email, StoredUser>). */
export interface StoredUser {
  email: string
  password: string
  fullName: string
  phone?: string
  isManager?: boolean
  role?: UserRole
  status?: ApprovalStatus
  /** Valgfrit brugernavn - kan bruges til login i stedet for email. Skal være unikt. */
  username?: string
}

/** KV: 'sick-leave-entries'. endDate sættes ikke af indmeldingsdialogen og kan mangle. */
export interface SickLeaveEntry {
  id: string
  userEmail: string
  userName: string
  startDate: string
  endDate?: string
  reason?: string
  status: ApprovalStatus
  submittedAt: string
  reportedBy?: string
  type?: 'self' | 'child'
}

/** KV: 'vacation-entries'. */
export interface VacationEntry {
  id: string
  userId: string
  userEmail: string
  startDate: string
  endDate: string
  notes?: string
  status: ApprovalStatus
  reviewedBy?: string
  reviewedAt?: string
  isSingleDay?: boolean
  manuallyGranted?: boolean
}

/**
 * KV: 'home-office-patterns' (Record<email, HomeOfficePattern>). Rent selv-rapporteret, INGEN
 * godkendelse (i modsætning til ferie) — se plans/supply-chain-hub-multitenancy.md Fase 9.4.
 * `weekdays` bruger JS' `Date.getDay()`-konvention (0=søndag..6=lørdag).
 */
export interface HomeOfficePattern {
  weekdays: number[]
}

/** KV: 'home-office-exceptions' — enkelt-dags-undtagelse fra brugerens faste mønster. */
export interface HomeOfficeException {
  id: string
  userEmail: string
  date: string
  isHomeOffice: boolean
}

/** KV: 'shift-roles'. */
export interface ShiftRole {
  id: string
  name: string
  color: string
}

/** KV: 'shift-assignments'. */
export interface ShiftAssignment {
  id: string
  employeeId: string
  employeeName: string
  roleId: string
  date: string
  comment?: string
}

/**
 * KV: 'shift-patterns'. Gentaget vagt-tildeling ("hver anden/tredje/fjerde
 * uge"), i modsætning til `ShiftAssignment` som er en konkret vagt på én dato.
 * Udfoldes til synlige celler ved rendering (se ShiftSchedule.tsx) i stedet
 * for at blive skrevet som tusindvis af enkelt-datoer.
 */
export interface ShiftPatternRule {
  id: string
  employeeId: string
  employeeName: string
  roleId: string
  /** 1=mandag..5=fredag (samme konvention som Date.getDay(), weekender giver ingen mening her). */
  weekdays: number[]
  /** Hver uge (1), hver anden (2), hver tredje (3) eller hver fjerde (4). */
  intervalWeeks: 1 | 2 | 3 | 4
  /** Ankerdato ('yyyy-MM-dd') — ugen den ligger i tæller som uge 0 i intervallet. */
  anchorDate: string
  /** Valgfri slutdato ('yyyy-MM-dd'), inklusiv. Ingen = løber for evigt. */
  endDate?: string
  comment?: string
}

/** KV: 'employee-birthdays'. */
export interface BirthdayEntry {
  email: string
  fullName: string
  birthday: string
  birthYear?: number
}

/** KV: 'emails' (internt beskedsystem). */
export interface Email {
  id: string
  from: string
  to: string
  subject: string
  message: string
  timestamp: number
  read: boolean
  starred?: boolean
  folderId?: string
  /** Samtale-id: svar peger på original-mailens id, så tråden kan samles. */
  threadId?: string
  /** Historisk markør sat af enkelte afsendere (fx 'vacation-request'). */
  type?: string
  /** Handlings-knap i bunden af mailen — deep-link til et view/fane. */
  actionLink?: { view: string; tab?: string; label: string }
}

/** KV: 'email-folders'. */
export interface EmailFolder {
  id: string
  name: string
  userId: string
  createdAt: number
  color?: string
}

/** KV: 'meal-plan-weeks'. */
export interface WeekMenu {
  weekNumber: number
  year: number
  weekStart: string
  meals: {
    monday: string
    tuesday: string
    wednesday: string
    thursday: string
    friday: string
  }
}
