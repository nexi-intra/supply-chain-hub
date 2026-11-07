import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { Hub } from '@/views/Hub'
import { Auth } from '@/views/Auth'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AnimatedBackground } from '@/components/AnimatedBackground'
import { BirthdayCelebration } from '@/components/BirthdayCelebration'
import { UpdateNotification } from '@/components/UpdateNotification'
import { GuideImportStatus } from '@/components/GuideImportStatus'
import { LoginDigest } from '@/components/LoginDigest'
import { WhatsNewDialog } from '@/components/WhatsNewDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { StorageConnectionBanner } from '@/components/StorageConnectionBanner'
import { HubAssistant } from '@/components/HubAssistant'
import { AccountMigrationRecovery } from '@/components/AccountMigrationRecovery'
import { DesktopNotificationBridge } from '@/components/DesktopNotificationBridge'
import { HubNotificationsProvider } from '@/contexts/HubNotificationsContext'
import { toast, Toaster } from 'sonner'
import { setKvObjectField, deleteKvObjectField } from '@/lib/kvArrays'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { NAVIGATE_EVENT, peekNavigationParams, type AppViewId } from '@/lib/appNavigation'
import { watchInactivity } from '@/lib/inactivityWatcher'
import { HubPicker } from '@/components/HubPicker'
import { HubSwitchController } from '@/components/HubSwitchController'
import { HUB_SWITCHED_EVENT, rememberHub, rememberedHub } from '@/lib/hubSwitch'
import type { MyHub } from '@/lib/electronRegistryBridge'
import { clearKvSnapshotCache } from '@/hooks/useKV'
import { clearCachedState } from '@/hooks/useCachedState'

// Lazy-loadet: Hub og Auth vises altid lige efter opstart/login, så de
// forbliver i hoved-bundlen. Alle andre views hentes først når brugeren
// rent faktisk navigerer derhen — reducerer opstarts-bundlen markant.
const GuideLibrary = lazy(() => import('@/views/GuideLibrary').then(m => ({ default: m.GuideLibrary })))
const VacationCalendar = lazy(() => import('@/views/VacationCalendar').then(m => ({ default: m.VacationCalendar })))
const ShiftSchedule = lazy(() => import('@/views/ShiftSchedule').then(m => ({ default: m.ShiftSchedule })))
const AdminPanel = lazy(() => import('@/views/AdminPanel').then(m => ({ default: m.AdminPanel })))
const ManagerPanel = lazy(() => import('@/views/ManagerPanel').then(m => ({ default: m.ManagerPanel })))
const CreatorPanel = lazy(() => import('@/views/CreatorPanel').then(m => ({ default: m.CreatorPanel })))
const TeamOverview = lazy(() => import('@/views/TeamOverview').then(m => ({ default: m.TeamOverview })))
const EmailSystem = lazy(() => import('@/views/EmailSystem').then(m => ({ default: m.EmailSystem })))
const MealPlan = lazy(() => import('@/views/MealPlan').then(m => ({ default: m.MealPlan })))
const GameCorner = lazy(() => import('@/views/GameCorner').then(m => ({ default: m.GameCorner })))
const ProjectBoard = lazy(() => import('@/views/ProjectBoard').then(m => ({ default: m.ProjectBoard })))
const Improvements = lazy(() => import('@/views/Improvements').then(m => ({ default: m.Improvements })))
const VirtualNotebook = lazy(() => import('@/views/VirtualNotebook').then(m => ({ default: m.VirtualNotebook })))
const LinkLibrary = lazy(() => import('@/views/LinkLibrary').then(m => ({ default: m.LinkLibrary })))
const Warehouse = lazy(() => import('@/views/warehouse/Warehouse').then(m => ({ default: m.Warehouse })))

/** Vises kortvarigt mens et views kode hentes ved første besøg. */
function ViewLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
    </div>
  )
}

type View = 'hub' | 'guides' | 'knowledge' | 'calendar' | 'shifts' | 'admin' | 'manager' | 'creator' | 'team' | 'email' | 'meals' | 'games' | 'projects' | 'improvements' | 'notebook' | 'links' | 'warehouse'

interface UserSession {
  userId: string
  email: string
  token: string
  expiresAt: number
  remembered: boolean
}

interface StoredSession {
  token: string
  email: string
  userId: string
  expiresAt: number
  createdAt: number
}

