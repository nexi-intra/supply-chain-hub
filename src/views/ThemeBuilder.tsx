import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Palette, FloppyDisk, Eye, Trash, Download, Upload } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useKV } from '@/hooks/useKV'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

interface ThemeBuilderProps {
  onNavigateBack: () => void
  userEmail: string
}

interface CustomTheme {
  id: string
  name: string
  colors: {
    background: string
    foreground: string
    card: string
    cardForeground: string
    popover: string
    popoverForeground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
    destructive: string
    destructiveForeground: string
    border: string
    input: string
    ring: string
  }
  radius: string
  createdBy: string
  createdAt: string
}

const defaultTheme: CustomTheme['colors'] = {
  background: 'oklch(0.985 0.003 260)',
  foreground: 'oklch(0.25 0.05 275)',
  card: 'oklch(1.00 0 0)',
  cardForeground: 'oklch(0.25 0.05 275)',
  popover: 'oklch(1.00 0 0)',
  popoverForeground: 'oklch(0.25 0.05 275)',
  primary: 'oklch(0.40 0.20 272)',
  primaryForeground: 'oklch(0.99 0 0)',
  secondary: 'oklch(0.95 0.012 265)',
  secondaryForeground: 'oklch(0.32 0.08 272)',
  muted: 'oklch(0.965 0.006 260)',
  mutedForeground: 'oklch(0.50 0.03 265)',
  accent: 'oklch(0.50 0.16 265)',
  accentForeground: 'oklch(0.99 0 0)',
  destructive: 'oklch(0.55 0.19 25)',
  destructiveForeground: 'oklch(0.99 0 0)',
  border: 'oklch(0.90 0.010 262)',
  input: 'oklch(0.90 0.010 262)',
  ring: 'oklch(0.40 0.20 272)',
}

const presetThemes = [
  {
    name: 'Nexi Blue',
    colors: {
      ...defaultTheme,
    }
  },
  {
    name: 'Ocean Breeze',
    colors: {
      ...defaultTheme,
      primary: 'oklch(0.55 0.15 220)',
      accent: 'oklch(0.60 0.12 200)',
      background: 'oklch(0.98 0.01 210)',
    }
  },
  {
    name: 'Sunset Glow',
    colors: {
      ...defaultTheme,
      primary: 'oklch(0.60 0.18 40)',
      accent: 'oklch(0.55 0.15 60)',
      background: 'oklch(0.97 0.01 50)',
    }
  },
  {
    name: 'Forest Green',
    colors: {
      ...defaultTheme,
      primary: 'oklch(0.50 0.12 150)',
      accent: 'oklch(0.55 0.10 130)',
      background: 'oklch(0.97 0.01 140)',
    }
  },
  {
    name: 'Royal Purple',
    colors: {
      ...defaultTheme,
      primary: 'oklch(0.55 0.15 290)',
      accent: 'oklch(0.60 0.12 270)',
      background: 'oklch(0.97 0.01 280)',
    }
  },
  {
    name: 'Warm Autumn',
    colors: {
      ...defaultTheme,
      primary: 'oklch(0.55 0.14 50)',
      accent: 'oklch(0.60 0.12 30)',
      secondary: 'oklch(0.90 0.03 40)',
    }
  },
]

