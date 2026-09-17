import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PencilSimple, Trash, Eye, FileDoc, Timer, CheckCircle, User, Buildings } from '@phosphor-icons/react'
import { Guide } from '@/lib/types'
import { getReviewStatus } from '@/lib/guideTypes'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

interface GuideCardProps {
  guide: Guide
  /** Forfatterens visningsnavn, allerede slået op af GuideLibrary (undgår ét KV-kald pr. kort). */
  authorName?: string
  /** Eget teams kode (folderName) — bruges til at udelade eget team fra "delt med"-badgen. */
  currentTeamCode?: string
  onEdit: (guide: Guide) => void
  onDelete: (id: string) => void
  onView: (guide: Guide) => void
  onMarkReviewed?: (guide: Guide) => void
  deleteRequiresReview?: boolean
  /** Bedste søgematch — vises på kortet under søgning. */
  matchSnippet?: { reference: string; text: string; relevance: number }
}

const categoryColors: Record<string, string> = {
  Procedures: 'bg-gradient-to-br from-primary/25 to-primary/15 text-primary border-primary/50 shadow-lg shadow-primary/15',
  Technical: 'bg-gradient-to-br from-[var(--chart-3)]/25 to-[var(--chart-3)]/15 text-[var(--chart-3)] border-[var(--chart-3)]/50 shadow-lg shadow-[var(--chart-3)]/15',
  HR: 'bg-gradient-to-br from-accent/25 to-accent/15 text-accent border-accent/50 shadow-lg shadow-accent/15',
  Safety: 'bg-gradient-to-br from-destructive/25 to-destructive/15 text-destructive border-destructive/50 shadow-lg shadow-destructive/15',
  General: 'bg-gradient-to-br from-muted to-muted/70 text-foreground border-border shadow-lg shadow-black/5',
}

