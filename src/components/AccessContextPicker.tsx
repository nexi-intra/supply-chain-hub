import { Buildings, Eye, SignOut, UsersThree } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useLanguage } from '@/contexts/LanguageContext'
import type { AccessView, RegisteredTeam } from '@/lib/electronRegistryBridge'

interface AccessContextPickerProps {
  homeTeam: RegisteredTeam | null
  views: AccessView[]
  teams: RegisteredTeam[]
  onSelectHome: () => void
  onSelectView: (view: AccessView) => void
  onLogout: () => void
}

export function AccessContextPicker({ homeTeam, views, teams, onSelectHome, onSelectView, onLogout }: AccessContextPickerProps) {
  const { language } = useLanguage()
  const da = language === 'da'
  const fi = language === 'fi'

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <ThemeToggle />
        <LanguageToggle />
        <Button variant="outline" onClick={onLogout} className="gap-2">
          <SignOut size={18} /> {da ? 'Log ud' : fi ? 'Kirjaudu ulos' : 'Log out'}
        </Button>
      </div>
      <div className="container mx-auto px-4 pt-32 pb-16 max-w-5xl relative z-10">
        <div className="text-center mb-10">
          <UsersThree size={54} weight="duotone" className="text-primary mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground pb-2">
            {da ? 'Vælg din hub' : fi ? 'Valitse hubi' : 'Choose your hub'}
          </h1>
          <p className="text-muted-foreground">
            {da ? 'Du kan altid skifte hub igen.' : fi ? 'Voit vaihtaa hubia milloin tahansa.' : 'You can switch hubs again at any time.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {homeTeam && (
            <Card className="p-6 hover:border-primary/50 transition-colors flex flex-col">
              <Buildings size={32} weight="duotone" className="text-primary mb-3" />
              <h2 className="text-xl font-bold">{homeTeam.name}</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                {da ? 'Dit almindelige team med dine normale rettigheder.' : fi ? 'Oma tiimisi tavallisilla käyttöoikeuksillasi.' : 'Your regular team with your normal permissions.'}
              </p>
              <Button onClick={onSelectHome} className="mt-auto">{da ? 'Åbn min hub' : fi ? 'Avaa oma hubi' : 'Open my hub'}</Button>
            </Card>
          )}

          {views.map((view) => (
            <Card key={view.viewId} className="p-6 hover:border-primary/50 transition-colors flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <Eye size={32} weight="duotone" className="text-primary" />
                <Badge variant="secondary">{da ? 'Kun læsning' : fi ? 'Vain luku' : 'Read only'}</Badge>
              </div>
              <h2 className="text-xl font-bold mt-3">{view.name}</h2>
              <div className="flex flex-wrap gap-2 mt-3 mb-5">
                {view.teamIds.map((teamId) => {
                  const team = teams.find((candidate) => candidate.teamId === teamId)
                  return <Badge key={teamId} variant="outline">{team?.abbreviation || teamId}</Badge>
                })}
              </div>
              <Button onClick={() => onSelectView(view)} variant="outline" className="mt-auto">
                {da ? 'Åbn hub' : fi ? 'Avaa hubi' : 'Open hub'}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
