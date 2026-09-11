import { useTheme } from '@/contexts/ThemeContext'
import { Moon, Sun, Check } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()

  const themeLabels = {
    light: t.theme?.light || 'Light',
    dark: t.theme?.dark || 'Dark',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 font-semibold bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all duration-300 w-full sm:w-auto px-4">
          {theme === 'light' ? <Sun size={20} weight="duotone" /> : <Moon size={20} weight="duotone" />}
          {themeLabels[theme]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2 cursor-pointer">
          {theme === 'light' && <Check weight="bold" />}
          {theme !== 'light' && <span className="w-4" />}
          <Sun className="mr-2" />
          {themeLabels.light}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2 cursor-pointer">
          {theme === 'dark' && <Check weight="bold" />}
          {theme !== 'dark' && <span className="w-4" />}
          <Moon className="mr-2" />
          {themeLabels.dark}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
