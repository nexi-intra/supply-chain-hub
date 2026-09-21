import { useState, useMemo, useEffect, useRef, useSyncExternalStore } from 'react'
import { useKV } from '@/hooks/useKV'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Plus, MagnifyingGlass, Books, Gear, ArrowLeft, Timer, FolderOpen, FileArrowUp, Buildings, LockKey, Clock, CheckCircle, XCircle, Eye, ClipboardText, FileDashed, Trash } from '@phosphor-icons/react'
import { Guide, GuideAccessRequest } from '@/lib/types'
import { guidePlainText, getReviewStatus, computeNextReviewAt, type ArchivedGuideEntry, type GuideDraft, type GuideReviewRequest } from '@/lib/guideTypes'
import { GuideSearchIndex } from '@/lib/searchIndex'
import { bumpVersion, saveVersionSnapshot, listDrafts, deleteDraft, draftLabel } from '@/lib/guideStore'
import { guideToDocModel, resolveAuthorName } from '@/lib/docModel'
import { isExportAvailable, getExportRoot, chooseAndSaveExportRoot, exportGuideToLibrary } from '@/lib/guideExporter'
import { guideImportManager } from '@/lib/guideImportManager'
import type { GuideImportDraft } from '@/lib/docxImporter'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GuideCard } from '@/components/GuideCard'
import { GuideEditor } from '@/components/GuideEditor'
import { GuideViewer } from '@/components/GuideViewer'
import { GuideReviewDashboard } from '@/components/GuideReviewDashboard'
import { CategoryManager } from '@/components/CategoryManager'
import { UserProfile } from '@/components/UserProfile'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, newId } from '@/lib/utils'
import { isAnyModalOpen } from '@/lib/modalStack'
import { consumeNavigationParams } from '@/lib/appNavigation'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/LanguageContext'
import type { RegisteredTeam } from '@/lib/electronRegistryBridge'
import { getUserRole, type UserRole } from '@/lib/userRoles'
import { canReviewGuideRequest, hasGuideReviewConflict, isGuideReviewAlreadyApplied, isOpenGuideReview } from '@/lib/guideReview'
import { removeFromKvArray, upsertInKvArray } from '@/lib/kvArrays'

const defaultCategories: string[] = ['Procedures', 'Technical', 'HR', 'Safety', 'General']

interface GuideLibraryProps {
  onNavigateBack: () => void
  onLogout: () => void
  userEmail: string
}

