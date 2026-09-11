import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CaretLeft, CaretRight, ForkKnife, FloppyDisk, Trash, CalendarBlank } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useKV } from '@/hooks/useKV'
import { AutoText } from '@/components/AutoText'
import { toast } from 'sonner'
import { getWeekNumber, getStartOfWeek, formatDate } from '@/lib/dateUtils'
import { isAnyModalOpen } from '@/lib/modalStack'
import { useLanguage } from '@/contexts/LanguageContext'
import type { WeekMenu } from '@/lib/types'

interface MealPlanProps {
  onNavigateBack: () => void
}

const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const

export function MealPlan({ onNavigateBack }: MealPlanProps) {
  const { t } = useLanguage()
  const [weekMenus, setWeekMenus] = useKV<WeekMenu[]>('meal-plan-weeks', [])
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [currentMenu, setCurrentMenu] = useState<WeekMenu | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [tempMeals, setTempMeals] = useState({
    monday: '',
    tuesday: '',
    wednesday: '',
    thursday: '',
    friday: ''
  })
  
  const today = new Date()
  const targetDate = new Date(today)
  targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7))
  
  const currentWeek = getWeekNumber(targetDate)
  const currentYear = targetDate.getFullYear()
  const weekStart = getStartOfWeek(targetDate)
  const mealPlaceholder = t.mealPlan.mealPlaceholder

  useEffect(() => {
    loadCurrentWeek()
  }, [currentWeekOffset, weekMenus])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAnyModalOpen()) return
        onNavigateBack()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onNavigateBack])

  const loadCurrentWeek = () => {
    const existing = weekMenus?.find(
      (w) => w.weekNumber === currentWeek && w.year === currentYear
    )
    
    if (existing) {
      setCurrentMenu(existing)
      setTempMeals(existing.meals)
    } else {
      const newMenu: WeekMenu = {
        weekNumber: currentWeek,
        year: currentYear,
        weekStart: formatDate(weekStart),
        meals: {
          monday: '',
          tuesday: '',
          wednesday: '',
          thursday: '',
          friday: ''
        }
      }
      setCurrentMenu(newMenu)
      setTempMeals(newMenu.meals)
    }
  }

  const handleSave = () => {
    if (!currentMenu) return

    const updatedMenu: WeekMenu = {
      ...currentMenu,
      meals: tempMeals
    }

    setWeekMenus((current) => {
      if (!current) return [updatedMenu]
      
      const index = current.findIndex(
        (w) => w.weekNumber === currentWeek && w.year === currentYear
      )
      
      if (index >= 0) {
        const updated = [...current]
        updated[index] = updatedMenu
        return updated
      } else {
        return [...current, updatedMenu]
      }
    })

    setCurrentMenu(updatedMenu)
    setEditMode(false)
    toast.success(t.mealPlan.saved)
  }

  const handleCancel = () => {
    if (currentMenu) {
      setTempMeals(currentMenu.meals)
    }
    setEditMode(false)
  }

  const handleClearWeek = () => {
    if (!currentMenu) return

    const clearedMeals = {
      monday: '',
      tuesday: '',
      wednesday: '',
      thursday: '',
      friday: ''
    }

    setTempMeals(clearedMeals)
    
    setWeekMenus((current) => {
      if (!current) return []
      const filtered = current.filter(
        (w) => !(w.weekNumber === currentWeek && w.year === currentYear)
      )
      return filtered
    })

    setCurrentMenu({
      ...currentMenu,
      meals: clearedMeals
    })
    
    setEditMode(false)
    toast.success(t.mealPlan.cleared)
  }

  const goToPreviousWeek = () => {
    setCurrentWeekOffset(currentWeekOffset - 1)
    setEditMode(false)
  }

  const goToNextWeek = () => {
    setCurrentWeekOffset(currentWeekOffset + 1)
    setEditMode(false)
  }

  const goToCurrentWeek = () => {
    setCurrentWeekOffset(0)
    setEditMode(false)
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-6 right-6 left-6 z-20">
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
                className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 gap-2 font-semibold px-4"
              >
                <ArrowLeft size={20} />
                {t.common.back}
              </Button>
            </motion.div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 pt-36 pb-12 sm:pb-20 max-w-7xl">
        <motion.header
          className="mb-10 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col items-center">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent flex items-center gap-3 justify-center">
              <ForkKnife size={40} weight="duotone" className="text-primary" />
              {t.mealPlan.title}
            </h1>
            <p className="text-muted-foreground mt-3">
              {t.mealPlan.subtitle}
            </p>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className="border-2 shadow-lg">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPreviousWeek}
                    className="rounded-full"
                  >
                    <CaretLeft size={20} weight="bold" />
                  </Button>
                  
                  <div className="text-center">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarBlank size={24} weight="duotone" className="text-primary" />
                      <h2 className="text-2xl font-bold">
                        {t.mealPlan.week} {currentWeek}
                      </h2>
                      {currentWeekOffset === 0 && (
                        <Badge className="bg-accent text-accent-foreground">
                          {t.mealPlan.thisWeek}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(weekStart)} - {currentYear}
                    </p>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextWeek}
                    className="rounded-full"
                  >
                    <CaretRight size={20} weight="bold" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  {currentWeekOffset !== 0 && (
                    <Button
                      variant="secondary"
                      onClick={goToCurrentWeek}
                      className="gap-2"
                    >
                      <CalendarBlank size={18} weight="duotone" />
                      {t.mealPlan.goToCurrentWeek}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-2 shadow-xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">{t.mealPlan.dailyMenus}</CardTitle>
                  <CardDescription>
                    {editMode ? t.mealPlan.editDescription : t.mealPlan.viewDescription}
                  </CardDescription>
                </div>
                
                <div className="flex items-center gap-2">
                  {!editMode ? (
                    <>
                      <Button
                        onClick={() => setEditMode(true)}
                        className="gap-2"
                      >
                        <ForkKnife size={18} weight="duotone" />
                        {t.mealPlan.editMealPlan}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleCancel}
                      >
                        {t.common.cancel}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleClearWeek}
                        className="gap-2"
                      >
                        <Trash size={18} weight="duotone" />
                        {t.mealPlan.clearWeek}
                      </Button>
                      <Button
                        onClick={handleSave}
                        className="gap-2 bg-gradient-to-r from-primary to-accent"
                      >
                        <FloppyDisk size={18} weight="duotone" />
                        {t.common.save}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <Separator />
            
            <CardContent className="p-6">
              <div className="space-y-4">
                {weekDays.map((day, index) => (
                  <motion.div
                    key={day}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="sm:w-32 shrink-0">
                        <h3 className="font-bold text-lg text-primary">
                          {t.mealPlan.days[day]}
                        </h3>
                      </div>
                      
                      <div className="flex-1">
                        {editMode ? (
                          <Textarea
                            value={tempMeals[day]}
                            onChange={(e) =>
                              setTempMeals((prev) => ({
                                ...prev,
                                [day]: e.target.value
                              }))
                            }
                            placeholder={mealPlaceholder}
                            className="min-h-[80px] resize-none"
                          />
                        ) : (
                          <div className="text-foreground whitespace-pre-wrap min-h-[60px] p-3 rounded-md bg-card">
                            {currentMenu?.meals[day] ? (
                              <AutoText text={currentMenu.meals[day]} />
                            ) : (
                              <span className="text-muted-foreground italic">
                                {t.mealPlan.noMenuPlanned}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">{t.mealPlan.previousPlans}</CardTitle>
              <CardDescription>
                {t.mealPlan.previousPlansDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnimatePresence mode="wait">
                {!weekMenus || weekMenus.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-8 text-muted-foreground"
                  >
                    <ForkKnife size={48} weight="duotone" className="mx-auto mb-3 opacity-40" />
                    <p>{t.mealPlan.noPreviousPlans}</p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {[...weekMenus]
                      .sort((a, b) => {
                        if (a.year !== b.year) return b.year - a.year
                        return b.weekNumber - a.weekNumber
                      })
                      .slice(0, 10)
                      .map((menu, index) => {
                        const hasContent = Object.values(menu.meals).some(
                          (meal: string) => meal.trim() !== ''
                        )
                        
                        if (!hasContent) return null

                        const isCurrent =
                          menu.weekNumber === currentWeek &&
                          menu.year === currentYear

                        return (
                          <motion.div
                            key={`${menu.year}-${menu.weekNumber}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Button
                              variant="outline"
                              className="w-full justify-start h-auto p-4 hover:bg-primary/5"
                              onClick={() => {
                                const weeksDiff =
                                  (menu.year - currentYear) * 52 +
                                  (menu.weekNumber - getWeekNumber(new Date()))
                                setCurrentWeekOffset(weeksDiff)
                                setEditMode(false)
                              }}
                            >
                              <div className="flex items-center justify-between w-full">
                                <div className="text-left">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">
                                      {t.mealPlan.week} {menu.weekNumber}, {menu.year}
                                    </span>
                                    {isCurrent && (
                                      <Badge
                                        variant="secondary"
                                        className="bg-accent/20 text-accent-foreground"
                                      >
                                        {t.mealPlan.current}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {menu.weekStart}
                                  </p>
                                </div>
                                <CaretRight size={20} weight="bold" />
                              </div>
                            </Button>
                          </motion.div>
                        )
                      })}
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
