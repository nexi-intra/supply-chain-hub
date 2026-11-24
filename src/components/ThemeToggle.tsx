import { useTheme } from '@/contexts/ThemeContext'
import { useChristmas } from '@/contexts/ChristmasContext'
import { christmasLabels } from '@/lib/christmas'
import { Moon, Sun, Check, Snowflake } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t, language } = useLanguage()
  const christmas = useChristmas()

  const themeLabels = {
    light: t.theme?.light || 'Light',
    dark: t.theme?.dark || 'Dark',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 font-semibold bg-background/90 hover:bg-background transition-colors w-full sm:w-auto px-4">
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
        {christmas.season && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => christmas.setEnabled(!christmas.enabled)} className="gap-2 cursor-pointer">
              {christmas.enabled ? <Check weight="bold" /> : <span className="w-4" />}
              <Snowflake className="mr-2" />
              {christmasLabels(language).toggle}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