export function GuideCard({ guide, authorName, currentTeamCode, onEdit, onDelete, onView, onMarkReviewed, deleteRequiresReview = false, matchSnippet }: GuideCardProps) {
  const { t, language } = useLanguage()
  const dateLocale = language === 'en' ? 'en-US' : language === 'fi' ? 'fi-FI' : 'da-DK'
  const [isExpanded, setIsExpanded] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const reviewStatus = getReviewStatus(guide)
  const otherSharedTeamCodes = (guide.sharedWithTeamCodes || []).filter((code) => code !== currentTeamCode)

  const handleCardClick = () => {
    onView(guide)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 30 }}
      whileHover={{ y: -4 }}
    >
      <Card
        className={cn(
          'group cursor-pointer transition-all duration-300 h-full flex flex-col relative overflow-hidden backdrop-blur-md border-2',
          'bg-card/90',
          'hover:shadow-[0_25px_60px_-15px] hover:shadow-primary/30 hover:border-primary/60',
          'hover:bg-card',
          isExpanded && 'ring-2 ring-primary/50 shadow-2xl shadow-primary/30'
        )}
        onClick={handleCardClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/8 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.55_0.22_265/0.15),transparent_50%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <CardHeader className="pb-5 flex-1 relative z-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-4">
                  <CardTitle className="text-sm sm:text-base md:text-lg leading-tight break-words flex-1 font-bold text-foreground group-hover:bg-gradient-to-r group-hover:from-primary group-hover:via-accent group-hover:to-primary group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                    {guide.title}
                  </CardTitle>
                  {guide.wordFileData && (
                    <motion.div
                      initial={{ scale: 1 }}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <FileDoc size={20} weight="duotone" className="text-accent flex-shrink-0 mt-0.5" />
                    </motion.div>
                  )}
                </div>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn('text-xs font-bold shadow-lg border-2', categoryColors[guide.category])}
                  >
                    {guide.category}
                  </Badge>
                  {guide.version && (
                    <Badge variant="secondary" className="text-xs font-mono">v{guide.version}</Badge>
                  )}
                  {otherSharedTeamCodes.length > 0 && (
                    <Badge variant="outline" className="text-xs font-semibold gap-1 bg-accent/10 text-accent border-accent/40">
                      <Buildings size={12} weight="bold" />
                      {t.guideCard.sharedWithPrefix} {otherSharedTeamCodes.join(', ')}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(guide.updatedAt).toLocaleDateString(dateLocale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  {authorName && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User size={12} />
                      {authorName}
                    </span>
                  )}
                </CardDescription>
                <div className="mt-2">
                  {reviewStatus === 'overdue' ? (
                    <Badge variant="outline" className="text-xs font-semibold gap-1 bg-destructive/10 text-destructive border-destructive/40">
                      <Timer size={12} weight="bold" />
                      {t.guideCard.overdueBadge}
                    </Badge>
                  ) : reviewStatus === 'due-soon' ? (
                    <Badge variant="outline" className="text-xs font-semibold gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/40">
                      <Timer size={12} weight="bold" />
                      {t.guideCard.dueSoonPrefix} {guide.nextReviewAt ? new Date(guide.nextReviewAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) : ''}
                    </Badge>
                  ) : reviewStatus === 'ok' ? (
                    <Badge variant="outline" className="text-xs gap-1 text-muted-foreground border-border">
                      <Timer size={12} />
                      {t.guideCard.nextCheckPrefix} {guide.nextReviewAt ? new Date(guide.nextReviewAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs gap-1 text-muted-foreground/60 border-border/60">
                      {t.guideCard.noInterval}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {guide.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {guide.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-3 py-1 font-semibold bg-muted hover:bg-muted/80 transition-colors rounded-lg">
                    {tag}
                  </Badge>
                ))}
                {guide.tags.length > 3 && (
                  <Badge variant="secondary" className="text-xs px-3 py-1 font-semibold bg-muted rounded-lg">
                    +{guide.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
            {matchSnippet && (
              <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {t.guideCard.matchPrefix} {matchSnippet.reference}
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {matchSnippet.relevance} {t.guideCard.relevanceSuffix}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 break-words">{matchSnippet.text}</p>
              </div>
            )}
            <div className="flex gap-2 pt-3" onClick={(e) => e.stopPropagation()}>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
                  onClick={() => onView(guide)}
                >
                  <Eye size={18} weight="duotone" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-accent hover:bg-accent/10 transition-all duration-200"
                  onClick={() => onEdit(guide)}
                >
                  <PencilSimple size={18} weight="duotone" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  <Trash size={18} weight="duotone" />
                </Button>
              </motion.div>
              <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t.guideCard.deleteTitle}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {deleteRequiresReview
                        ? (language === 'da'
                            ? <>Sletningen af <strong>{guide.title}</strong> bliver sendt til review. Guiden forbliver udgivet, indtil en reviewer godkender sletningen.</>
                            : language === 'fi'
                              ? <>Oppaan <strong>{guide.title}</strong> poistaminen lähetetään tarkistettavaksi. Opas pysyy julkaistuna, kunnes tarkistaja hyväksyy poistamisen.</>
                              : <>Deleting <strong>{guide.title}</strong> will be submitted for review. The guide remains published until a reviewer approves the deletion.</>)
                        : <>{t.guideCard.deleteConfirmPrefix} <strong>{guide.title}</strong>{t.guideCard.deleteConfirmSuffix}</>}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => onDelete(guide.id)}
                    >
                      {deleteRequiresReview ? (language === 'da' ? 'Send til review' : language === 'fi' ? 'Lähetä tarkistettavaksi' : 'Submit for review') : t.guideCard.deleteAction}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {onMarkReviewed && (reviewStatus === 'overdue' || reviewStatus === 'due-soon') && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs font-semibold border-green-600/40 text-green-600 hover:bg-green-600/10 hover:text-green-600"
                    onClick={() => onMarkReviewed(guide)}
                  >
                    <CheckCircle size={16} weight="bold" />
                    {t.guideCard.markReviewed}
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  )
}
