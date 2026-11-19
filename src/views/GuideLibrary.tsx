import { useState, useMemo, useEffect, useRef, useSyncExternalStore, useCallback } from 'react'
import { NisseSpot } from '@/components/christmas/NisseSpot'
import { useKV, beginKvPrediction } from '@/hooks/useKV'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Plus, MagnifyingGlass, Books, Brain, Gear, ArrowLeft, Timer, FolderOpen, FileArrowUp, Buildings, LockKey, Clock, CheckCircle, XCircle, Eye, ClipboardText, FileDashed, Trash } from '@phosphor-icons/react'
import { Guide, GuideAccessRequest } from '@/lib/types'
import { guidePlainText, getReviewStatus, computeNextReviewAt, type ArchivedGuideEntry, type GuideDraft, type GuideReviewRequest } from '@/lib/guideTypes'
import { GuideSearchIndex } from '@/lib/searchIndex'
import { bumpVersion, saveVersionSnapshot, listDrafts, deleteDraft, saveDraft, draftLabel } from '@/lib/guideStore'
import { trackPendingWrite } from '@/lib/pendingWrites'
import { saveInBackground } from '@/lib/saveInBackground'
import { guideToDocModel, resolveAuthorName } from '@/lib/docModel'
import { isExportAvailable, getExportRoot, chooseAndSaveExportRoot, exportGuideToLibrary, exportOriginalGuideToLibrary } from '@/lib/guideExporter'
import { guideImportManager } from '@/lib/guideImportManager'
import type { GuideImportDraft } from '@/lib/docxImporter'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GuideCard } from '@/components/GuideCard'
import { GuideEditor } from '@/components/GuideEditor'
import { hasGuideLinkAccess, type GuideLinkEntry } from '@/lib/guideLinks'
import { GuideViewer } from '@/components/GuideViewer'
import { GuideReviewDashboard } from '@/components/GuideReviewDashboard'
import { CategoryManager } from '@/components/CategoryManager'
import { UserProfile } from '@/components/UserProfile'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, newId } from '@/lib/utils'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams, peekNavigationParams } from '@/lib/appNavigation'
import { toast } from 'sonner'
import { LibraryProvider, useLibraryLanguage } from '@/contexts/LibraryContext'
import type { LibraryKind } from '@/lib/libraryConfig'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'
import { getUserRole, type UserRole } from '@/lib/userRoles'
import { canReviewGuideRequest, hasGuideReviewConflict, isGuideReviewAlreadyApplied, isOpenGuideReview } from '@/lib/guideReview'
import { removeFromKvArray, upsertInKvArray } from '@/lib/kvArrays'
import { fileStorage } from '@/lib/fileStorage'

const defaultCategoriesByKind: Record<LibraryKind, string[]> = {
  guides: ['Procedures', 'Technical', 'HR', 'Safety', 'General'],
  knowledge: ['Payments & Terminals', 'Error Codes', 'Integrations', 'Processes', 'General'],
}

interface GuideLibraryProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
  kind?: LibraryKind
}

export function GuideLibrary({ kind = 'guides', ...props }: GuideLibraryProps) {
  return (
    <LibraryProvider kind={kind}>
      <GuideLibraryContent {...props} />
    </LibraryProvider>
  )
}