export function ThemeBuilder({ onNavigateBack, userEmail }: ThemeBuilderProps) {
  const { t } = useLanguage()
  const [savedThemes, setSavedThemes] = useKV<CustomTheme[]>('custom-themes', [])
  const [activeTheme, setActiveTheme] = useKV<string>(`active-theme-${userEmail}`, 'default')
  const [themeName, setThemeName] = useState('')
  const [colors, setColors] = useState<CustomTheme['colors']>(defaultTheme)
  const [radius, setRadius] = useState('0.625rem')
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => {
    if (activeTheme && activeTheme !== 'default') {
      const theme = savedThemes?.find(t => t.id === activeTheme)
      if (theme) {
        applyTheme(theme.colors, theme.radius)
      }
    } else {
      resetTheme()
    }
  }, [activeTheme, savedThemes])

  const applyTheme = (themeColors: CustomTheme['colors'], themeRadius: string) => {
    const root = document.documentElement
    Object.entries(themeColors).forEach(([key, value]) => {
      const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      root.style.setProperty(`--${cssVar}`, value)
    })
    root.style.setProperty('--radius', themeRadius)
  }

  const resetTheme = () => {
    const root = document.documentElement
    Object.keys(defaultTheme).forEach((key) => {
      const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      root.style.removeProperty(`--${cssVar}`)
    })
    root.style.removeProperty('--radius')
  }

  const handleColorChange = (colorKey: keyof CustomTheme['colors'], value: string) => {
    const updatedColors = { ...colors, [colorKey]: value }
    setColors(updatedColors)
    if (previewMode) {
      applyTheme(updatedColors, radius)
    }
  }

  const handleRadiusChange = (value: string) => {
    setRadius(value)
    if (previewMode) {
      applyTheme(colors, value)
    }
  }

  const togglePreview = () => {
    if (!previewMode) {
      applyTheme(colors, radius)
      toast.success(t.themeBuilder.previewActivated)
    } else {
      if (activeTheme && activeTheme !== 'default') {
        const theme = savedThemes?.find(t => t.id === activeTheme)
        if (theme) {
          applyTheme(theme.colors, theme.radius)
        } else {
          resetTheme()
        }
      } else {
        resetTheme()
      }
      toast.info(t.themeBuilder.previewDeactivated)
    }
    setPreviewMode(!previewMode)
  }

  const saveTheme = () => {
    if (!themeName.trim()) {
      toast.error(t.themeBuilder.enterThemeName)
      return
    }

    const newTheme: CustomTheme = {
      id: `theme-${Date.now()}`,
      name: themeName,
      colors,
      radius,
      createdBy: userEmail,
      createdAt: new Date().toISOString(),
    }

    setSavedThemes((current) => [...(current || []), newTheme])
    toast.success(`${t.themeBuilder.themeSavedPrefix} "${themeName}" ${t.themeBuilder.themeSavedSuffix}`)
    setThemeName('')
  }

  const applyCustomTheme = (themeId: string) => {
    setActiveTheme(themeId)
    const theme = savedThemes?.find(t => t.id === themeId)
    if (theme) {
      toast.success(`${t.themeBuilder.appliedThemePrefix} ${theme.name}`)
    }
  }

  const deleteTheme = (themeId: string) => {
    setSavedThemes((current) => (current || []).filter(t => t.id !== themeId))
    if (activeTheme === themeId) {
      setActiveTheme('default')
      resetTheme()
    }
    toast.success(t.themeBuilder.themeDeleted)
  }

  const loadPreset = (preset: typeof presetThemes[0]) => {
    setColors(preset.colors)
    setThemeName(preset.name)
    if (previewMode) {
      applyTheme(preset.colors, radius)
    }
    toast.success(`${t.themeBuilder.loadedPresetPrefix} ${preset.name}`)
  }

  const exportTheme = () => {
    const theme: CustomTheme = {
      id: `theme-${Date.now()}`,
      name: themeName || 'Custom Theme',
      colors,
      radius,
      createdBy: userEmail,
      createdAt: new Date().toISOString(),
    }
    
    const dataStr = JSON.stringify(theme, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    
    const exportFileDefaultName = `theme-${theme.name.replace(/\s+/g, '-').toLowerCase()}.json`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
    
    toast.success(t.themeBuilder.themeExported)
  }

  const importTheme = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const theme = JSON.parse(event.target?.result as string) as CustomTheme
            setColors(theme.colors)
            setRadius(theme.radius)
            setThemeName(theme.name)
            if (previewMode) {
              applyTheme(theme.colors, theme.radius)
            }
            toast.success(`${t.themeBuilder.importedThemePrefix} ${theme.name}`)
          } catch (error) {
            toast.error(t.themeBuilder.invalidThemeFile)
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onNavigateBack}
              className="rounded-full"
            >
              <ArrowLeft size={24} />
            </Button>
            <div>
              <h1 className="text-4xl font-bold flex items-center gap-3 bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
                <Palette size={40} className="text-primary" />
                {t.themeBuilder.title}
              </h1>
              <p className="text-muted-foreground mt-1">{t.themeBuilder.subtitle}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={previewMode ? 'default' : 'outline'}
              onClick={togglePreview}
              className="gap-2"
            >
              <Eye size={20} />
              {previewMode ? t.themeBuilder.exitPreview : t.themeBuilder.preview}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t.themeBuilder.createCustomTheme}</CardTitle>
                <CardDescription>{t.themeBuilder.designDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="theme-name">{t.themeBuilder.themeNameLabel}</Label>
                  <Input
                    id="theme-name"
                    placeholder={t.themeBuilder.themeNamePlaceholder}
                    value={themeName}
                    onChange={(e) => setThemeName(e.target.value)}
                  />
                </div>

                <Tabs defaultValue="main" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="main">{t.themeBuilder.tabs.main}</TabsTrigger>
                    <TabsTrigger value="action">{t.themeBuilder.tabs.action}</TabsTrigger>
                    <TabsTrigger value="ui">{t.themeBuilder.tabs.ui}</TabsTrigger>
                    <TabsTrigger value="advanced">{t.themeBuilder.tabs.advanced}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="main" className="space-y-4 mt-4">
                    <ColorInput
                      label={t.themeBuilder.colors.background.label}
                      description={t.themeBuilder.colors.background.description}
                      value={colors.background}
                      onChange={(v) => handleColorChange('background', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.foreground.label}
                      description={t.themeBuilder.colors.foreground.description}
                      value={colors.foreground}
                      onChange={(v) => handleColorChange('foreground', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.card.label}
                      description={t.themeBuilder.colors.card.description}
                      value={colors.card}
                      onChange={(v) => handleColorChange('card', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.cardForeground.label}
                      description={t.themeBuilder.colors.cardForeground.description}
                      value={colors.cardForeground}
                      onChange={(v) => handleColorChange('cardForeground', v)}
                    />
                  </TabsContent>

                  <TabsContent value="action" className="space-y-4 mt-4">
                    <ColorInput
                      label={t.themeBuilder.colors.primary.label}
                      description={t.themeBuilder.colors.primary.description}
                      value={colors.primary}
                      onChange={(v) => handleColorChange('primary', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.primaryForeground.label}
                      description={t.themeBuilder.colors.primaryForeground.description}
                      value={colors.primaryForeground}
                      onChange={(v) => handleColorChange('primaryForeground', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.secondary.label}
                      description={t.themeBuilder.colors.secondary.description}
                      value={colors.secondary}
                      onChange={(v) => handleColorChange('secondary', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.secondaryForeground.label}
                      description={t.themeBuilder.colors.secondaryForeground.description}
                      value={colors.secondaryForeground}
                      onChange={(v) => handleColorChange('secondaryForeground', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.accent.label}
                      description={t.themeBuilder.colors.accent.description}
                      value={colors.accent}
                      onChange={(v) => handleColorChange('accent', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.accentForeground.label}
                      description={t.themeBuilder.colors.accentForeground.description}
                      value={colors.accentForeground}
                      onChange={(v) => handleColorChange('accentForeground', v)}
                    />
                  </TabsContent>

                  <TabsContent value="ui" className="space-y-4 mt-4">
                    <ColorInput
                      label={t.themeBuilder.colors.muted.label}
                      description={t.themeBuilder.colors.muted.description}
                      value={colors.muted}
                      onChange={(v) => handleColorChange('muted', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.mutedForeground.label}
                      description={t.themeBuilder.colors.mutedForeground.description}
                      value={colors.mutedForeground}
                      onChange={(v) => handleColorChange('mutedForeground', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.border.label}
                      description={t.themeBuilder.colors.border.description}
                      value={colors.border}
                      onChange={(v) => handleColorChange('border', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.input.label}
                      description={t.themeBuilder.colors.input.description}
                      value={colors.input}
                      onChange={(v) => handleColorChange('input', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.ring.label}
                      description={t.themeBuilder.colors.ring.description}
                      value={colors.ring}
                      onChange={(v) => handleColorChange('ring', v)}
                    />
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-4 mt-4">
                    <ColorInput
                      label={t.themeBuilder.colors.destructive.label}
                      description={t.themeBuilder.colors.destructive.description}
                      value={colors.destructive}
                      onChange={(v) => handleColorChange('destructive', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.destructiveForeground.label}
                      description={t.themeBuilder.colors.destructiveForeground.description}
                      value={colors.destructiveForeground}
                      onChange={(v) => handleColorChange('destructiveForeground', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.popover.label}
                      description={t.themeBuilder.colors.popover.description}
                      value={colors.popover}
                      onChange={(v) => handleColorChange('popover', v)}
                    />
                    <ColorInput
                      label={t.themeBuilder.colors.popoverForeground.label}
                      description={t.themeBuilder.colors.popoverForeground.description}
                      value={colors.popoverForeground}
                      onChange={(v) => handleColorChange('popoverForeground', v)}
                    />
                    <div className="space-y-2">
                      <Label>{t.themeBuilder.borderRadiusLabel}</Label>
                      <Select value={radius} onValueChange={handleRadiusChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0rem">{t.themeBuilder.radiusOptions.none}</SelectItem>
                          <SelectItem value="0.375rem">{t.themeBuilder.radiusOptions.small}</SelectItem>
                          <SelectItem value="0.5rem">{t.themeBuilder.radiusOptions.medium}</SelectItem>
                          <SelectItem value="0.75rem">{t.themeBuilder.radiusOptions.default}</SelectItem>
                          <SelectItem value="1rem">{t.themeBuilder.radiusOptions.large}</SelectItem>
                          <SelectItem value="1.5rem">{t.themeBuilder.radiusOptions.extraLarge}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-3 pt-4 border-t">
                  <Button onClick={saveTheme} className="gap-2">
                    <FloppyDisk size={20} />
                    {t.themeBuilder.saveTheme}
                  </Button>
                  <Button variant="outline" onClick={exportTheme} className="gap-2">
                    <Download size={20} />
                    {t.themeBuilder.export}
                  </Button>
                  <Button variant="outline" onClick={importTheme} className="gap-2">
                    <Upload size={20} />
                    {t.themeBuilder.import}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.themeBuilder.previewComponentsTitle}</CardTitle>
                <CardDescription>{t.themeBuilder.previewComponentsDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button>{t.themeBuilder.primaryButton}</Button>
                    <Button variant="secondary">{t.themeBuilder.secondaryButton}</Button>
                    <Button variant="outline">{t.themeBuilder.outlineButton}</Button>
                    <Button variant="destructive">{t.themeBuilder.destructiveButton}</Button>
                  </div>
                  
                  <Card className="p-4">
                    <h3 className="font-semibold mb-2">{t.themeBuilder.sampleCard}</h3>
                    <p className="text-sm text-muted-foreground">{t.themeBuilder.sampleCardText}</p>
                  </Card>

                  <div className="space-y-2">
                    <Label>{t.themeBuilder.sampleInputLabel}</Label>
                    <Input placeholder={t.themeBuilder.sampleInputPlaceholder} />
                  </div>

                  <div className="flex gap-2">
                    <div className="h-16 w-16 rounded-md bg-primary" title="Primary" />
                    <div className="h-16 w-16 rounded-md bg-secondary" title="Secondary" />
                    <div className="h-16 w-16 rounded-md bg-accent" title="Accent" />
                    <div className="h-16 w-16 rounded-md bg-muted" title="Muted" />
                    <div className="h-16 w-16 rounded-md border-2 border-border" title="Border" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t.themeBuilder.yourThemesTitle}</CardTitle>
                <CardDescription>{t.themeBuilder.yourThemesDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <motion.div
                  className={cn(
                    "p-4 rounded-lg border-2 cursor-pointer transition-colors",
                    activeTheme === 'default' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  )}
                  onClick={() => {
                    setActiveTheme('default')
                    resetTheme()
                    toast.success(t.themeBuilder.appliedDefaultTheme)
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="font-semibold">{t.themeBuilder.defaultThemeName}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t.themeBuilder.defaultThemeDescription}</div>
                </motion.div>

                {(savedThemes || []).map((theme) => (
                  <motion.div
                    key={theme.id}
                    className={cn(
                      "p-4 rounded-lg border-2 cursor-pointer transition-colors",
                      activeTheme === theme.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1" onClick={() => applyCustomTheme(theme.id)}>
                        <div className="font-semibold">{theme.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(theme.createdAt).toLocaleDateString()}
                        </div>
                        <div className="flex gap-1 mt-2">
                          <div className="h-6 w-6 rounded-sm" style={{ background: theme.colors.primary }} />
                          <div className="h-6 w-6 rounded-sm" style={{ background: theme.colors.secondary }} />
                          <div className="h-6 w-6 rounded-sm" style={{ background: theme.colors.accent }} />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteTheme(theme.id)
                        }}
                        className="h-8 w-8"
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </motion.div>
                ))}

                {(!savedThemes || savedThemes.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t.themeBuilder.noSavedThemes}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.themeBuilder.presetThemesTitle}</CardTitle>
                <CardDescription>{t.themeBuilder.presetThemesDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {presetThemes.map((preset, index) => (
                  <motion.div
                    key={index}
                    className="p-4 rounded-lg border-2 border-border hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() => loadPreset(preset)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="font-semibold">{preset.name}</div>
                    <div className="flex gap-1 mt-2">
                      <div className="h-6 w-6 rounded-sm" style={{ background: preset.colors.primary }} />
                      <div className="h-6 w-6 rounded-sm" style={{ background: preset.colors.secondary }} />
                      <div className="h-6 w-6 rounded-sm" style={{ background: preset.colors.accent }} />
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function ColorInput({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div 
          className="h-10 w-10 rounded-md border-2 border-border" 
          style={{ background: value }}
        />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="oklch(0.50 0.12 250)"
        className="font-mono text-sm"
      />
    </div>
  )
}
