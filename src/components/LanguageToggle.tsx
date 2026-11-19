import { useLanguage } from '@/contexts/LanguageContext'
import type { Language } from '@/lib/translations'
import { Globe, Check } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

// Each language is shown in its own name.
export const LANGUAGE_LABELS: Record<Language, string> = {
  da: 'Dansk',
  en: 'English',
  fi: 'Suomi',
  sv: 'Svenska',
}

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 font-semibold bg-background/90 hover:bg-background transition-colors w-full sm:w-auto px-4">
          <Globe size={20} weight="duotone" />
          {LANGUAGE_LABELS[language]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(LANGUAGE_LABELS) as Language[]).map(code => (
          <DropdownMenuItem key={code} onClick={() => setLanguage(code)} className="gap-2 cursor-pointer">
            {language === code ? <Check weight="bold" /> : <span className="w-4" />}
            {LANGUAGE_LABELS[code]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