function GuideLibraryContent({ onNavigateBack, onLogout, userEmail }: Omit<GuideLibraryProps, 'kind'>) {
  const { t, language, lt, kind, keys } = useLibraryLanguage()
  const defaultCategories = defaultCategoriesByKind[kind]
  const LibraryIcon = kind === 'knowledge' ? Brain : Books
  const [guides, setGuides] = useKV<Guide[]>(keys.items, [])
  // Tvaergaaende delte guides (Fase 3, plans/guide-library-cross-team-links-format.md) — samme
  // platform-delte KV-mekanisme som madplanen (Fase 9.1, se SHARED_KV_KEYS i main.cjs). Alle
  // deltagende teams laeser/skriver samme fil, saa en redigering fra ETHVERT team slaar
  // automatisk igennem for alle andre — ingen saerskilt synk-logik noedvendig.
  const [sharedGuides, setSharedGuides] = useKV<Guide[]>(keys.shared, [])
  const [categories, setCategories] = useKV<string[]>(keys.categories, defaultCategories)
  // Én læsning her (i stedet for at hvert GuideCard slår forfatterens navn op selv via
  // resolveAuthorName, som er async og ville give ét KV-kald pr. kort) — samme genbrugsmønster
  // som andre views bruger til e-mail→navn-overslåg.
  const [usersByEmail] = useKV<Record<string, { fullName?: string }>>('users', {})
  // Til GuideEditors "Ansvarlig for gennemgang"-vælger — samme kilde som usersByEmail,
  // blot som en liste i stedet for et opslagsobjekt.
  const teamUsers = useMemo(
    () => Object.entries(usersByEmail || {}).map(([email, data]) => ({ email, fullName: data?.fullName || email })),
    [usersByEmail]
  )
  const [reviewRequests] = useKV<GuideReviewRequest[]>(keys.reviewRequests, [], { initializeIfMissing: false })
  const [archivedGuides] = useKV<ArchivedGuideEntry[]>(keys.archived, [], { initializeIfMissing: false })
  const [guideAdminEmails] = useKV<string[]>('guide-admin-emails', [], { initializeIfMissing: false })
  const [userRole, setUserRole] = useState<UserRole>('user')
  const [workflowView, setWorkflowView] = useState<'published' | 'workflow'>('published')
  const [editingReviewRequest, setEditingReviewRequest] = useState<GuideReviewRequest | null>(null)
  const [editingAsReviewer, setEditingAsReviewer] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [editGuide, setEditGuide] = useState<Guide | undefined>()
  const [viewGuide, setViewGuide] = useState<Guide | null>(null)
  const [importDraft, setImportDraft] = useState<GuideImportDraft | null>(null)
  const [drafts, setDrafts] = useState<GuideDraft[]>([])
  const [resumeDraft, setResumeDraft] = useState<GuideDraft | null>(null)
  const importJob = useSyncExternalStore(guideImportManager.subscribe, guideImportManager.getJob)
  const isImporting = importJob !== null
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importChoiceOpen, setImportChoiceOpen] = useState(false)
  const [importMode, setImportMode] = useState<'sections' | 'original' | 'pdf'>('sections')
  const [initialNavigation] = useState(() => peekNavigationParams())
  useEffect(() => { consumeNavigationParams() }, [])
  const [searchQuery, setSearchQuery] = useState(() => initialNavigation?.search ?? '')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [showNeedsReview, setShowNeedsReview] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportRoot, setExportRootState] = useState<string | null>(null)
  const [isExportingAll, setIsExportingAll] = useState(false)
  const [exportProgress, setExportProgress] = useState('')

  useEffect(() => {
    getUserRole(userEmail).then(setUserRole)
  }, [userEmail])

  useEffect(() => {
    if (initialNavigation?.tab === 'review') setWorkflowView('workflow')
  }, [initialNavigation])

  const normalizedUserEmail = userEmail.trim().toLowerCase()
  const isManager = userRole === 'manager' || userRole === 'creator'
  const isGuideAdmin = (guideAdminEmails || []).some((email) => email.trim().toLowerCase() === normalizedUserEmail)
  const isGuideReviewer = isManager || isGuideAdmin
  const pendingReviewCount = (reviewRequests || []).filter((request) => request.status === 'pending').length
  const myOpenReviewCount = (reviewRequests || []).filter((request) => request.submittedBy.trim().toLowerCase() === normalizedUserEmail && request.status !== 'approved' && request.status !== 'withdrawn').length

  // Tværgående guide-eksistens (Fase 8): kun titel/kategori vises fra ANDRE teams — men vi henter
  // det FULDE Guide-objekt, så en godkendt adgangsanmodning kan vise ægte indhold uden et ekstra kald.
  // `selectedTeamId === null` betyder "vis mit eget team" (uændret adfærd, resten af filen).
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [currentTeamCode, setCurrentTeamCode] = useState<string | undefined>()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [otherTeamGuides, setOtherTeamGuides] = useState<Guide[]>([])
  const [foreignLinkTargets, setForeignLinkTargets] = useState<GuideLinkEntry[]>([])
  const [otherTeamRequests, setOtherTeamRequests] = useState<GuideAccessRequest[]>([])
  const [isLoadingOtherTeamGuides, setIsLoadingOtherTeamGuides] = useState(false)
  const otherTeamRequest = useRef(0)
  const [submittingRequestGuideId, setSubmittingRequestGuideId] = useState<string | null>(null)
  // `${action}:${id}` for the review/draft action being saved, so its button shows a spinner.
  const [reviewBusyKey, setReviewBusyKey] = useState<string | null>(null)

  useEffect(() => {
    if (!window.electronRegistry) return
    // Eget team skal ALDRIG optræde som en "andet team"-fane — der er ingen mening i at
    // "anmode om adgang" til guides man allerede har fuld adgang til fra starten.
    Promise.all([
      window.electronRegistry.listTeams(),
      window.electronRegistry.getCurrentTeam(),
    ]).then(([allTeams, currentTeam]) => {
      setTeams(allTeams.filter(team => team.teamId !== currentTeam?.teamId))
      setCurrentTeamCode(currentTeam?.folderName)
    }).catch((error) => console.error('Kunne ikke hente teamlisten:', error))
  }, [])

  // Fase 3: eget teams "reelle" bibliotek = lokale guides + delte guides denne guide er tagget
  // med eget teams kode. En delt guide findes fysisk KUN i shared-guides — aldrig duplikeret
  // ind i den lokale guides-KV — så redigering fra et hvilket som helst deltagende team altid
  // rammer den samme, ene fil.
  const isSharedGuide = (guide: Guide) => (guide.sharedWithTeamCodes?.length || 0) > 0
  // A shared guide's images live in the store of whichever team uploaded them.
  const sharedFileLoader = useCallback((guide: Guide) => (url: string) => fileStorage.downloadFile(url, async <T,>(key: string): Promise<T | undefined> => {
    const own = await window.kv.get<T>(key)
    if (own !== undefined && own !== null) return own
    return window.electronRegistry?.readSharedGuideFile<T>(kind, guide.id, key)
  }), [kind])

  const myGuides = useMemo(() => {
    const local = (guides || []).filter((g) => !isSharedGuide(g))
    const shared = (sharedGuides || []).filter((g) => currentTeamCode && g.sharedWithTeamCodes?.includes(currentTeamCode))
    return [...local, ...shared]
  }, [guides, sharedGuides, currentTeamCode])

  const linkTargets = useMemo(() => {
    const entry = (guide: Guide): GuideLinkEntry[] => isSharedGuide(guide)
      ? currentTeamCode && guide.sharedWithTeamCodes?.includes(currentTeamCode) ? [{ guide, scope: 'shared', fileLoader: sharedFileLoader(guide) }] : []
      : currentTeamCode ? [{ guide, scope: 'team', teamCode: currentTeamCode }] : []
    return [
      ...myGuides.flatMap(entry),
      ...(archivedGuides || []).flatMap(archived => entry(archived.guide).map(target => ({ ...target, archived: true }))),
      ...foreignLinkTargets,
    ]
  }, [myGuides, archivedGuides, currentTeamCode, foreignLinkTargets, sharedFileLoader])

  useEffect(() => {
    let cancelled = false
    const api = window.electronRegistry
    setForeignLinkTargets([])
    if ((!dialogOpen && !viewerOpen) || !api || !currentTeamCode || !teams.length) return
    const selectedTeams = teams.slice(0, 20)
    void api.readTeamsKeys(selectedTeams.map(team => ({ folderName: team.folderName, keys: [keys.items, keys.requests] }))).then(results => {
      if (cancelled) return
      const entries: GuideLinkEntry[] = selectedTeams.flatMap((team, index) => {
        const [rows, grants] = results[index] || []
        if (!Array.isArray(rows) || !Array.isArray(grants)) return []
        return (rows as Guide[]).filter(guide => hasGuideLinkAccess(grants as GuideAccessRequest[], guide.id, userEmail, currentTeamCode))
          .map(guide => ({ guide, scope: 'team' as const, teamCode: team.folderName,
            fileLoader: (url: string) => fileStorage.downloadFile(url, key => api.readTeamKey(team.folderName, key)),
          }))
      })
      setForeignLinkTargets(entries)
    }).catch(error => { if (!cancelled) console.error('Could not verify linked team guides:', error) })
    return () => { cancelled = true }
  }, [dialogOpen, viewerOpen, teams, currentTeamCode, userEmail, keys])

  // Genindlaeses hver gang editoren lukkes, saa listen afspejler en netop gemt
  // eller forkastet kladde uden at brugeren skal skifte visning.
  useEffect(() => {
    if (dialogOpen) return
    let cancelled = false
    listDrafts(userEmail, kind).then((found) => { if (!cancelled) setDrafts(found) }).catch(() => {})
    return () => { cancelled = true }
  }, [dialogOpen, userEmail, kind])

  // Kladder der lige nu gemmes (kladden) eller slettes (null) i baggrunden – en skrivning til M:
  // tager op til 90 s, saa listen viser resultatet med det samme. En kladde, der ikke kunne gemmes,
  // bliver staaende her, saa arbejdet stadig kan genoptages i denne session.
  const [draftOverrides, setDraftOverrides] = useState<Record<string, GuideDraft | null>>({})
  const draftWriteSequence = useRef(new Map<string, number>())
  const shownDrafts = useMemo(() => {
    const merged = drafts.filter((draft) => !(draft.guideId in draftOverrides))
    for (const draft of Object.values(draftOverrides)) if (draft) merged.push(draft)
    return merged.sort((a, b) => (b.lastAutoSavedAt || 0) - (a.lastAutoSavedAt || 0))
  }, [drafts, draftOverrides])

  const changeDraftInBackground = useCallback((guideId: string, draft: GuideDraft | null, failureMessage?: string): Promise<boolean> => {
    const sequence = (draftWriteSequence.current.get(guideId) || 0) + 1
    draftWriteSequence.current.set(guideId, sequence)
    const isLatest = () => draftWriteSequence.current.get(guideId) === sequence
    const clearOverride = () => setDraftOverrides((current) => {
      if (!(guideId in current)) return current
      const next = { ...current }
      delete next[guideId]
      return next
    })
    setDraftOverrides((current) => ({ ...current, [guideId]: draft }))
    return trackPendingWrite(draft ? saveDraft(draft, kind) : deleteDraft(guideId, kind)).then(() => {
      setDrafts((current) => {
        const rest = current.filter((entry) => entry.guideId !== guideId)
        return draft ? [...rest, draft] : rest
      })
      if (isLatest()) clearOverride()
      return true
    }, (error) => {
      console.error('Kunne ikke gemme/slette guide-kladde:', error)
      toast.error(failureMessage || (draft
        ? t.guideEditor.draftSaveFailed
        : (language === 'da' ? 'Kladden blev ikke slettet — prøv igen' : language === 'fi' ? 'Luonnosta ei poistettu — yritä uudelleen' : language === 'sv' ? 'Utkastet togs inte bort — försök igen' : 'The draft was not deleted — please try again')))
      // En sletning, der fejlede, viser kladden igen; en kladde, der ikke kunne gemmes, bliver staaende.
      if (!draft && isLatest()) clearOverride()
      return false
    })
  }, [kind, t, language])

  const loadOtherTeamGuides = () => {
    const request = ++otherTeamRequest.current
    if (!selectedTeamId) { setIsLoadingOtherTeamGuides(false); return }
    const team = teams.find(tm => tm.teamId === selectedTeamId)
    if (!team || !window.electronRegistry) { setIsLoadingOtherTeamGuides(false); return }
    setIsLoadingOtherTeamGuides(true)
    window.electronRegistry.readTeamKeys(team.folderName, [keys.items, keys.requests]).then(([guidesData, requestsData]) => {
      if (request !== otherTeamRequest.current) return
      setOtherTeamGuides((guidesData as Guide[]) || [])
      setOtherTeamRequests((requestsData as GuideAccessRequest[]) || [])
    }).catch((error) => {
      if (request !== otherTeamRequest.current) return
      // Uden dette blev spinneren staaende for evigt hvis drevet svigtede.
      console.error('Kunne ikke hente det andet teams guides:', error)
      setOtherTeamGuides([])
      setOtherTeamRequests([])
      toast.error(t.guideLibrary.loadOtherTeamFailed)
    }).finally(() => { if (request === otherTeamRequest.current) setIsLoadingOtherTeamGuides(false) })
  }

  useEffect(() => {
    loadOtherTeamGuides()
    return () => { otherTeamRequest.current++ }
  }, [selectedTeamId, teams])

  // Anmodningen gemmes i den EJENDE teams egen store (registry:submit-guide-access-request),
  // så deres manager ser den som en helt normal del af deres eget team. Den vises som
  // "afventer" med det samme; skrivningen til det andet teams drev sker i baggrunden.
  const handleRequestAccess = async (guide: Guide) => {
    const team = teams.find(tm => tm.teamId === selectedTeamId)
    if (!team || !window.electronRegistry) return
    const registry = window.electronRegistry
    setSubmittingRequestGuideId(guide.id)
    let requestingTeamCode = currentTeamCode
    try {
      if (!requestingTeamCode) requestingTeamCode = (await registry.getCurrentTeam())?.folderName
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.guideLibrary.accessRequest.submitFailed)
      return
    } finally {
      setSubmittingRequestGuideId(null)
    }
    const request: GuideAccessRequest = {
      id: newId('guide-access'),
      guideId: guide.id,
      guideTitle: guide.title,
      requestingTeamCode: requestingTeamCode || '',
      requestingUserEmail: userEmail,
      requestingUserName: usersByEmail?.[userEmail]?.fullName || userEmail,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    }
    const shownFor = otherTeamRequest.current
    setOtherTeamRequests(current => [...current, request])
    toast.success(t.guideLibrary.accessRequest.submitted)
    const submit = kind === 'knowledge' ? registry.submitKnowledgeAccessRequest : registry.submitGuideAccessRequest
    void trackPendingWrite(Promise.resolve(submit(team.folderName, request))).then((ownRows: unknown) => {
      if (shownFor !== otherTeamRequest.current || !Array.isArray(ownRows)) return
      // Serveren tildeler sit eget id; erstat den viste anmodning med de gemte raekker.
      const saved = ownRows as GuideAccessRequest[]
      setOtherTeamRequests(current => [...current.filter(entry => entry.id !== request.id && !saved.some(row => row.id === entry.id)), ...saved])
    }, (error: unknown) => {
      console.error('Adgangsanmodningen kunne ikke gemmes:', error)
      if (shownFor === otherTeamRequest.current) setOtherTeamRequests(current => current.filter(entry => entry.id !== request.id))
      toast.error(error instanceof Error ? error.message : t.guideLibrary.accessRequest.submitFailed)
    })
  }

  // Nyeste anmodning fra MIG for en given guide (der kan i teorien være flere over tid,
  // fx en afvist efterfulgt af en ny anmodning) — udløbet godkendelse tæller som "ingen".
  const getMyRequestForGuide = (guideId: string): GuideAccessRequest | undefined => {
    const mine = otherTeamRequests
      .filter(r => r.guideId === guideId && r.requestingUserEmail === userEmail)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    const latest = mine[0]
    if (latest?.status === 'approved' && latest.expiresAt && new Date(latest.expiresAt) < new Date()) {
      return undefined
    }
    return latest
  }

  useEffect(() => {
    if (exportDialogOpen) {
      getExportRoot(kind).then(setExportRootState).catch(() => setExportRootState(null))
    }
  }, [exportDialogOpen, kind])

  useEffect(() => {
    // Lukker vores egne kendte dialoger direkte, i stedet for kun at stole på
    // at Radix selv har nået at lukke dem inden vi tjekker DOM'en — undgår en
    // kapløbstilstand ved store/komplekse dialoger (fx guide-preview).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (categoryManagerOpen) { setCategoryManagerOpen(false); return }
      if (exportDialogOpen) { setExportDialogOpen(false); return }
      if (viewerOpen) { setViewerOpen(false); setViewGuide(null); return }
      if (dialogOpen) { setDialogOpen(false); setEditGuide(undefined); setImportDraft(null); return }
      if (isAnyModalOpen()) return
      onNavigateBack()
    }
    
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack, categoryManagerOpen, exportDialogOpen, viewerOpen, dialogOpen])

  const needsReviewCount = useMemo(() => {
    return myGuides.filter((g) => {
      const status = getReviewStatus(g)
      return status === 'overdue' || status === 'due-soon'
    }).length
  }, [myGuides])

  // BM25-indeks over alle guides — genbygges når guides ændrer sig (også fra andre klienter via useKV).
  const searchIndex = useMemo(() => {
    const index = new GuideSearchIndex()
    index.build(myGuides)
    return index
  }, [myGuides])

  const searchResults = useMemo(
    () => (searchQuery.trim() ? searchIndex.searchGuides(searchQuery, 100) : null),
    [searchIndex, searchQuery]
  )

  const filteredGuides = useMemo(() => {
    const matchesFilters = (guide: Guide) => {
      const matchesCategory = activeCategory === 'All' || guide.category === activeCategory
      if (!matchesCategory) return false
      if (showNeedsReview) {
        const status = getReviewStatus(guide)
        return status === 'overdue' || status === 'due-soon'
      }
      return true
    }

    if (searchResults) {
      const resultById = new Map(searchResults.map((r) => [r.guideId, r]))
      let list = myGuides.filter((g) => resultById.has(g.id) && matchesFilters(g))
      list.sort((a, b) => (resultById.get(b.id)?.score || 0) - (resultById.get(a.id)?.score || 0))
      if (list.length === 0) {
        // Fallback: simpel substring (fx meget korte søgninger som "3500")
        list = myGuides.filter((g) => matchesFilters(g) && guidePlainText(g).toLowerCase().includes(searchQuery.toLowerCase()))
      }
      return list
    }

    const filtered = myGuides.filter(matchesFilters)
    if (showNeedsReview) {
      // Mest presserende først.
      return [...filtered].sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0))
    }
    return filtered
  }, [myGuides, activeCategory, showNeedsReview, searchQuery, searchResults])

  const matchInfoById = useMemo(() => {
    if (!searchResults) return new Map<string, { reference: string; text: string; relevance: number }>()
    return new Map(searchResults.map((r) => [r.guideId, {
      reference: r.bestChunk.stepNumber ? `§${r.bestChunk.stepNumber}` : r.bestChunk.sectionNumber ? `§${r.bestChunk.sectionNumber}` : '',
      text: r.bestChunk.text.length > 140 ? r.bestChunk.text.slice(0, 140) + '…' : r.bestChunk.text,
      relevance: Math.round(r.normalizedScore * 100),
    }]))
  }, [searchResults])

  const handleMarkReviewed = (guide: Guide) => {
    const now = Date.now()
    const applyReview = (list: Guide[] | undefined) => (list || []).map((g) => g.id === guide.id
      ? { ...g, lastReviewedAt: now, nextReviewAt: computeNextReviewAt(now, g.reviewIntervalMonths) }
      : g)
    if (isSharedGuide(guide)) {
      setSharedGuides(applyReview)
    } else {
      setGuides(applyReview)
    }
    toast.success(`"${guide.title}" ${t.guideLibrary.toasts.markedReviewedSuffix}`)
  }

  const updateReviewRequest = async (updated: GuideReviewRequest) => {
    await upsertInKvArray(keys.reviewRequests, [updated])
  }

  const changeNotSavedMessage = () => lt(language === 'da' ? 'Ændringen blev ikke gemt — prøv igen' : language === 'fi' ? 'Muutosta ei tallennettu — yritä uudelleen' : language === 'sv' ? 'Ändringen sparades inte — försök igen' : 'The change was not saved — please try again')

  /** Gemmer anmodningen i baggrunden; listerne (useKV) viser den med det samme og ruller tilbage ved fejl. */
  const saveReviewRequestInBackground = (updated: GuideReviewRequest, failure = changeNotSavedMessage()) =>
    saveInBackground(updateReviewRequest(updated), { failure })

  const runReviewAction = async (key: string, action: () => void | Promise<void>) => {
    if (reviewBusyKey) return
    setReviewBusyKey(key)
    try {
      await action()
    } catch (error) {
      console.error('Guide action failed:', error)
      toast.error(error instanceof Error && error.message ? error.message : t.guideEditor.saveFailed)
    } finally {
      setReviewBusyKey(null)
    }
  }

  const publishGuide = async (guide: Guide) => {
    const wasShared = (sharedGuides || []).some((item) => item.id === guide.id)
    const wasLocal = (guides || []).some((item) => item.id === guide.id)

    // De to noegler er uafhaengige, saa skrivningerne kan ske samtidig i stedet
    // for at laegge to fulde netvaerksrundture i forlaengelse af hinanden.
    if (isSharedGuide(guide)) {
      await Promise.all([
        upsertInKvArray(keys.shared, [guide]),
        wasLocal ? removeFromKvArray(keys.items, [guide.id]) : Promise.resolve(),
      ])
    } else {
      await Promise.all([
        upsertInKvArray(keys.items, [guide]),
        wasShared ? removeFromKvArray(keys.shared, [guide.id]) : Promise.resolve(),
      ])
    }
  }

  const closeGuideEditor = () => {
    setDialogOpen(false)
    setEditGuide(undefined)
    setEditingReviewRequest(null)
    setEditingAsReviewer(false)
    setImportDraft(null)
  }

  // Gemmer review-anmodningen i baggrunden. Kladden skjules med det samme og slettes foerst, naar
  // anmodningen er gemt; fejler gemningen, gemmes arbejdet i stedet som kladde, saa intet gaar tabt.
  const submitReviewInBackground = (request: GuideReviewRequest, draft: GuideDraft) => {
    draftWriteSequence.current.set(draft.guideId, (draftWriteSequence.current.get(draft.guideId) || 0) + 1)
    setDraftOverrides((current) => ({ ...current, [draft.guideId]: null }))
    void saveInBackground(updateReviewRequest(request), {
      failure: lt(language === 'da' ? 'Guiden blev ikke gemt på det fælles drev — dit arbejde er bevaret som kladde' : language === 'fi' ? 'Opasta ei tallennettu yhteiselle asemalle — työsi säilytettiin luonnoksena' : language === 'sv' ? 'Guiden sparades inte på den gemensamma enheten — ditt arbete har sparats som utkast' : 'The guide was not saved to the shared drive — your work was kept as a draft'),
    }).then((saved) => { void changeDraftInBackground(draft.guideId, saved ? null : draft) })
  }

  const handleSaveGuide = async (guide: Guide, changeNote: string | undefined, draft: GuideDraft): Promise<boolean> => {
    const now = Date.now()
    const displayName = usersByEmail?.[userEmail]?.fullName || userEmail

    if (editingReviewRequest) {
      // Rebase ved gen-indsendelse af en opdatering: sammenligningsgrundlaget
      // laases til den AKTUELT udgivne version. Ellers beholder requesten sin
      // gamle baseVersion og kan aldrig godkendes, hvis guiden er aendret siden
      // (evig "versionskonflikt"). Forslagets version re-bumpes fra samme base,
      // saa versionsnummeret aldrig gaar baglaens.
      let rebase: Partial<GuideReviewRequest> = {}
      let submittedGuide = guide
      if (editingReviewRequest.action === 'update') {
        const [latestLocal, latestShared] = await Promise.all([
          window.kv.get<Guide[]>(keys.items),
          window.kv.get<Guide[]>(keys.shared),
        ])
        const currentPublished = [...(latestLocal || []), ...(latestShared || [])].find((item) => item.id === guide.id)
        if (currentPublished) {
          rebase = { baseVersion: currentPublished.version, baseGuide: structuredClone(currentPublished) }
          submittedGuide = { ...guide, version: bumpVersion(currentPublished.version) }
        }
      }
      const updated: GuideReviewRequest = {
        ...editingReviewRequest,
        ...rebase,
        guideId: submittedGuide.id,
        guideTitle: submittedGuide.title,
        proposedGuide: submittedGuide,
        status: 'pending',
        updatedAt: now,
        submittedAt: editingAsReviewer ? editingReviewRequest.submittedAt : now,
        changeNote: changeNote || editingReviewRequest.changeNote,
        reviewerComment: editingAsReviewer ? editingReviewRequest.reviewerComment : undefined,
        claimedBy: editingAsReviewer ? userEmail : undefined,
        claimedAt: editingAsReviewer ? (editingReviewRequest.claimedAt || now) : undefined,
        reviewerEditedBy: editingAsReviewer ? userEmail : editingReviewRequest.reviewerEditedBy,
        reviewerEditedAt: editingAsReviewer ? now : editingReviewRequest.reviewerEditedAt,
        reviewedBy: undefined,
        reviewedAt: undefined,
      }
      submitReviewInBackground(updated, draft)
      toast.success(editingAsReviewer
        ? (language === 'da' ? 'Reviewerens rettelser er gemt i forslaget' : language === 'fi' ? 'Tarkistajan muutokset tallennettiin ehdotukseen' : language === 'sv' ? 'Granskarens ändringar sparades i förslaget' : 'Reviewer changes saved to the proposal')
        : lt(language === 'da' ? 'Guiden er sendt til review igen' : language === 'fi' ? 'Opas lähetettiin uudelleen tarkistettavaksi' : language === 'sv' ? 'Guiden skickades till granskning igen' : 'Guide resubmitted for review'))
      closeGuideEditor()
      return true
    }

    const [latestLocalGuides, latestSharedGuides] = await Promise.all([
      window.kv.get<Guide[]>(keys.items),
      window.kv.get<Guide[]>(keys.shared),
    ])
    const latestPublishedGuides = [...(latestLocalGuides || []), ...(latestSharedGuides || [])]
    const intendedAsUpdate = Boolean(editGuide)
    const published = intendedAsUpdate ? latestPublishedGuides.find((item) => item.id === guide.id) : undefined
    if (intendedAsUpdate && !published) {
      toast.error(lt(language === 'da' ? 'Den udgivne guide findes ikke længere. Genindlæs biblioteket og prøv igen.' : language === 'fi' ? 'Julkaistua opasta ei enää ole. Lataa kirjasto uudelleen ja yritä uudelleen.' : language === 'sv' ? 'Den publicerade guiden finns inte längre. Ladda om biblioteket och försök igen.' : 'The published guide no longer exists. Reload the library and try again.'))
      return false
    }
    const hasIdCollision = !intendedAsUpdate && latestPublishedGuides.some((item) => item.id === guide.id)
    const submittedGuide = hasIdCollision
      ? { ...guide, id: newId('guide'), createdAt: now, updatedAt: now }
      : guide
    const request: GuideReviewRequest = {
      id: newId('guide-review'),
      guideId: submittedGuide.id,
      guideTitle: submittedGuide.title,
      action: published ? 'update' : 'create',
      status: 'pending',
      baseVersion: published?.version,
      baseGuide: published ? structuredClone(published) : undefined,
      proposedGuide: submittedGuide,
      submittedBy: userEmail,
      submittedByName: displayName,
      submittedAt: now,
      updatedAt: now,
      changeNote,
    }
    submitReviewInBackground(request, draft)
    toast.success(lt(language === 'da' ? 'Guiden er sendt til review' : language === 'fi' ? 'Opas lähetettiin tarkistettavaksi' : language === 'sv' ? 'Guiden skickades till granskning' : 'Guide submitted for review'))
    closeGuideEditor()
    setWorkflowView('workflow')
    return true
  }

  const handleEditGuide = (guide: Guide) => {
    const existingRequest = (reviewRequests || []).find((request) => request.guideId === guide.id && isOpenGuideReview(request))
    if (existingRequest) {
      const own = existingRequest.submittedBy.trim().toLowerCase() === normalizedUserEmail
      if (own && existingRequest.status !== 'pending' && existingRequest.action !== 'delete') {
        setEditingReviewRequest(existingRequest)
        setEditingAsReviewer(false)
        setEditGuide(existingRequest.proposedGuide)
        setDialogOpen(true)
        return
      }
      toast.info(lt(language === 'da' ? 'Der findes allerede en åben revision af denne guide' : language === 'fi' ? 'Tälle oppaalle on jo avoin versio' : language === 'sv' ? 'Det finns redan en öppen revision av den här guiden' : 'An open revision already exists for this guide'))
      setWorkflowView('workflow')
      return
    }
    setEditGuide(guide)
    setDialogOpen(true)
  }

  const handleDeleteGuide = (id: string) => {
    const guide = myGuides.find((g) => g.id === id)
    if (!guide) return
    const existingRequest = (reviewRequests || []).find((request) => request.guideId === id && isOpenGuideReview(request))
    if (existingRequest) {
      toast.info(lt(language === 'da' ? 'Der findes allerede en åben anmodning for denne guide' : language === 'fi' ? 'Tälle oppaalle on jo avoin pyyntö' : language === 'sv' ? 'Det finns redan en öppen begäran för den här guiden' : 'An open request already exists for this guide'))
      return
    }
    const now = Date.now()
    void saveReviewRequestInBackground({
      id: newId('guide-review'),
      guideId: guide.id,
      guideTitle: guide.title,
      action: 'delete',
      status: 'pending',
      baseVersion: guide.version,
      baseGuide: structuredClone(guide),
      submittedBy: userEmail,
      submittedByName: usersByEmail?.[userEmail]?.fullName || userEmail,
      submittedAt: now,
      updatedAt: now,
    })
    toast.success(language === 'da' ? 'Sletningen er sendt til review' : language === 'fi' ? 'Poistaminen lähetettiin tarkistettavaksi' : language === 'sv' ? 'Borttagningen skickades till granskning' : 'Deletion submitted for review')
    setWorkflowView('workflow')
  }

  const handleAddNew = () => {
    setEditingReviewRequest(null)
    setEditingAsReviewer(false)
    setEditGuide(undefined)
    setImportDraft(null)
    setResumeDraft(null)
    setDialogOpen(true)
  }

  const handleResumeDraft = (draft: GuideDraft) => {
    setEditingReviewRequest(null)
    setEditingAsReviewer(false)
    setImportDraft(null)
    // Hoerer kladden til en allerede udgivet guide, skal den aabnes som en
    // REDIGERING af den guide. Ellers ville et gem oprette en dublet i stedet
    // for at opdatere originalen.
    setEditGuide(myGuides.find((guide) => guide.id === draft.guideId))
    setResumeDraft(draft)
    setDialogOpen(true)
  }

  const handleDeleteDraft = (draft: GuideDraft) => {
    void changeDraftInBackground(draft.guideId, null)
    toast.success(t.guideEditor.draftDeleted)
  }

  const handleEditReviewRequest = (request: GuideReviewRequest, asReviewer: boolean) => {
    if (!request.proposedGuide) {
      if (!asReviewer && request.action === 'delete') {
        void saveReviewRequestInBackground({ ...request, status: 'pending', submittedAt: Date.now(), updatedAt: Date.now(), reviewerComment: undefined })
        toast.success(language === 'da' ? 'Sletningen er sendt til review igen' : language === 'fi' ? 'Poistaminen lähetettiin uudelleen tarkistettavaksi' : language === 'sv' ? 'Borttagningen skickades till granskning igen' : 'Deletion resubmitted for review')
      }
      return
    }
    setEditingReviewRequest(request)
    setEditingAsReviewer(asReviewer)
    setEditGuide(request.proposedGuide)
    setDialogOpen(true)
  }

  const handleClaimReview = (request: GuideReviewRequest) => {
    if (!isGuideReviewer || !canReviewGuideRequest(request, userEmail, isManager) || (request.claimedBy && request.claimedBy !== userEmail && !isManager)) return
    void saveReviewRequestInBackground({ ...request, claimedBy: userEmail, claimedAt: Date.now(), updatedAt: Date.now() })
  }

  const handleReturnReview = (request: GuideReviewRequest, comment: string) => {
    void saveReviewRequestInBackground({
      ...request,
      status: 'changes_requested',
      reviewerComment: comment,
      reviewedBy: userEmail,
      reviewedAt: Date.now(),
      claimedBy: undefined,
      claimedAt: undefined,
      updatedAt: Date.now(),
    })
    toast.success(lt(language === 'da' ? 'Guiden er sendt tilbage til forfatteren' : language === 'fi' ? 'Opas palautettiin tekijälle' : language === 'sv' ? 'Guiden skickades tillbaka till författaren' : 'Guide returned to the author'))
  }

  const handleWithdrawReview = (request: GuideReviewRequest) => {
    if (request.submittedBy.trim().toLowerCase() !== normalizedUserEmail) return
    void saveReviewRequestInBackground({ ...request, status: 'draft', claimedBy: undefined, claimedAt: undefined, updatedAt: Date.now() })
    toast.success(language === 'da' ? 'Revisionen er trukket tilbage som kladde' : language === 'fi' ? 'Versio palautettiin luonnokseksi' : language === 'sv' ? 'Revisionen återkallades som utkast' : 'Revision withdrawn to draft')
  }

  // Fjerner en aaben anmodning helt (den udgivne guide roeres ikke). Sidste
  // udvej mod fastlaaste anmodninger — kladder blokerer ellers nye revisioner.
  const handleDiscardReview = (request: GuideReviewRequest) => {
    const isOwn = request.submittedBy.trim().toLowerCase() === normalizedUserEmail
    if (!isOwn && !isManager) return
    if (!isOpenGuideReview(request)) return
    void saveInBackground(removeFromKvArray(keys.reviewRequests, [request.id]), { failure: changeNotSavedMessage() })
    toast.success(language === 'da' ? 'Anmodningen er kasseret' : language === 'fi' ? 'Pyyntö hylättiin' : language === 'sv' ? 'Begäran kasserades' : 'Request discarded')
  }

  const approvedMessage = (request: GuideReviewRequest) => lt(request.action === 'delete'
    ? (language === 'da' ? 'Guiden er godkendt til sletning og arkiveret' : language === 'fi' ? 'Oppaan poistaminen hyväksyttiin ja opas arkistoitiin' : language === 'sv' ? 'Guiden godkändes för borttagning och arkiverades' : 'Guide deletion approved and archived')
    : (language === 'da' ? 'Guiden er godkendt og udgivet' : language === 'fi' ? 'Opas hyväksyttiin ja julkaistiin' : language === 'sv' ? 'Guiden godkändes och publicerades' : 'Guide approved and published'))

  // Kun laesningen af de nyeste lister (konfliktkontrol, under et sekund) venter med spinner;
  // selve godkendelsen vises med det samme og gemmes i baggrunden (approveInBackground).
  const handleApproveReview = async (request: GuideReviewRequest) => {
    if (!isGuideReviewer || !canReviewGuideRequest(request, userEmail, isManager)) return
    const [latestLocalGuides, latestSharedGuides, latestArchived] = await Promise.all([
      window.kv.get<Guide[]>(keys.items),
      window.kv.get<Guide[]>(keys.shared),
      window.kv.get<ArchivedGuideEntry[]>(keys.archived),
    ])
    const published = [...(latestLocalGuides || []), ...(latestSharedGuides || [])].find((guide) => guide.id === request.guideId)

    // En tidligere godkendelse kan vaere afbrudt EFTER virkningen slog igennem,
    // men FOER requesten blev lukket (fx netvaerksfejl mod det delte drev).
    // Saa er der ingen konflikt — luk blot requesten som godkendt.
    if (isGuideReviewAlreadyApplied(request, published, latestArchived || [])) {
      toast.success(approvedMessage(request))
      void closeApprovedReview(request)
      return
    }

    const hasConflict = hasGuideReviewConflict(request, published)
    if (hasConflict) {
      handleReturnReview(request, lt(language === 'da' ? 'Den udgivne guide er ændret siden indsendelsen. Opret revisionen igen fra den nyeste version.' : language === 'fi' ? 'Julkaistua opasta on muutettu lähetyksen jälkeen. Luo versio uudelleen uusimmasta versiosta.' : language === 'sv' ? 'Den publicerade guiden har ändrats sedan inlämningen. Skapa revisionen igen från den senaste versionen.' : 'The published guide changed after submission. Recreate the revision from the latest version.'))
      toast.error(language === 'da' ? 'Revisionen kunne ikke godkendes på grund af en versionskonflikt' : language === 'fi' ? 'Versiota ei voitu hyväksyä versiokonfliktin vuoksi' : language === 'sv' ? 'Revisionen kunde inte godkännas på grund av en versionskonflikt' : 'The revision could not be approved because of a version conflict')
      return
    }

    if (request.action === 'delete' && !published) return
    toast.success(approvedMessage(request))
    void approveInBackground(request, published)
  }

  /**
   * Godkendelsen vises med det samme alle steder (anmodningen som godkendt, guiden udgivet/fjernet)
   * og gemmes i baggrunden. Raekkefoelgen er bevidst: guidens indhold (og ved sletning arkivet) skal
   * vaere gemt, FOER guiden fjernes og anmodningen lukkes. Fejler et trin, rulles visningen tilbage
   * ved at visningerne genindlaeser det gemte, og et nyt tryk paa Godkend er sikkert (idempotent).
   */
  const approveInBackground = async (request: GuideReviewRequest, published: Guide | undefined) => {
    const now = Date.now()
    const shownAsApproved: GuideReviewRequest = { ...request, status: 'approved', reviewedBy: userEmail, reviewedAt: now, updatedAt: now }
    const predictions = [beginKvPrediction(keys.reviewRequests, { op: 'upsert', items: [shownAsApproved] })]
    try {
      if (request.action === 'delete') {
        if (!published) return
        const fromKey = isSharedGuide(published) ? keys.shared : keys.items
        predictions.push(beginKvPrediction(fromKey, { op: 'remove', ids: [published.id] }))
        await upsertInKvArray(keys.archived, [{
          id: `guide-archive-${request.id}`, guide: structuredClone(published), archivedAt: now,
          archivedBy: userEmail, requestId: request.id,
        }])
        await removeFromKvArray(fromKey, [published.id])
        await closeApprovedReview(request)
        return
      }
      if (!request.proposedGuide) {
        await closeApprovedReview(request)
        return
      }
      const approvedGuide = {
        ...request.proposedGuide,
        updatedBy: request.reviewerEditedBy || request.proposedGuide.updatedBy,
        updatedAt: now,
        lastReviewedAt: now,
        nextReviewAt: computeNextReviewAt(now, request.proposedGuide.reviewIntervalMonths),
      }
      await publishGuide(approvedGuide)
      // Guiden er udgivet; historik, arkivmarkering og lukning af anmodningen er uafhaengige noegler.
      const archiveEntry = request.action === 'restore'
        ? (archivedGuides || []).find((entry) => entry.guide.id === request.guideId && !entry.restoredAt)
        : undefined
      await Promise.all([
        trackPendingWrite(saveVersionSnapshot(approvedGuide, userEmail, request.changeNote, kind)).catch((historyError) => {
          console.error('Guiden blev udgivet, men versionshistorikken kunne ikke opdateres:', historyError)
          toast.warning(lt(language === 'da' ? 'Guiden blev udgivet, men versionshistorikken kunne ikke gemmes' : language === 'fi' ? 'Opas julkaistiin, mutta versiohistoriaa ei voitu tallentaa' : language === 'sv' ? 'Guiden publicerades, men versionshistoriken kunde inte sparas' : 'Guide published, but version history could not be saved'))
        }),
        archiveEntry
          ? upsertInKvArray(keys.archived, [{ ...archiveEntry, restoredAt: now, restoredBy: userEmail }]).catch((archiveError) => {
              console.error('Guiden blev gendannet, men arkivet kunne ikke markeres:', archiveError)
              toast.warning(changeNotSavedMessage())
            })
          : Promise.resolve(),
        closeApprovedReview(request),
      ])
    } catch (error) {
      console.error('Godkendelsen kunne ikke gemmes:', error)
      toast.error(lt(language === 'da' ? 'Godkendelsen blev ikke gemt på det fælles drev — prøv igen' : language === 'fi' ? 'Hyväksyntää ei tallennettu yhteiselle asemalle — yritä uudelleen' : language === 'sv' ? 'Godkännandet sparades inte på den gemensamma enheten — försök igen' : 'The approval was not saved to the shared drive — please try again'))
    } finally {
      predictions.forEach((end) => end())
    }
  }

  /** Sidste trin af en godkendelse. Fejler lukningen (flaky drev), er nyt tryk paa Godkend sikkert, da godkendelse er idempotent. */
  const closeApprovedReview = async (request: GuideReviewRequest): Promise<void> => {
    try {
      await updateReviewRequest({ ...request, status: 'approved', reviewedBy: userEmail, reviewedAt: Date.now(), updatedAt: Date.now() })
    } catch (error) {
      console.error('Godkendelsen slog igennem, men anmodningen kunne ikke lukkes:', error)
      toast.error(lt(language === 'da' ? 'Guiden er godkendt, men anmodningen kunne ikke markeres som afsluttet. Tryk Godkend igen for at afslutte den.' : language === 'fi' ? 'Opas hyväksyttiin, mutta pyyntöä ei voitu merkitä valmiiksi. Paina Hyväksy uudelleen.' : language === 'sv' ? 'Guiden godkändes, men begäran kunde inte markeras som slutförd. Tryck på Godkänn igen för att slutföra den.' : 'The guide was approved, but the request could not be marked as completed. Press Approve again to finish it.'))
    }
  }

  const handleRestoreArchived = (entry: ArchivedGuideEntry) => {
    const existing = (reviewRequests || []).find((request) => request.guideId === entry.guide.id && request.action === 'restore' && isOpenGuideReview(request))
    if (existing) {
      toast.info(language === 'da' ? 'Der findes allerede en gendannelsesanmodning' : language === 'fi' ? 'Palautuspyyntö on jo olemassa' : language === 'sv' ? 'Det finns redan en begäran om återställning' : 'A restore request already exists')
      return
    }
    const now = Date.now()
    const restored: Guide = { ...structuredClone(entry.guide), version: bumpVersion(entry.guide.version), updatedBy: userEmail, updatedAt: now }
    void saveReviewRequestInBackground({
      id: newId('guide-review'), guideId: restored.id, guideTitle: restored.title,
      action: 'restore', status: 'pending', baseGuide: entry.guide, proposedGuide: restored,
      submittedBy: userEmail, submittedByName: usersByEmail?.[userEmail]?.fullName || userEmail,
      submittedAt: now, updatedAt: now,
      changeNote: language === 'da' ? `Gendannelse af arkiveret version ${entry.guide.version || '1.00'}` : language === 'fi' ? `Arkistoidun version ${entry.guide.version || '1.00'} palautus` : language === 'sv' ? `Återställning av arkiverad version ${entry.guide.version || '1.00'}` : `Restore archived version ${entry.guide.version || '1.00'}`,
    })
    toast.success(language === 'da' ? 'Gendannelsen er sendt til review' : language === 'fi' ? 'Palautus lähetettiin tarkistettavaksi' : language === 'sv' ? 'Återställningen skickades till granskning' : 'Restore submitted for review')
  }
  const handleImportFileSelected = (file: File | undefined) => {
    if (!file) return
    if (importMode === 'pdf' ? !/\.pdf$/i.test(file.name) : !/\.docx$/i.test(file.name)) {
      toast.error(importMode === 'pdf' ? t.guideLibrary.toasts.onlyPdf : t.guideEditor.onlyDocxAllowed)
      return
    }
    // Importen kører i den globale guideImportManager (ikke lokal state), så den
    // fortsætter selvom brugeren navigerer væk fra Guide Biblioteket.
    guideImportManager.startImport(file, { preserveOriginal: importMode === 'original', language, kind }).catch((error) => {
      toast.error(error instanceof Error ? error.message : t.guideLibrary.toasts.importStartFailed)
    })
  }

  // Henter en færdig import-draft — enten lige nu (import fuldført mens vi var
  // her) eller ved mount (import fuldført mens brugeren var et andet sted i appen).
  useEffect(() => {
    if (isImporting) return
    const draft = guideImportManager.takePendingDraft(kind)
    if (!draft) return
    if (draft.sections.length === 0 && !draft.preserveWordLayout && !draft.originalPdf) {
      toast.error(t.guideLibrary.toasts.importEmptyContent)
    }
    setEditGuide(undefined)
    setImportDraft(draft)
    setDialogOpen(true)
  }, [isImporting])

  const handleViewGuide = (guide: Guide) => {
    setViewGuide(guide)
    setViewerOpen(true)
  }

  // Deep link (Ctrl+K): open the requested guide once the lists have loaded.
  const [requestedGuideId, setRequestedGuideId] = useState<string | null>(() => initialNavigation?.itemId ?? null)
  useEffect(() => {
    if (!requestedGuideId) return
    const requested = myGuides.find(guide => guide.id === requestedGuideId)
    if (!requested) return
    setRequestedGuideId(null)
    handleViewGuide(requested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedGuideId, myGuides])

  const handleChooseExportRoot = async () => {
    try {
      const root = await chooseAndSaveExportRoot(kind, () => toast.error(lt(language === 'da' ? 'Mappen kan bruges nu, men valget kunne ikke huskes på det fælles drev' : language === 'fi' ? 'Kansiota voi käyttää nyt, mutta valintaa ei voitu tallentaa yhteiselle asemalle' : language === 'sv' ? 'Mappen kan användas nu, men valet kunde inte sparas på den gemensamma enheten' : 'The folder can be used now, but the choice could not be saved to the shared drive')))
      if (root) {
        setExportRootState(root)
        toast.success(t.guideLibrary.toasts.exportFolderChosen)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.guideLibrary.toasts.chooseFolderFailed)
    }
  }

  const handleExportAll = async () => {
    if (!exportRoot) {
      toast.error(t.guideLibrary.toasts.selectExportFolderFirst)
      return
    }
    const exportable = myGuides.filter((guide) => guide.preserveWordLayout && guide.fileUrl || guideToDocModel(guide).sections.length > 0)
    if (exportable.length === 0) {
      toast.error(t.guideLibrary.toasts.noExportableGuides)
      return
    }
    setIsExportingAll(true)
    let ok = 0
    let failed = 0
    for (let i = 0; i < exportable.length; i++) {
      const guide = exportable[i]
      setExportProgress(`${t.guideLibrary.toasts.exportingProgress} ${i + 1}/${exportable.length}: ${guide.title}`)
      try {
        if (guide.preserveWordLayout) await exportOriginalGuideToLibrary(guide, exportRoot)
        else {
          const model = guideToDocModel(guide)
          const authorName = await resolveAuthorName(model.authorEmail)
          await exportGuideToLibrary(model, authorName || model.authorEmail, exportRoot)
        }
        ok++
      } catch (error) {
        console.error(`Eksport af "${guide.title}" fejlede:`, error)
        failed++
      }
    }
    setExportProgress('')
    setIsExportingAll(false)
    if (failed === 0) {
      toast.success(`${ok} ${ok === 1 ? t.guideLibrary.guideSingular : t.guideLibrary.guidePlural} ${t.guideLibrary.toasts.exportedToLibrarySuffix}`)
    } else {
      toast.warning(`${ok} ${t.guideLibrary.toasts.exportPartialPrefix} ${failed} ${t.guideLibrary.toasts.exportPartialSuffix}`)
    }
  }

  const handleUpdateCategories = (updatedCategories: string[]) => {
    setCategories(updatedCategories)
  }

  // Kaldes fra editoren når brugeren opretter en kategori inline.
  const handleCreateCategory = (name: string): boolean => {
    const existing = categories || defaultCategories
    if (existing.some((c) => c.toLowerCase() === name.toLowerCase())) return false
    setCategories([...existing, name])
    return true
  }

  const allCategories = ['All', ...(categories || defaultCategories)]

  // Tværgående team-vælger (Fase 8): kun vist når der findes mindst ét andet team.
  // Genbruges både i "mit team"-visningen og i "andet team"-visningen nedenfor.
  const renderTeamTabs = () => {
    if (teams.length < 1) return null
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <Button
          variant={selectedTeamId === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedTeamId(null)}
          className="rounded-full font-semibold"
        >
          {t.guideLibrary.myTeamTab}
        </Button>
        {teams.map((team) => (
          <Button
            key={team.teamId}
            variant={selectedTeamId === team.teamId ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedTeamId(team.teamId)}
            className="rounded-full font-semibold gap-1.5"
          >
            <Buildings size={16} />
            {team.name}
          </Button>
        ))}
      </div>
    )
  }

  if (selectedTeamId) {
    const otherTeam = teams.find(team => team.teamId === selectedTeamId)
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="fixed top-6 right-6 left-6 z-30 pointer-events-none">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-16">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
              >
                <Button
                  variant="outline"
                  size="lg"
                  onClick={onNavigateBack}
                  className="pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4"
                >
                  <ArrowLeft size={20} weight="bold" />
                  {t.common.back}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 pt-28 pb-12 sm:pb-20 max-w-5xl relative z-10">
          <header className="mb-6 border-b pb-4">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              {otherTeam?.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t.guideLibrary.otherTeamGuidesHint}</p>
          </header>

          {renderTeamTabs()}

          <Card className="p-6">
            {isLoadingOtherTeamGuides ? (
              <p className="text-center py-12 text-muted-foreground">{t.guideLibrary.loadingGuides}</p>
            ) : otherTeamGuides.length === 0 ? (
              <div className="text-center py-12">
                <LibraryIcon size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                <p className="text-muted-foreground">{t.guideLibrary.noGuidesInTeam}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {otherTeamGuides.map((guide) => {
                  const myRequest = getMyRequestForGuide(guide.id)
                  return (
                    <div
                      key={guide.id}
                      className="flex items-center justify-between gap-3 p-4 rounded-md border bg-card"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <LibraryIcon size={20} className="text-primary flex-shrink-0" weight="duotone" />
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{guide.title}</div>
                          <Badge variant="outline" className="mt-1">{guide.category}</Badge>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {myRequest?.status === 'approved' ? (
                          <Button size="sm" className="gap-1.5" onClick={() => { setViewGuide(guide); setViewerOpen(true) }}>
                            <Eye size={16} weight="bold" />
                            {t.guideLibrary.accessRequest.viewGuide}
                          </Button>
                        ) : myRequest?.status === 'pending' ? (
                          <Badge variant="secondary" className="gap-1.5">
                            <Clock size={14} weight="bold" />
                            {t.guideLibrary.accessRequest.pending}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            loading={submittingRequestGuideId === guide.id}
                            onClick={() => handleRequestAccess(guide)}
                          >
                            <LockKey size={16} weight="bold" />
                            {myRequest?.status === 'rejected' ? t.guideLibrary.accessRequest.requestAgain : t.guideLibrary.accessRequest.requestAccess}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed top-6 right-6 left-6 z-30 pointer-events-none">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-16">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Button
                variant="outline"
                size="lg"
                onClick={onNavigateBack}
                className="pointer-events-auto bg-background/90 hover:bg-background transition-colors gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} weight="bold" />
                {t.common.back}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 pt-28 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <header className="mb-6">
          <div className="flex flex-col gap-4">
            {renderTeamTabs()}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
              <div className="min-w-0 flex items-center gap-2.5">
                <LibraryIcon size={26} weight="duotone" className="text-primary shrink-0" />
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  {t.guideLibrary.title}
                </h1>
                {kind === 'knowledge' ? <NisseSpot spot="knowledge" pose="stand" /> : <NisseSpot spot="guides" pose="stand" className="order-last" />}
                <span className="text-sm text-muted-foreground">
                  {guides?.length || 0} {(guides?.length || 0) === 1 ? t.guideLibrary.guideSingular : t.guideLibrary.guidePlural}
                </span>
              </div>
            <div className="flex gap-2 flex-shrink-0 items-center">
                <Button
                  variant={workflowView === 'workflow' ? 'default' : 'outline'}
                  onClick={() => setWorkflowView((current) => current === 'published' ? 'workflow' : 'published')}
                  className="gap-2"
                >
                  <ClipboardText size={20} weight="duotone" />
                  <span className="hidden sm:inline">{workflowView === 'workflow' ? lt(language === 'da' ? 'Udgivne guides' : language === 'fi' ? 'Julkaistut oppaat' : language === 'sv' ? 'Publicerade guider' : 'Published guides') : (language === 'da' ? 'Review og kladder' : language === 'fi' ? 'Tarkistukset ja luonnokset' : language === 'sv' ? 'Granskningar och utkast' : 'Reviews and drafts')}</span>
                  {(isGuideReviewer ? pendingReviewCount : myOpenReviewCount) > 0 && <Badge variant="secondary">{isGuideReviewer ? pendingReviewCount : myOpenReviewCount}</Badge>}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setImportChoiceOpen(true)}
                  disabled={isImporting}
                >
                  <FileArrowUp size={20} weight="bold" className="sm:mr-2" />
                  <span className="hidden sm:inline">{isImporting ? t.guideLibrary.importing : kind === 'knowledge' ? t.guideLibrary.importDocument : t.guideLibrary.importWordGuide}</span>
                </Button>
              <Dialog open={importChoiceOpen} onOpenChange={setImportChoiceOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{kind === 'knowledge' ? t.guideLibrary.importDocumentTitle : t.guideLibrary.importModeTitle}</DialogTitle>
                    <DialogDescription>{t.guideLibrary.importModeDescription}</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2">
                    <Button variant="outline" className="h-auto py-3 justify-start text-left" onClick={() => { setImportMode('sections'); setImportChoiceOpen(false); importInputRef.current?.click() }}>
                      {t.guideLibrary.importEditable}
                    </Button>
                    <Button variant="outline" className="h-auto py-3 justify-start text-left" onClick={() => { setImportMode('original'); setImportChoiceOpen(false); importInputRef.current?.click() }}>
                      {t.guideLibrary.importOriginal}
                    </Button>
                    {kind === 'knowledge' && (
                      <Button variant="outline" className="h-auto py-3 justify-start text-left" onClick={() => { setImportMode('pdf'); setImportChoiceOpen(false); importInputRef.current?.click() }}>
                        {t.guideLibrary.importPdf}
                      </Button>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <input
                ref={importInputRef}
                type="file"
                accept={importMode === 'pdf' ? '.pdf,application/pdf' : '.docx'}
                className="hidden"
                onChange={(e) => {
                  handleImportFileSelected(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
                <Button onClick={handleAddNew}>
                  <Plus size={20} weight="bold" className="sm:mr-2" />
                  <span className="hidden sm:inline">{t.guideLibrary.newGuide}</span>
                </Button>
            </div>
            </div>
          </div>

          {workflowView === 'published' && <>
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="relative flex-1">
              <MagnifyingGlass
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.guideLibrary.searchPlaceholder}
                className="pl-12 h-12 text-base"
              />
            </div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant={showNeedsReview ? 'default' : 'outline'}
                onClick={() => setShowNeedsReview((v) => !v)}
                className={cn(
                  'h-12 px-5 font-semibold gap-2',
                  showNeedsReview
                    ? 'bg-blocked text-white hover:bg-blocked/90'
                    : 'hover:border-blocked/50'
                )}
              >
                <Timer size={20} weight="bold" />
                {t.guideLibrary.needsReview}
                {needsReviewCount > 0 && (
                  <span className={cn(
                    'px-2 py-0.5 rounded-lg text-xs font-bold',
                    showNeedsReview ? 'bg-white/20 text-white' : 'bg-destructive/10 text-destructive'
                  )}>
                    {needsReviewCount}
                  </span>
                )}
              </Button>
            </motion.div>
          </div>

          <Separator className="my-8" />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3 flex-1">
              {allCategories.map((category) => (
                <motion.div 
                  key={category}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant={activeCategory === category ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveCategory(category)}
                    className={cn(
                      'font-semibold px-4 h-10',
                      activeCategory === category 
                        ? '' 
                        : 'hover:bg-muted hover:border-primary/40'
                    )}
                  >
                    {category}
                    {category !== 'All' && (
                      <span className={cn(
                        "ml-2 px-2 py-0.5 rounded-lg text-xs font-bold",
                        activeCategory === category 
                          ? "bg-primary-foreground/20 text-primary-foreground" 
                          : "bg-primary/10 text-primary"
                      )}>
                        {myGuides.filter((g) => g.category === category).length}
                      </span>
                    )}
                  </Button>
                </motion.div>
              ))}
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCategoryManagerOpen(true)}
                className="h-10 px-4 font-semibold"
              >
                <Gear size={18} weight="bold" className="sm:mr-2" />
                <span className="hidden sm:inline">{t.guideLibrary.manageCategories}</span>
                <span className="sm:hidden">{t.guideLibrary.categoriesShort}</span>
              </Button>
            </motion.div>
            {isExportAvailable() && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportDialogOpen(true)}
                  className="h-10 px-4 font-semibold"
                >
                  <FolderOpen size={18} weight="bold" className="sm:mr-2" />
                  <span className="hidden sm:inline">{t.guideLibrary.exportLibrary}</span>
                  <span className="sm:hidden">{t.guideLibrary.exportShort}</span>
                </Button>
              </motion.div>
            )}
          </div>
          </>}
        </header>

        {workflowView !== 'workflow' && shownDrafts.length > 0 && (
          <div className="mb-6 rounded-md border border-dashed border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileDashed size={20} weight="bold" className="text-primary" />
              <h3 className="font-bold">{t.guideEditor.draftsTitle}</h3>
              <Badge variant="secondary">{shownDrafts.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{t.guideEditor.draftsBody}</p>
            <div className="space-y-2">
              {shownDrafts.map((draft) => (
                <div key={draft.guideId} className="flex items-center gap-3 rounded-md border bg-card p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{draftLabel(draft) || t.guideEditor.draftUntitled}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(draft.lastAutoSavedAt).toLocaleString(language === 'en' ? 'en-US' : language === 'fi' ? 'fi-FI' : language === 'sv' ? 'sv-SE' : 'da-DK')}
                      {myGuides.some((guide) => guide.id === draft.guideId) && ` · ${t.guideEditor.draftOfPublished}`}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleResumeDraft(draft)} className="shrink-0">{t.guideEditor.draftResume}</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteDraft(draft)} className="shrink-0 text-destructive hover:text-destructive" aria-label={t.guideEditor.draftDiscard}>
                    <Trash size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {workflowView === 'workflow' ? (
          <GuideReviewDashboard
            key={isGuideReviewer ? 'reviewer-workflow' : 'user-workflow'}
            requests={reviewRequests || []}
            archivedGuides={archivedGuides || []}
            userEmail={userEmail}
            isReviewer={isGuideReviewer}
            isManager={isManager}
            onEditRequest={(request, asReviewer) => void runReviewAction(`edit:${request.id}`, () => handleEditReviewRequest(request, asReviewer))}
            onPreview={handleViewGuide}
            onApprove={(request) => void runReviewAction(`approve:${request.id}`, () => handleApproveReview(request))}
            onReturn={(request, comment) => void runReviewAction(`return:${request.id}`, () => handleReturnReview(request, comment))}
            onWithdraw={(request) => void runReviewAction(`withdraw:${request.id}`, () => handleWithdrawReview(request))}
            onDiscard={(request) => void runReviewAction(`discard:${request.id}`, () => handleDiscardReview(request))}
            onClaim={(request) => void runReviewAction(`claim:${request.id}`, () => handleClaimReview(request))}
            onRestore={(entry) => void runReviewAction(`restore:${entry.id}`, () => handleRestoreArchived(entry))}
            busyKey={reviewBusyKey}
          />
        ) : filteredGuides.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 px-4"
          >
            <div className="mb-6 h-20 w-20 rounded-md bg-secondary flex items-center justify-center">
              <LibraryIcon size={44} weight="duotone" className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-3 text-center">
              {showNeedsReview ? t.guideLibrary.emptyState.allUpToDate : searchQuery || activeCategory !== 'All' ? t.guideLibrary.emptyState.noneFoundFiltered : t.guideLibrary.emptyState.noneYet}
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-8 leading-relaxed">
              {showNeedsReview
                ? t.guideLibrary.emptyState.allUpToDateDescription
                : searchQuery || activeCategory !== 'All'
                ? t.guideLibrary.emptyState.tryAdjustFilters
                : t.guideLibrary.emptyState.getStarted}
            </p>
            {!searchQuery && activeCategory === 'All' && !showNeedsReview && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button onClick={handleAddNew} size="lg">
                  <Plus size={24} weight="bold" className="mr-2" />
                  {t.guideLibrary.emptyState.createFirst}
                </Button>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredGuides.map((guide) => (
                <GuideCard
                  key={guide.id}
                  guide={guide}
                  authorName={(guide.author && usersByEmail?.[guide.author]?.fullName) || guide.author?.split('@')[0] || ''}
                  responsibleName={(guide.responsibleEmail && usersByEmail?.[guide.responsibleEmail]?.fullName) || guide.responsibleEmail?.split('@')[0] || ''}
                  currentTeamCode={currentTeamCode}
                  onEdit={handleEditGuide}
                  onDelete={(id) => void runReviewAction(`delete:${id}`, () => handleDeleteGuide(id))}
                  onView={handleViewGuide}
                  onMarkReviewed={handleMarkReviewed}
                  deleteRequiresReview
                  matchSnippet={matchInfoById.get(guide.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <GuideEditor
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setEditGuide(undefined)
            setImportDraft(null)
            setResumeDraft(null)
            setEditingReviewRequest(null)
            setEditingAsReviewer(false)
          }
        }}
        onSave={handleSaveGuide}
        onDraftChange={(guideId, draft) => { void changeDraftInBackground(guideId, draft) }}
        editGuide={editGuide}
        categories={categories || defaultCategories}
        onCreateCategory={handleCreateCategory}
        importDraft={importDraft}
        resumeDraft={resumeDraft}
        userEmail={userEmail}
        users={teamUsers}
        linkTargets={linkTargets.filter(target => !target.archived)}
        linkCatalog={linkTargets}
        preserveVersion={Boolean(editingReviewRequest)}
        titleOverride={editingReviewRequest
          ? lt(editingAsReviewer
              ? (language === 'da' ? 'Rediger guide som reviewer' : language === 'fi' ? 'Muokkaa opasta tarkistajana' : language === 'sv' ? 'Redigera guide som granskare' : 'Edit guide as reviewer')
              : (language === 'da' ? 'Ret guide og indsend igen' : language === 'fi' ? 'Muokkaa opasta ja lähetä uudelleen' : language === 'sv' ? 'Redigera och skicka in guiden igen' : 'Edit and resubmit guide'))
          : undefined}
        descriptionOverride={lt(editingReviewRequest
          ? (language === 'da' ? 'Rettelserne gemmes i review-forslaget. Den udgivne guide ændres først ved godkendelse.' : language === 'fi' ? 'Muutokset tallennetaan tarkistusehdotukseen. Julkaistu opas muuttuu vasta hyväksynnän jälkeen.' : language === 'sv' ? 'Ändringarna sparas i granskningsförslaget. Den publicerade guiden ändras först efter godkännande.' : 'Changes are saved to the review proposal. The published guide changes only after approval.')
          : (language === 'da' ? 'Guiden bliver sendt til review og udgives først efter godkendelse.' : language === 'fi' ? 'Opas lähetetään tarkistettavaksi ja julkaistaan vasta hyväksynnän jälkeen.' : language === 'sv' ? 'Guiden skickas till granskning och publiceras först efter godkännande.' : 'The guide will be submitted for review and published only after approval.'))}
        submitLabel={editingReviewRequest
          ? (editingAsReviewer ? (language === 'da' ? 'Gem reviewerrettelser' : language === 'fi' ? 'Tallenna tarkistajan muutokset' : language === 'sv' ? 'Spara granskarens ändringar' : 'Save reviewer changes') : (language === 'da' ? 'Indsend igen' : language === 'fi' ? 'Lähetä uudelleen' : language === 'sv' ? 'Skicka in igen' : 'Resubmit'))
          : (language === 'da' ? 'Send til review' : language === 'fi' ? 'Lähetä tarkistettavaksi' : language === 'sv' ? 'Skicka till granskning' : 'Submit for review')}
      />

      <GuideViewer
        guide={viewGuide}
        linkTargets={linkTargets}
        fileLoader={selectedTeamId ? linkTargets.find(entry => entry.guide.id === viewGuide?.id
          && entry.teamCode === teams.find(team => team.teamId === selectedTeamId)?.folderName)?.fileLoader
          : viewGuide && isSharedGuide(viewGuide) ? sharedFileLoader(viewGuide) : undefined}
        open={viewerOpen}
        onOpenChange={(open) => {
          setViewerOpen(open)
          if (!open) setViewGuide(null)
        }}
        onEdit={viewGuide && myGuides.some(g => g.id === viewGuide.id) ? handleEditGuide : undefined}
      />

      <CategoryManager
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        categories={categories || defaultCategories}
        onUpdateCategories={handleUpdateCategories}
        guides={myGuides}
      />

      <Dialog open={exportDialogOpen} onOpenChange={(open) => { if (!isExportingAll) setExportDialogOpen(open) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen size={22} weight="duotone" />
              {t.guideLibrary.exportDialog.title}
            </DialogTitle>
            <DialogDescription>
              {t.guideLibrary.exportDialog.description}
              <span className="block font-mono text-xs mt-1">&lt;mappe&gt;\&lt;kategori&gt;\&lt;titel&gt; vX.XX.docx</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold">{t.guideLibrary.exportDialog.folderLabel}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border bg-muted/40 text-sm truncate" title={exportRoot || undefined}>
                  {exportRoot || t.guideLibrary.exportDialog.noFolderSelected}
                </div>
                <Button variant="outline" size="sm" onClick={handleChooseExportRoot} disabled={isExportingAll} className="shrink-0">
                  {t.guideLibrary.exportDialog.chooseFolder}
                </Button>
              </div>
            </div>
            {exportProgress && (
              <div className="text-sm text-muted-foreground animate-pulse">{exportProgress}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} disabled={isExportingAll}>
              {t.common.close}
            </Button>
            <Button onClick={handleExportAll} disabled={!exportRoot || isExportingAll} className="gap-2">
              <FolderOpen size={16} weight="bold" />
              {isExportingAll ? t.guideLibrary.exportDialog.exporting : t.guideLibrary.exportDialog.exportAll}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