export function GuideLibrary({ onNavigateBack, onLogout, userEmail }: GuideLibraryProps) {
  const { t, language } = useLanguage()
  const [guides, setGuides] = useKV<Guide[]>('guides', [])
  // Tvaergaaende delte guides (Fase 3, plans/guide-library-cross-team-links-format.md) — samme
  // platform-delte KV-mekanisme som madplanen (Fase 9.1, se SHARED_KV_KEYS i main.cjs). Alle
  // deltagende teams laeser/skriver samme fil, saa en redigering fra ETHVERT team slaar
  // automatisk igennem for alle andre — ingen saerskilt synk-logik noedvendig.
  const [sharedGuides, setSharedGuides] = useKV<Guide[]>('shared-guides', [])
  const [categories, setCategories] = useKV<string[]>('categories', defaultCategories)
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
  const [reviewRequests] = useKV<GuideReviewRequest[]>('guide-review-requests', [], { initializeIfMissing: false })
  const [archivedGuides] = useKV<ArchivedGuideEntry[]>('archived-guides', [], { initializeIfMissing: false })
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
  const [initialNavigation] = useState(() => consumeNavigationParams())
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
  const [otherTeamRequests, setOtherTeamRequests] = useState<GuideAccessRequest[]>([])
  const [isLoadingOtherTeamGuides, setIsLoadingOtherTeamGuides] = useState(false)
  const [submittingRequestGuideId, setSubmittingRequestGuideId] = useState<string | null>(null)

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

  const myGuides = useMemo(() => {
    const local = (guides || []).filter((g) => !isSharedGuide(g))
    const shared = (sharedGuides || []).filter((g) => currentTeamCode && g.sharedWithTeamCodes?.includes(currentTeamCode))
    return [...local, ...shared]
  }, [guides, sharedGuides, currentTeamCode])

  // Genindlaeses hver gang editoren lukkes, saa listen afspejler en netop gemt
  // eller forkastet kladde uden at brugeren skal skifte visning.
  useEffect(() => {
    if (dialogOpen) return
    let cancelled = false
    listDrafts(userEmail).then((found) => { if (!cancelled) setDrafts(found) }).catch(() => {})
    return () => { cancelled = true }
  }, [dialogOpen, userEmail])

  const loadOtherTeamGuides = () => {
    if (!selectedTeamId) return
    const team = teams.find(tm => tm.teamId === selectedTeamId)
    if (!team || !window.electronRegistry) return
    setIsLoadingOtherTeamGuides(true)
    Promise.all([
      window.electronRegistry.readTeamKey<Guide[]>(team.folderName, 'guides'),
      window.electronRegistry.readTeamKey<GuideAccessRequest[]>(team.folderName, 'guide-access-requests'),
    ]).then(([guidesData, requestsData]) => {
      setOtherTeamGuides(guidesData || [])
      setOtherTeamRequests(requestsData || [])
    }).catch((error) => {
      // Uden dette blev spinneren staaende for evigt hvis drevet svigtede.
      console.error('Kunne ikke hente det andet teams guides:', error)
      setOtherTeamGuides([])
      setOtherTeamRequests([])
      toast.error(t.guideLibrary.loadOtherTeamFailed)
    }).finally(() => setIsLoadingOtherTeamGuides(false))
  }

  useEffect(loadOtherTeamGuides, [selectedTeamId, teams])

  // Anmodningen gemmes i den EJENDE teams egen store (registry:submit-guide-access-request),
  // så deres manager ser den som en helt normal del af deres eget team.
  const handleRequestAccess = async (guide: Guide) => {
    const team = teams.find(tm => tm.teamId === selectedTeamId)
    if (!team || !window.electronRegistry) return
    setSubmittingRequestGuideId(guide.id)
    try {
      const currentTeam = await window.electronRegistry.getCurrentTeam()
      const request: GuideAccessRequest = {
        id: newId('guide-access'),
        guideId: guide.id,
        guideTitle: guide.title,
        requestingTeamCode: currentTeam?.folderName || '',
        requestingUserEmail: userEmail,
        requestingUserName: usersByEmail?.[userEmail]?.fullName || userEmail,
        status: 'pending',
        requestedAt: new Date().toISOString(),
      }
      await window.electronRegistry.submitGuideAccessRequest(team.folderName, request)
      toast.success(t.guideLibrary.accessRequest.submitted)
      loadOtherTeamGuides()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.guideLibrary.accessRequest.submitFailed)
    } finally {
      setSubmittingRequestGuideId(null)
    }
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
      getExportRoot().then(setExportRootState).catch(() => setExportRootState(null))
    }
  }, [exportDialogOpen])

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
    await upsertInKvArray('guide-review-requests', [updated])
  }

  const publishGuide = async (guide: Guide) => {
    const wasShared = (sharedGuides || []).some((item) => item.id === guide.id)
    const wasLocal = (guides || []).some((item) => item.id === guide.id)

    if (isSharedGuide(guide)) {
      await upsertInKvArray('shared-guides', [guide])
      if (wasLocal) await removeFromKvArray('guides', [guide.id])
    } else {
      await upsertInKvArray('guides', [guide])
      if (wasShared) await removeFromKvArray('shared-guides', [guide.id])
    }
  }

  const closeGuideEditor = () => {
    setDialogOpen(false)
    setEditGuide(undefined)
    setEditingReviewRequest(null)
    setEditingAsReviewer(false)
    setImportDraft(null)
  }

  const handleSaveGuide = async (guide: Guide, changeNote?: string) => {
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
          window.kv.get<Guide[]>('guides'),
          window.kv.get<Guide[]>('shared-guides'),
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
      await updateReviewRequest(updated)
      toast.success(editingAsReviewer
        ? (language === 'da' ? 'Reviewerens rettelser er gemt i forslaget' : language === 'fi' ? 'Tarkistajan muutokset tallennettiin ehdotukseen' : 'Reviewer changes saved to the proposal')
        : (language === 'da' ? 'Guiden er sendt til review igen' : language === 'fi' ? 'Opas lähetettiin uudelleen tarkistettavaksi' : 'Guide resubmitted for review'))
      closeGuideEditor()
      return
    }

    const [latestLocalGuides, latestSharedGuides] = await Promise.all([
      window.kv.get<Guide[]>('guides'),
      window.kv.get<Guide[]>('shared-guides'),
    ])
    const latestPublishedGuides = [...(latestLocalGuides || []), ...(latestSharedGuides || [])]
    const intendedAsUpdate = Boolean(editGuide)
    const published = intendedAsUpdate ? latestPublishedGuides.find((item) => item.id === guide.id) : undefined
    if (intendedAsUpdate && !published) {
      toast.error(language === 'da' ? 'Den udgivne guide findes ikke længere. Genindlæs biblioteket og prøv igen.' : language === 'fi' ? 'Julkaistua opasta ei enää ole. Lataa kirjasto uudelleen ja yritä uudelleen.' : 'The published guide no longer exists. Reload the library and try again.')
      return
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
    await updateReviewRequest(request)
    toast.success(language === 'da' ? 'Guiden er sendt til review' : language === 'fi' ? 'Opas lähetettiin tarkistettavaksi' : 'Guide submitted for review')
    closeGuideEditor()
    setWorkflowView('workflow')
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
      toast.info(language === 'da' ? 'Der findes allerede en åben revision af denne guide' : language === 'fi' ? 'Tälle oppaalle on jo avoin versio' : 'An open revision already exists for this guide')
      setWorkflowView('workflow')
      return
    }
    setEditGuide(guide)
    setDialogOpen(true)
  }

  const handleDeleteGuide = async (id: string) => {
    const guide = myGuides.find((g) => g.id === id)
    if (!guide) return
    const existingRequest = (reviewRequests || []).find((request) => request.guideId === id && isOpenGuideReview(request))
    if (existingRequest) {
      toast.info(language === 'da' ? 'Der findes allerede en åben anmodning for denne guide' : language === 'fi' ? 'Tälle oppaalle on jo avoin pyyntö' : 'An open request already exists for this guide')
      return
    }
    const now = Date.now()
    await updateReviewRequest({
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
    toast.success(language === 'da' ? 'Sletningen er sendt til review' : language === 'fi' ? 'Poistaminen lähetettiin tarkistettavaksi' : 'Deletion submitted for review')
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

  const handleDeleteDraft = async (draft: GuideDraft) => {
    await deleteDraft(draft.guideId)
    setDrafts((current) => current.filter((entry) => entry.guideId !== draft.guideId))
    toast.success(t.guideEditor.draftDeleted)
  }

  const handleEditReviewRequest = async (request: GuideReviewRequest, asReviewer: boolean) => {
    if (!request.proposedGuide) {
      if (!asReviewer && request.action === 'delete') {
        await updateReviewRequest({ ...request, status: 'pending', submittedAt: Date.now(), updatedAt: Date.now(), reviewerComment: undefined })
        toast.success(language === 'da' ? 'Sletningen er sendt til review igen' : language === 'fi' ? 'Poistaminen lähetettiin uudelleen tarkistettavaksi' : 'Deletion resubmitted for review')
      }
      return
    }
    setEditingReviewRequest(request)
    setEditingAsReviewer(asReviewer)
    setEditGuide(request.proposedGuide)
    setDialogOpen(true)
  }

  const handleClaimReview = async (request: GuideReviewRequest) => {
    if (!isGuideReviewer || !canReviewGuideRequest(request, userEmail, isManager) || (request.claimedBy && request.claimedBy !== userEmail && !isManager)) return
    await updateReviewRequest({ ...request, claimedBy: userEmail, claimedAt: Date.now(), updatedAt: Date.now() })
  }

  const handleReturnReview = async (request: GuideReviewRequest, comment: string) => {
    await updateReviewRequest({
      ...request,
      status: 'changes_requested',
      reviewerComment: comment,
      reviewedBy: userEmail,
      reviewedAt: Date.now(),
      claimedBy: undefined,
      claimedAt: undefined,
      updatedAt: Date.now(),
    })
    toast.success(language === 'da' ? 'Guiden er sendt tilbage til forfatteren' : language === 'fi' ? 'Opas palautettiin tekijälle' : 'Guide returned to the author')
  }

  const handleWithdrawReview = async (request: GuideReviewRequest) => {
    if (request.submittedBy.trim().toLowerCase() !== normalizedUserEmail) return
    await updateReviewRequest({ ...request, status: 'draft', claimedBy: undefined, claimedAt: undefined, updatedAt: Date.now() })
    toast.success(language === 'da' ? 'Revisionen er trukket tilbage som kladde' : language === 'fi' ? 'Versio palautettiin luonnokseksi' : 'Revision withdrawn to draft')
  }

  // Fjerner en aaben anmodning helt (den udgivne guide roeres ikke). Sidste
  // udvej mod fastlaaste anmodninger — kladder blokerer ellers nye revisioner.
  const handleDiscardReview = async (request: GuideReviewRequest) => {
    const isOwn = request.submittedBy.trim().toLowerCase() === normalizedUserEmail
    if (!isOwn && !isManager) return
    if (!isOpenGuideReview(request)) return
    await removeFromKvArray('guide-review-requests', [request.id])
    toast.success(language === 'da' ? 'Anmodningen er kasseret' : language === 'fi' ? 'Pyyntö hylättiin' : 'Request discarded')
  }

  const handleApproveReview = async (request: GuideReviewRequest) => {
    if (!isGuideReviewer || !canReviewGuideRequest(request, userEmail, isManager)) return
    const [latestLocalGuides, latestSharedGuides, latestArchived] = await Promise.all([
      window.kv.get<Guide[]>('guides'),
      window.kv.get<Guide[]>('shared-guides'),
      window.kv.get<ArchivedGuideEntry[]>('archived-guides'),
    ])
    const published = [...(latestLocalGuides || []), ...(latestSharedGuides || [])].find((guide) => guide.id === request.guideId)

    // En tidligere godkendelse kan vaere afbrudt EFTER virkningen slog igennem,
    // men FOER requesten blev lukket (fx netvaerksfejl mod det delte drev).
    // Saa er der ingen konflikt — luk blot requesten som godkendt.
    if (isGuideReviewAlreadyApplied(request, published, latestArchived || [])) {
      await closeApprovedReview(request)
      return
    }

    const hasConflict = hasGuideReviewConflict(request, published)
    if (hasConflict) {
      await handleReturnReview(request, language === 'da' ? 'Den udgivne guide er ændret siden indsendelsen. Opret revisionen igen fra den nyeste version.' : language === 'fi' ? 'Julkaistua opasta on muutettu lähetyksen jälkeen. Luo versio uudelleen uusimmasta versiosta.' : 'The published guide changed after submission. Recreate the revision from the latest version.')
      toast.error(language === 'da' ? 'Revisionen kunne ikke godkendes på grund af en versionskonflikt' : language === 'fi' ? 'Versiota ei voitu hyväksyä versiokonfliktin vuoksi' : 'The revision could not be approved because of a version conflict')
      return
    }

    if (request.action === 'delete') {
      if (!published) return
      await upsertInKvArray('archived-guides', [{
        id: `guide-archive-${request.id}`, guide: structuredClone(published), archivedAt: Date.now(),
        archivedBy: userEmail, requestId: request.id,
      }])
      if (isSharedGuide(published)) await removeFromKvArray('shared-guides', [published.id])
      else await removeFromKvArray('guides', [published.id])
    } else if (request.proposedGuide) {
      const approvedGuide = {
        ...request.proposedGuide,
        updatedBy: request.reviewerEditedBy || request.proposedGuide.updatedBy,
        updatedAt: Date.now(),
        lastReviewedAt: Date.now(),
        nextReviewAt: computeNextReviewAt(Date.now(), request.proposedGuide.reviewIntervalMonths),
      }
      await publishGuide(approvedGuide)
      try {
        await saveVersionSnapshot(approvedGuide, userEmail, request.changeNote)
      } catch (historyError) {
        console.error('Guiden blev udgivet, men versionshistorikken kunne ikke opdateres:', historyError)
        toast.warning(language === 'da' ? 'Guiden blev udgivet, men versionshistorikken kunne ikke gemmes' : language === 'fi' ? 'Opas julkaistiin, mutta versiohistoriaa ei voitu tallentaa' : 'Guide published, but version history could not be saved')
      }
      if (request.action === 'restore') {
        const archiveEntry = (archivedGuides || []).find((entry) => entry.guide.id === request.guideId && !entry.restoredAt)
        if (archiveEntry) await upsertInKvArray('archived-guides', [{ ...archiveEntry, restoredAt: Date.now(), restoredBy: userEmail }])
      }
    }

    await closeApprovedReview(request)
  }

  /** Sidste trin af en godkendelse. Fejler lukningen (flaky drev), er nyt tryk paa Godkend sikkert, da godkendelse er idempotent. */
  const closeApprovedReview = async (request: GuideReviewRequest) => {
    try {
      await updateReviewRequest({ ...request, status: 'approved', reviewedBy: userEmail, reviewedAt: Date.now(), updatedAt: Date.now() })
    } catch (error) {
      console.error('Godkendelsen slog igennem, men anmodningen kunne ikke lukkes:', error)
      toast.error(language === 'da' ? 'Guiden er godkendt, men anmodningen kunne ikke markeres som afsluttet. Tryk Godkend igen for at afslutte den.' : language === 'fi' ? 'Opas hyväksyttiin, mutta pyyntöä ei voitu merkitä valmiiksi. Paina Hyväksy uudelleen.' : 'The guide was approved, but the request could not be marked as completed. Press Approve again to finish it.')
      return
    }
    toast.success(request.action === 'delete'
      ? (language === 'da' ? 'Guiden er godkendt til sletning og arkiveret' : language === 'fi' ? 'Oppaan poistaminen hyväksyttiin ja opas arkistoitiin' : 'Guide deletion approved and archived')
      : (language === 'da' ? 'Guiden er godkendt og udgivet' : language === 'fi' ? 'Opas hyväksyttiin ja julkaistiin' : 'Guide approved and published'))
  }

  const handleRestoreArchived = async (entry: ArchivedGuideEntry) => {
    const existing = (reviewRequests || []).find((request) => request.guideId === entry.guide.id && request.action === 'restore' && isOpenGuideReview(request))
    if (existing) {
      toast.info(language === 'da' ? 'Der findes allerede en gendannelsesanmodning' : language === 'fi' ? 'Palautuspyyntö on jo olemassa' : 'A restore request already exists')
      return
    }
    const now = Date.now()
    const restored: Guide = { ...structuredClone(entry.guide), version: bumpVersion(entry.guide.version), updatedBy: userEmail, updatedAt: now }
    await updateReviewRequest({
      id: newId('guide-review'), guideId: restored.id, guideTitle: restored.title,
      action: 'restore', status: 'pending', baseGuide: entry.guide, proposedGuide: restored,
      submittedBy: userEmail, submittedByName: usersByEmail?.[userEmail]?.fullName || userEmail,
      submittedAt: now, updatedAt: now,
      changeNote: language === 'da' ? `Gendannelse af arkiveret version ${entry.guide.version || '1.00'}` : language === 'fi' ? `Arkistoidun version ${entry.guide.version || '1.00'} palautus` : `Restore archived version ${entry.guide.version || '1.00'}`,
    })
    toast.success(language === 'da' ? 'Gendannelsen er sendt til review' : language === 'fi' ? 'Palautus lähetettiin tarkistettavaksi' : 'Restore submitted for review')
  }

  const handleImportFileSelected = (file: File | undefined) => {
    if (!file) return
    // Importen kører i den globale guideImportManager (ikke lokal state), så den
    // fortsætter selvom brugeren navigerer væk fra Guide Biblioteket.
    guideImportManager.startImport(file).catch((error) => {
      toast.error(error instanceof Error ? error.message : t.guideLibrary.toasts.importStartFailed)
    })
  }

  // Henter en færdig import-draft — enten lige nu (import fuldført mens vi var
  // her) eller ved mount (import fuldført mens brugeren var et andet sted i appen).
  useEffect(() => {
    if (isImporting) return
    const draft = guideImportManager.takePendingDraft()
    if (!draft) return
    if (draft.sections.length === 0) {
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

  const handleChooseExportRoot = async () => {
    try {
      const root = await chooseAndSaveExportRoot()
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
    const exportable = myGuides.map(guideToDocModel).filter((m) => m.sections.length > 0)
    if (exportable.length === 0) {
      toast.error(t.guideLibrary.toasts.noExportableGuides)
      return
    }
    setIsExportingAll(true)
    let ok = 0
    let failed = 0
    for (let i = 0; i < exportable.length; i++) {
      const model = exportable[i]
      setExportProgress(`${t.guideLibrary.toasts.exportingProgress} ${i + 1}/${exportable.length}: ${model.title}`)
      try {
        const authorName = await resolveAuthorName(model.authorEmail)
        await exportGuideToLibrary(model, authorName || model.authorEmail, exportRoot)
        ok++
      } catch (error) {
        console.error(`Eksport af "${model.title}" fejlede:`, error)
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
                  className="pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
                >
                  <ArrowLeft size={20} weight="bold" />
                  {t.common.back}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 pt-36 pb-12 sm:pb-20 max-w-5xl relative z-10">
          <header className="mb-10 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-normal tracking-tight bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1 mb-2">
              {otherTeam?.name}
            </h1>
            <p className="text-sm text-muted-foreground">{t.guideLibrary.otherTeamGuidesHint}</p>
          </header>

          {renderTeamTabs()}

          <Card className="p-6 border-2">
            {isLoadingOtherTeamGuides ? (
              <p className="text-center py-12 text-muted-foreground">{t.guideLibrary.loadingGuides}</p>
            ) : otherTeamGuides.length === 0 ? (
              <div className="text-center py-12">
                <Books size={48} className="text-muted-foreground mx-auto mb-4" weight="duotone" />
                <p className="text-muted-foreground">{t.guideLibrary.noGuidesInTeam}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {otherTeamGuides.map((guide) => {
                  const myRequest = getMyRequestForGuide(guide.id)
                  return (
                    <div
                      key={guide.id}
                      className="flex items-center justify-between gap-3 p-4 rounded-xl border-2 bg-card"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Books size={20} className="text-primary flex-shrink-0" weight="duotone" />
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
                            disabled={submittingRequestGuideId === guide.id}
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
                className="pointer-events-auto bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} weight="bold" />
                {t.common.back}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 pt-36 pb-12 sm:pb-20 max-w-7xl relative z-10">
        <header className="mb-10">
          <div className="flex flex-col items-center justify-center gap-6 text-center">
            {renderTeamTabs()}
            <div className="flex flex-col items-center gap-4">
              <motion.div 
                className="h-16 w-16 flex-shrink-0 rounded-3xl bg-gradient-to-br from-primary to-accent shadow-2xl shadow-primary/30 flex items-center justify-center relative overflow-hidden"
                whileHover={{ scale: 1.08, rotate: 5 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-transparent to-accent/40 animate-pulse" />
                <Books size={32} weight="duotone" className="text-primary-foreground relative z-10" />
              </motion.div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
                  {t.guideLibrary.title}
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-2 flex items-center justify-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-primary/15 to-accent/15 text-primary font-semibold border border-primary/20 text-xs sm:text-sm">
                    {guides?.length || 0}
                  </span>
                  <span className="text-xs sm:text-sm">{(guides?.length || 0) === 1 ? t.guideLibrary.guideSingular : t.guideLibrary.guidePlural} {t.guideLibrary.available}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0 items-center">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant={workflowView === 'workflow' ? 'default' : 'outline'}
                  onClick={() => setWorkflowView((current) => current === 'published' ? 'workflow' : 'published')}
                  className="h-11 px-4 font-semibold border-2 rounded-xl gap-2"
                >
                  <ClipboardText size={20} weight="duotone" />
                  <span className="hidden sm:inline">{workflowView === 'workflow' ? (language === 'da' ? 'Udgivne guides' : language === 'fi' ? 'Julkaistut oppaat' : 'Published guides') : (language === 'da' ? 'Review og kladder' : language === 'fi' ? 'Tarkistukset ja luonnokset' : 'Reviews and drafts')}</span>
                  {(isGuideReviewer ? pendingReviewCount : myOpenReviewCount) > 0 && <Badge variant="secondary">{isGuideReviewer ? pendingReviewCount : myOpenReviewCount}</Badge>}
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  onClick={() => importInputRef.current?.click()}
                  disabled={isImporting}
                  className="h-11 px-5 font-semibold border-2 rounded-xl backdrop-blur-md bg-card/80 hover:bg-muted hover:border-primary/40"
                >
                  <FileArrowUp size={20} weight="bold" className="sm:mr-2" />
                  <span className="hidden sm:inline">{isImporting ? t.guideLibrary.importing : t.guideLibrary.importWordGuide}</span>
                </Button>
              </motion.div>
              <input
                ref={importInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => {
                  handleImportFileSelected(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button onClick={handleAddNew} className="h-11 px-5 bg-gradient-to-r from-primary via-accent to-primary hover:from-primary/90 hover:via-accent/90 hover:to-primary/90 shadow-xl shadow-primary/30 font-semibold transition-all">
                  <Plus size={20} weight="bold" className="sm:mr-2" />
                  <span className="hidden sm:inline">{t.guideLibrary.newGuide}</span>
                </Button>
              </motion.div>
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
                className="pl-12 h-14 text-base bg-card/80 backdrop-blur-md border-2 border-border/60 focus:border-primary/60 focus:ring-4 focus:ring-primary/10 rounded-2xl shadow-lg shadow-black/5 transition-all"
              />
            </div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant={showNeedsReview ? 'default' : 'outline'}
                onClick={() => setShowNeedsReview((v) => !v)}
                className={cn(
                  'h-14 px-5 rounded-2xl border-2 font-semibold gap-2 transition-all backdrop-blur-md',
                  showNeedsReview
                    ? 'bg-gradient-to-r from-destructive to-orange-500 border-destructive shadow-xl shadow-destructive/30 text-white hover:opacity-90'
                    : 'bg-card/80 hover:border-destructive/50'
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
                      'transition-all backdrop-blur-md font-semibold border-2 rounded-xl px-4 h-10',
                      activeCategory === category 
                        ? 'shadow-xl shadow-primary/30 bg-gradient-to-r from-primary via-accent to-primary border-primary' 
                        : 'hover:bg-muted hover:border-primary/40 border-border'
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
                className="h-10 px-4 font-semibold border-2 rounded-xl backdrop-blur-md hover:bg-muted hover:border-primary/40"
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
                  className="h-10 px-4 font-semibold border-2 rounded-xl backdrop-blur-md hover:bg-muted hover:border-primary/40"
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

        {workflowView !== 'workflow' && drafts.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileDashed size={20} weight="bold" className="text-primary" />
              <h3 className="font-bold">{t.guideEditor.draftsTitle}</h3>
              <Badge variant="secondary">{drafts.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{t.guideEditor.draftsBody}</p>
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div key={draft.guideId} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{draftLabel(draft) || t.guideEditor.draftUntitled}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(draft.lastAutoSavedAt).toLocaleString(language === 'en' ? 'en-US' : language === 'fi' ? 'fi-FI' : 'da-DK')}
                      {myGuides.some((guide) => guide.id === draft.guideId) && ` · ${t.guideEditor.draftOfPublished}`}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleResumeDraft(draft)} className="shrink-0">{t.guideEditor.draftResume}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleDeleteDraft(draft)} className="shrink-0 text-destructive hover:text-destructive" aria-label={t.guideEditor.draftDiscard}>
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
            onEditRequest={handleEditReviewRequest}
            onPreview={handleViewGuide}
            onApprove={handleApproveReview}
            onReturn={handleReturnReview}
            onWithdraw={handleWithdrawReview}
            onDiscard={handleDiscardReview}
            onClaim={handleClaimReview}
            onRestore={handleRestoreArchived}
          />
        ) : filteredGuides.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 px-4"
          >
            <motion.div 
              className="relative mb-8"
              animate={{ 
                y: [0, -12, 0],
              }}
              transition={{ 
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <div className="h-32 w-32 rounded-[2rem] bg-gradient-to-br from-primary to-accent shadow-2xl shadow-primary/40 flex items-center justify-center relative overflow-hidden">
                {/* Ren opacity-puls uden blur — blur+animation kræver dyr GPU-re-rasterisering hvert frame */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-accent/40 animate-pulse" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,white,transparent)] opacity-20" />
                <Books size={64} weight="duotone" className="text-primary-foreground relative z-10 drop-shadow-lg" />
              </div>
            </motion.div>
            <h2 className="text-4xl font-bold leading-normal bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent pb-1 mb-4 text-center">
              {showNeedsReview ? t.guideLibrary.emptyState.allUpToDate : searchQuery || activeCategory !== 'All' ? t.guideLibrary.emptyState.noneFoundFiltered : t.guideLibrary.emptyState.noneYet}
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-8 text-lg leading-relaxed">
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
                <Button onClick={handleAddNew} size="lg" className="h-14 px-8 text-base bg-gradient-to-r from-primary via-accent to-primary hover:from-primary/90 hover:via-accent/90 hover:to-primary/90 shadow-2xl shadow-primary/40 font-semibold rounded-2xl">
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
                  onDelete={handleDeleteGuide}
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
        editGuide={editGuide}
        categories={categories || defaultCategories}
        onCreateCategory={handleCreateCategory}
        importDraft={importDraft}
        resumeDraft={resumeDraft}
        userEmail={userEmail}
        users={teamUsers}
        preserveVersion={Boolean(editingReviewRequest)}
        titleOverride={editingReviewRequest
          ? (editingAsReviewer
              ? (language === 'da' ? 'Rediger guide som reviewer' : language === 'fi' ? 'Muokkaa opasta tarkistajana' : 'Edit guide as reviewer')
              : (language === 'da' ? 'Ret guide og indsend igen' : language === 'fi' ? 'Muokkaa opasta ja lähetä uudelleen' : 'Edit and resubmit guide'))
          : undefined}
        descriptionOverride={editingReviewRequest
          ? (language === 'da' ? 'Rettelserne gemmes i review-forslaget. Den udgivne guide ændres først ved godkendelse.' : language === 'fi' ? 'Muutokset tallennetaan tarkistusehdotukseen. Julkaistu opas muuttuu vasta hyväksynnän jälkeen.' : 'Changes are saved to the review proposal. The published guide changes only after approval.')
          : (language === 'da' ? 'Guiden bliver sendt til review og udgives først efter godkendelse.' : language === 'fi' ? 'Opas lähetetään tarkistettavaksi ja julkaistaan vasta hyväksynnän jälkeen.' : 'The guide will be submitted for review and published only after approval.')}
        submitLabel={editingReviewRequest
          ? (editingAsReviewer ? (language === 'da' ? 'Gem reviewerrettelser' : language === 'fi' ? 'Tallenna tarkistajan muutokset' : 'Save reviewer changes') : (language === 'da' ? 'Indsend igen' : language === 'fi' ? 'Lähetä uudelleen' : 'Resubmit'))
          : (language === 'da' ? 'Send til review' : language === 'fi' ? 'Lähetä tarkistettavaksi' : 'Submit for review')}
      />

      <GuideViewer
        guide={viewGuide}
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
