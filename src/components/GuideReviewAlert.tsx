import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Warning, Books } from '@phosphor-icons/react'
import { useKV } from '@/hooks/useKV'
import {
  getReviewStatus, REVIEW_NOTICE_WINDOW_MS, wasNotifiedToday, markNotifiedToday,
  type GuideReviewNoticeLog,
} from '@/lib/guideTypes'
import type { Guide } from '@/lib/guideTypes'

interface GuideReviewAlertProps {
  onOpenGuideLibrary: () => void
  // Sendes ned fra Hub (som allerede læser 'guides') i stedet for egen KV-læsning her —
  // undgår en ekstra uafhængig lytter for samme nøgle på den mest besøgte skærm.
  guides: Guide[] | undefined
  userEmail: string
}

// Vises i main Hub i to trin: (1) 10 dage før fristen får KUN den ansvarlige (eller
// forfatteren, hvis ingen ansvarlig er sat — bagudkompatibelt med ældre guides) en
// påmindelse, (2) fra selve fristen og til guiden opdateres, får ALLE brugere en
// påmindelse. Begge dele er dismissable og dukker højst op én gang pr. kalenderdag
// pr. bruger (sporet i KV 'guide-review-notice-log'), ikke bare pr. session.
export function GuideReviewAlert({ onOpenGuideLibrary, guides, userEmail }: GuideReviewAlertProps) {
  const [noticeLog, setNoticeLog] = useKV<GuideReviewNoticeLog>('guide-review-notice-log', {})
  const [dismissed, setDismissed] = useState(false)

  const upcomingGuides = useMemo(() => {
    const now = Date.now()
    return (guides || []).filter((g) => {
      if ((g.responsibleEmail || g.author) !== userEmail || !g.nextReviewAt) return false
      if (now >= g.nextReviewAt || now < g.nextReviewAt - REVIEW_NOTICE_WINDOW_MS) return false
      return !wasNotifiedToday(noticeLog, userEmail, g.id, now)
    })
  }, [guides, userEmail, noticeLog])

  const overdueGuides = useMemo(
    () => (guides || []).filter((g) =>
      getReviewStatus(g) === 'overdue' && !wasNotifiedToday(noticeLog, userEmail, g.id)
    ),
    [guides, userEmail, noticeLog]
  )

  const handleClose = () => {
    setDismissed(true)
    const shownIds = [...upcomingGuides, ...overdueGuides].map((g) => g.id)
    if (shownIds.length > 0) setNoticeLog((prev) => markNotifiedToday(prev, userEmail, shownIds))
  }

  if ((upcomingGuides.length === 0 && overdueGuides.length === 0) || dismissed) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Warning size={22} weight="fill" />
            Gennemgang af guides
          </DialogTitle>
          <DialogDescription>
            {overdueGuides.length > 0 && upcomingGuides.length > 0
              ? 'Nogle guides skal snart opdateres, andre er allerede overskredet.'
              : overdueGuides.length > 0
                ? `${overdueGuides.length === 1 ? 'En guide' : `${overdueGuides.length} guides`} i Guide Biblioteket ${overdueGuides.length === 1 ? 'har' : 'har'} overskredet gennemgangsfristen og bør opdateres snarest.`
                : 'Du har guides som forfatter, der snart skal gennemgås.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-72 overflow-y-auto">
          {upcomingGuides.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                Du skal snart opdatere disse guides
              </div>
              <div className="space-y-2">
                {upcomingGuides.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 bg-yellow-500/5">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{g.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{g.category}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {overdueGuides.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">
                Disse guides er overskredet
              </div>
              <div className="space-y-2">
                {overdueGuides.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 bg-destructive/5">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{g.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{g.category}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Luk for nu
          </Button>
          <Button onClick={() => { handleClose(); onOpenGuideLibrary() }} className="gap-2">
            <Books size={18} />
            Gå til Guide Bibliotek
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