const SESSION_DURATION = 24 * 60 * 60 * 1000
const REMEMBERED_SESSION_DURATION = 365 * 24 * 60 * 60 * 1000
const SESSION_TIMEOUT = 30 * 60 * 1000

// "Husk mig"-tokenet gemmes LOKALT på maskinen (localStorage) — aldrig i den
// fælles datamappe, hvor det ville gælde på tværs af alle klienter.
const REMEMBER_TOKEN_KEY = 'tcd-hub:remember-token'

function generateSessionToken(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

async function validateSession(token: string): Promise<{ valid: boolean; session?: StoredSession }> {
  if (window.electronAuth) {
    try { return { valid: true, session: await window.electronAuth.resume(token) } } catch (error) {
      if (String(error).includes('AUTH_')) return { valid: false }
      throw error
    }
  }
  const sessions = await window.kv.get<Record<string, StoredSession>>('active-sessions') || {}
  const session = sessions[token]
  
  if (!session) {
    return { valid: false }
  }
  
  if (Date.now() > session.expiresAt) {
    delete sessions[token]
    await window.kv.set('active-sessions', sessions)
    return { valid: false }
  }
  
  return { valid: true, session }
}

async function createSession(userId: string, email: string, duration: number): Promise<string> {
  if (window.electronAuth) {
    const session = await window.electronAuth.current()
    if (session.email !== email || session.userId !== userId) throw new Error('AUTH_FORBIDDEN')
    return session.token
  }
  const token = generateSessionToken()
  const expiresAt = Date.now() + duration
  const createdAt = Date.now()
  
  const sessions = await window.kv.get<Record<string, StoredSession>>('active-sessions') || {}
  // Ryd udløbne sessioner, så den delte fil ikke vokser ubegrænset – samtidig med den nye, ikke én ad gangen.
  const now = Date.now()
  await Promise.all([
    ...Object.keys(sessions).filter(key => sessions[key].expiresAt < now).map(key => deleteKvObjectField('active-sessions', key)),
    setKvObjectField('active-sessions', token, { token, email, userId, expiresAt, createdAt }),
  ])
  
  return token
}

/** Forlænger en husket sessions udløb (glidende vindue ved hver app-start). */
async function renewSession(token: string): Promise<void> {
  if (window.electronAuth) { await window.electronAuth.renew(); return }
  const sessions = await window.kv.get<Record<string, StoredSession>>('active-sessions') || {}
  if (sessions[token]) {
    await setKvObjectField('active-sessions', token, { ...sessions[token], expiresAt: Date.now() + REMEMBERED_SESSION_DURATION })
  }
}

async function deleteSession(token: string): Promise<void> {
  if (window.electronAuth) { await window.electronAuth.logout(); return }
  await deleteKvObjectField('active-sessions', token)
}

function App() {
  const [currentView, setCurrentView] = useState<View>('hub')
  const currentViewRef = useRef<View>(currentView)
  currentViewRef.current = currentView
  const [viewNonce, setViewNonce] = useState(0)
  const [userSession, setUserSession] = useState<UserSession | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  // Ref, not state: input events must not re-render the whole app.
  const lastActivityRef = useRef(Date.now())
  // Se checkForcedUpdate herunder: undertrykker den globale opdaterings-popup
  // mens en manager-paatvunget version installeres i baggrunden.
  const [suppressUpdatePopup, setSuppressUpdatePopup] = useState(false)
  // Hubs this person may open; the picker shows after login when there is more than one.
  const [hubChoice, setHubChoice] = useState<{ token: string; hubs: MyHub[]; choosing: boolean } | null>(null)
  // Bumped on every hub switch so all modules remount on the new team's data.
  const [hubNonce, setHubNonce] = useState(0)

  const loadHubChoice = useCallback(async (token: string, choosing: boolean) => {
    let hubs: MyHub[] = []
    try { hubs = await window.electronRegistry?.listMyHubs() || [] } catch (error) { console.error('Kunne ikke hente hubs:', error) }
    setHubChoice({ token, hubs, choosing: choosing && hubs.length > 1 })
  }, [])

  useEffect(() => {
    if (!userSession) { setHubChoice(null); return }
    void loadHubChoice(userSession.token, true)
  }, [userSession?.token, loadHubChoice]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchHub = useCallback(async (folderName: string) => {
    if (!userSession) return false
    try {
      const current = await window.electronRegistry?.getCurrentTeam()
      if (current?.folderName !== folderName) await window.electronRegistry?.switchToTeam(folderName)
      clearKvSnapshotCache()
      clearCachedState()
      rememberHub(userSession.userId, folderName)
      setHubChoice(choice => choice && { ...choice, choosing: false })
      setCurrentView('hub')
      setHubNonce(nonce => nonce + 1)
      window.dispatchEvent(new Event(HUB_SWITCHED_EVENT))
      return true
    } catch (error) {
      console.error('Kunne ikke skifte hub:', error)
      return false
    }
  }, [userSession])

  const openHubPicker = useCallback(() => {
    if (userSession) void loadHubChoice(userSession.token, true)
  }, [userSession, loadHubChoice])

  useEffect(() => {
    // Éngangs-migrering: ældre ferie-poster med fulde ISO-datoer ('...T00:00:00.000Z')
    // normaliseres til 'yyyy-MM-dd', så alle views parser dem entydigt (lokal dato).
    if (!userSession) return
    const normalizeVacationDates = async () => {
      try {
        const entries = await window.kv.get<Array<{ id: string; startDate: string; endDate: string }>>('vacation-entries')
        if (!entries || !entries.some((e) => e.startDate?.includes('T') || e.endDate?.includes('T'))) return
        const normalized = entries.map((e) => ({
          ...e,
          startDate: e.startDate?.slice(0, 10) ?? e.startDate,
          endDate: e.endDate?.slice(0, 10) ?? e.endDate,
        }))
        await window.kv.set('vacation-entries', normalized)
      } catch (error) {
        console.error('Kunne ikke normalisere ferie-datoer:', error)
      }
    }
    normalizeVacationDates()
  }, [userSession])

  useEffect(() => {
    // Rapportér denne klients app-version til den fælles KV-nøgle "client-versions",
    // så Manager Panel kan se hvem der kører hvilken version. Kun i desktop-appen.
    if (!userSession || !window.electronUpdates) return

    // Hver skrivning til den delte fil koster en laasefil paa M: (maalt 10-77 s under belastning),
    // og ~40 klienter skrev hvert 5. minut. Manager Panel kalder en klient "offline" efter 24 t,
    // saa vi skriver kun ved ny version/platform eller naar lastSeen er over en time gammel.
    const WRITE_AFTER_MS = 60 * 60 * 1000
    const reportVersion = async () => {
      try {
        if (document.visibilityState === 'hidden') return
        const status = await window.electronUpdates!.getStatus()
        const platform = navigator.platform || 'unknown'
        const stored = (await window.kv.get<Record<string, { version?: string; platform?: string; lastSeen?: number }>>('client-versions'))?.[userSession.email]
        if (stored && stored.version === status.currentVersion && stored.platform === platform && Date.now() - (stored.lastSeen || 0) < WRITE_AFTER_MS) return
        await setKvObjectField('client-versions', userSession.email, {
          version: status.currentVersion,
          platform,
          lastSeen: Date.now(),
        })
      } catch (error) {
        console.error('Kunne ikke rapportere app-version:', error)
      }
    }

    reportVersion()
    const interval = setInterval(reportVersion, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [userSession])

  useEffect(() => {
    // Lytter efter en manager-udløst "tving opdatering" (Manager Panel → Datalagring).
    // Nøglen er et opslagsobjekt keyet pr. email; hvis vores email dukker op, trigges
    // en automatisk opdatering uden at brugeren skal klikke noget.
    if (!userSession || !window.electronUpdates) return
    const handledRequests = new Set<number>()

    const checkForcedUpdate = async () => {
      try {
        const requests = await window.kv.get<Record<string, { requestedAt: number; requestedBy: string; version?: string }>>('force-update-requests') || {}
        const request = requests[userSession.email]
        if (!request || handledRequests.has(request.requestedAt)) return
        handledRequests.add(request.requestedAt)
        // Undertryk den globale "ny version tilgaengelig"-popup mens den tvungne
        // installation koerer - ellers kan brugeren naa at trykke "Opdatér nu" paa
        // den ALMINDELIGE seneste version og springe den paatvungne mellemversion
        // over (netop det scenarie tvungen-version-valg findes for at undgaa).
        setSuppressUpdatePopup(true)

        // The request must be gone from the shared drive before the install restarts the app (otherwise it would
        // install again after the restart); the update check runs while it is removed.
        const removal = deleteKvObjectField('force-update-requests', userSession.email)
        toast.info(
          request.version
            ? `En manager har udløst en tvungen opdatering til v${request.version} — appen opdateres automatisk om lidt…`
            : 'En manager har udløst en tvungen opdatering — appen opdateres automatisk om lidt…',
          { duration: 6000 }
        )

        if (request.version) {
          // Manageren har valgt en specifik version — installér den direkte,
          // uanset om den er nyere/ældre end den aktuelt publicerede.
          await removal
          await window.electronUpdates!.install(request.version)
        } else {
          const [manifest] = await Promise.all([window.electronUpdates!.check(), removal])
          if (manifest) {
            await window.electronUpdates!.install()
          }
        }
      } catch (error) {
        console.error('Tvungen opdatering fejlede:', error)
        toast.error('Tvungen opdatering fejlede — prøv igen fra Manager Panel')
        // Fejlede installationen, skal den almindelige opdaterings-popup igen
        // kunne tilbyde brugeren den seneste version som normalt.
        setSuppressUpdatePopup(false)
      }
    }

    checkForcedUpdate()
    const unsubscribe = window.kv.subscribe((changedKeys) => {
      if (changedKeys.includes('force-update-requests')) checkForcedUpdate()
    })
    return () => unsubscribe()
  }, [userSession])

  useEffect(() => {
    // Auto-login: gyldigt lokalt "husk mig"-token logger brugeren direkte ind.
    let cancelled = false
    let unsubscribeReconnect: (() => void) | undefined

    // True kun når det DELTE lager faktisk er tilgængeligt. Et husket login må
    // aldrig glemmes, blot fordi netværksdrevet var nede ved opstart (VPN/Zscaler)
    // — ellers tvinges brugeren til at logge ind igen ved hver ustabil opstart.
    const storageReachable = async (): Promise<boolean> => {
      if (!window.electronKv?.getConnectionStatus) return true
      try {
        const status = await window.electronKv.getConnectionStatus()
        return status.connected && !status.startedDisconnected
      } catch { return false }
    }

    // Returnerer false, hvis det delte lager var utilgængeligt, så kaldet kan
    // prøve igen ved genforbindelse i stedet for at glemme det huskede login.
    const restoreSession = async (): Promise<boolean> => {
      const token = localStorage.getItem(REMEMBER_TOKEN_KEY)
      if (!token) return true
      const { valid, session } = await validateSession(token)
      if (valid && session) {
        // Ved en ny appstart peger den aktive store endnu på platformroden.
        // Slå derfor brugerens primære team op, før kontoen valideres.
        if (window.electronRegistry) {
          const primaryTeam = await window.electronRegistry.lookupTeam(session.email)
          if (primaryTeam) await window.electronRegistry.switchToTeam(primaryTeam.folderName)
        }
        // Brugeren skal stadig findes og være godkendt i den delte brugerliste.
        const users = await window.kv.get<Record<string, { status?: string }>>('users') || {}
        const user = users[session.email] || users[session.email.toLowerCase()]
        if (user && user.status !== 'pending' && user.status !== 'rejected') {
          // The session is valid (resumed above); extending it is a write to the shared drive (up to 90 s), so the
          // hub opens at once and the renewal finishes in the background.
          void trackPendingWrite(renewSession(token)).catch(error => console.error('Kunne ikke forlænge sessionen:', error))
          if (cancelled) return true
          setUserSession({
            userId: session.userId,
            email: session.email,
            token,
            expiresAt: Date.now() + REMEMBERED_SESSION_DURATION,
            remembered: true,
          })
          return true
        }
        // En reelt afventende/afvist konto rydder tokenet — men aldrig når den
        // delte brugerliste blot var utilgængelig (offline-cachen kan være tom).
        if (await storageReachable()) { localStorage.removeItem(REMEMBER_TOKEN_KEY); await deleteSession(token); return true }
        return false
      }
      // Glem aldrig et husket login, fordi drevet var nede ved opstart — kun når
      // lageret er tilgængeligt OG sessionen reelt blev afvist.
      if (await storageReachable()) { localStorage.removeItem(REMEMBER_TOKEN_KEY); return true }
      return false
    }

    const run = async () => {
      let resolved = true
      try { resolved = await restoreSession() } catch (error) {
        console.error('Kunne ikke genskabe session:', error)
        resolved = !localStorage.getItem(REMEMBER_TOKEN_KEY)
      }
      if (!cancelled) setIsCheckingAuth(false)
      if (!resolved && !unsubscribeReconnect && window.electronKv?.onConnectionChanged) {
        // Log automatisk ind igen, når det delte drev kommer tilbage — uden at
        // brugeren skal genstarte appen.
        unsubscribeReconnect = window.electronKv.onConnectionChanged((status) => {
          if (status.connected && !cancelled) { unsubscribeReconnect?.(); unsubscribeReconnect = undefined; void run() }
        })
      }
    }

    run()
    return () => { cancelled = true; unsubscribeReconnect?.() }
  }, [])

  useEffect(() => {
    if (!userSession) return

    return watchInactivity({
      target: document,
      events: ['mousedown', 'keydown', 'scroll', 'touchstart'],
      lastActivity: lastActivityRef,
      // Huskede sessioner logges ikke ud ved inaktivitet — maskinen er personlig.
      enforce: !userSession.remembered,
      timeoutMs: SESSION_TIMEOUT,
      checkEveryMs: 60000,
      onTimeout: () => {
        toast.info('Din session er udløbet på grund af inaktivitet')
        handleLogout()
      },
    })
  }, [userSession])

  const handleAuthenticated = async (userId: string, email: string, rememberMe: boolean) => {
    const duration = rememberMe ? REMEMBERED_SESSION_DURATION : SESSION_DURATION
    const verified = window.electronAuth ? await window.electronAuth.current() : undefined
    if (verified && (verified.email !== email || verified.userId !== userId)) throw new Error('AUTH_FORBIDDEN')
    const expiresAt = verified?.expiresAt || Date.now() + duration
    let token = verified?.token || generateSessionToken()

    try {
      token = await createSession(userId, email, duration)
    } catch (error) {
      console.error('Kunne ikke oprette session i KV:', error)
      if (window.electronAuth) throw error
    }

    if (rememberMe) {
      try {
        localStorage.setItem(REMEMBER_TOKEN_KEY, token)
      } catch (error) {
        console.error('Kunne ikke gemme "husk mig"-token lokalt:', error)
      }
    } else {
      localStorage.removeItem(REMEMBER_TOKEN_KEY)
    }

    lastActivityRef.current = Date.now()
    setUserSession({ userId, email, token, expiresAt, remembered: rememberMe })
  }

  const handleLogout = () => {
    // The desktop app forgets the session at once when logout is called; removing it from the shared drive (up to
    // 90 s) finishes in the background, so the login screen shows straight away.
    if (userSession?.token) void trackPendingWrite(deleteSession(userSession.token)).catch(error => console.error('Session cleanup failed during logout', error))
    localStorage.removeItem(REMEMBER_TOKEN_KEY)
    
    setUserSession(null)
    setCurrentView('hub')
  }

  const handleNavigate = (moduleId: string) => {
    if (moduleId === 'guides') {
      setCurrentView('guides')
    } else if (moduleId === 'knowledge') {
      setCurrentView('knowledge')
    } else if (moduleId === 'calendar') {
      setCurrentView('calendar')
    } else if (moduleId === 'shifts') {
      setCurrentView('shifts')
    } else if (moduleId === 'admin') {
      setCurrentView('admin')
    } else if (moduleId === 'manager') {
      setCurrentView('manager')
    } else if (moduleId === 'creator') {
      setCurrentView('creator')
    } else if (moduleId === 'team') {
      setCurrentView('team')
    } else if (moduleId === 'email') {
      setCurrentView('email')
    } else if (moduleId === 'meals') {
      setCurrentView('meals')
    } else if (moduleId === 'games') {
      setCurrentView('games')
    } else if (moduleId === 'projects') {
      setCurrentView('projects')
    } else if (moduleId === 'improvements') {
      setCurrentView('improvements')
    } else if (moduleId === 'notebook') {
      setCurrentView('notebook')
    } else if (moduleId === 'links') {
      setCurrentView('links')
    } else if (moduleId === 'warehouse') {
      setCurrentView('warehouse')
    }
  }

  const handleNavigateBack = () => {
    setCurrentView('hub')
  }

  useEffect(() => {
    // Deep-links fra fx emails, notifikationscenter og command palette.
    if (!userSession) return
    const handleDeepLink = (e: Event) => {
      const view = (e as CustomEvent).detail?.view as AppViewId | undefined
      if (!view) return
      // Views read their params on mount, so a deep link into the open view (not Game Corner, which listens itself) remounts it.
      if (view === currentViewRef.current && view !== 'games' && peekNavigationParams()) setViewNonce(nonce => nonce + 1)
      setCurrentView(view)
    }
    window.addEventListener(NAVIGATE_EVENT, handleDeepLink)
    return () => window.removeEventListener(NAVIGATE_EVENT, handleDeepLink)
  }, [userSession])

  // Bemærk: der er IKKE en global Escape-lytter her længere. Hver view ejer nu
  // sin egen Escape-håndtering (luk egen dialog → naviger tilbage), så vi
  // undgår kapløb mellem en global fallback og viewets egen lytter, som begge
  // lyttede på 'window' og kunne fyre i uforudsigelig rækkefølge.

  if (isCheckingAuth) {
    return null
  }

  if (!userSession) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <Toaster position="top-center" richColors />
          <AnimatedBackground />
          <UpdateNotification />
          <StorageConnectionBanner />
          <Auth onAuthenticated={handleAuthenticated} />
        </LanguageProvider>
      </ThemeProvider>
    )
  }

  if (!hubChoice || hubChoice.token !== userSession.token) {
    return null
  }

  if (hubChoice.choosing) {
    return (
      <ThemeProvider userId={userSession.userId}>
        <LanguageProvider userId={userSession.userId}>
          <Toaster position="top-center" richColors />
          <AnimatedBackground />
          <StorageConnectionBanner />
          <HubPicker hubs={hubChoice.hubs} preferred={rememberedHub(userSession.userId)} onChoose={hub => switchHub(hub.folderName)} onLogout={handleLogout} />
        </LanguageProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider userId={userSession.userId}>
      <LanguageProvider userId={userSession.userId}>
        {/* Outside the remounted tree, so a message sent during a hub switch is not lost. */}
        <Toaster position="top-center" richColors />
        <HubNotificationsProvider key={hubNonce} userEmail={userSession.email}>
        <HubSwitchController onSwitch={switchHub} onOpenPicker={openHubPicker} />
        <AnimatedBackground />
        <UpdateNotification suppressed={suppressUpdatePopup} />
        <StorageConnectionBanner />
        <GuideImportStatus onOpenGuideLibrary={(kind) => handleNavigate(kind)} />
        <BirthdayCelebration userEmail={userSession.email} />
        <LoginDigest userEmail={userSession.email} />
        <WhatsNewDialog />
        <CommandPalette userEmail={userSession.email} />
        <DesktopNotificationBridge />
        <HubAssistant key={userSession.token} token={userSession.token} />
        <AccountMigrationRecovery userEmail={userSession.email} onLogout={handleLogout} />
        {currentView === 'hub' && <Hub onNavigate={handleNavigate} onLogout={handleLogout} userEmail={userSession.email} />}
        <Suspense key={viewNonce} fallback={<ViewLoadingFallback />}>
          {currentView === 'guides' && <GuideLibrary onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'knowledge' && <GuideLibrary key="knowledge" kind="knowledge" onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'calendar' && <VacationCalendar onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'shifts' && <ShiftSchedule onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'admin' && <AdminPanel onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'manager' && <ManagerPanel onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'creator' && <CreatorPanel onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'team' && <TeamOverview onNavigateBack={handleNavigateBack} onLogout={handleLogout} />}
          {currentView === 'email' && <EmailSystem onNavigateBack={handleNavigateBack} onLogout={handleLogout} userEmail={userSession.email} />}
          {currentView === 'meals' && <MealPlan onNavigateBack={handleNavigateBack} />}
          {currentView === 'games' && <GameCorner onNavigateBack={handleNavigateBack} userEmail={userSession.email} />}
          {currentView === 'projects' && <ProjectBoard onNavigateBack={handleNavigateBack} userEmail={userSession.email} />}
          {currentView === 'improvements' && <Improvements onNavigateBack={handleNavigateBack} userEmail={userSession.email} />}
          {currentView === 'notebook' && <VirtualNotebook onNavigateBack={handleNavigateBack} userEmail={userSession.email} />}
          {currentView === 'links' && <LinkLibrary onNavigateBack={handleNavigateBack} userEmail={userSession.email} />}
          {currentView === 'warehouse' && <Warehouse onNavigateBack={handleNavigateBack} />}
        </Suspense>
        </HubNotificationsProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
