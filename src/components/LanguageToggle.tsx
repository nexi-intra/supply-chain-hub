import { useLanguage } from '@/contexts/LanguageContext'
import { Globe, Check } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  const languageLabels = {
    da: 'Dansk',
    en: 'English',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 font-semibold bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 w-full sm:w-auto px-4">
          <Globe size={20} weight="duotone" />
          {languageLabels[language]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLanguage('da')} className="gap-2 cursor-pointer">
          {language === 'da' && <Check weight="bold" />}
          {language !== 'da' && <span className="w-4" />}
          Dansk
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLanguage('en')} className="gap-2 cursor-pointer">
          {language === 'en' && <Check weight="bold" />}
          {language !== 'en' && <span className="w-4" />}
          English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
