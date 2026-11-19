import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { alphabet } from '@/games/wordPuzzle/display'
import type { MultiplayerLanguage } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import { WordTile } from './WordTile'

export interface BlankPickerProps {
  open: boolean
  language: MultiplayerLanguage
  labels: MultiplayerLabels['match']['blank']
  onPick: (letter: string) => void
  onClose: () => void
}

export function BlankPicker({ open, language, labels, onPick, onClose }: BlankPickerProps) {
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.hint}</DialogDescription>
        </DialogHeader>
        <div className="wp-blank-grid" role="group" aria-label={labels.title}>
          {alphabet(language).map(letter => (
            <button key={letter} type="button" className="wp-blank-key" aria-label={letter} onClick={() => onPick(letter)}>
              <WordTile letter={letter} blank language={language} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
