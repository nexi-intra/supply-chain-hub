import { Warning } from '@phosphor-icons/react'
import type { UnsentPc } from '@/types/warehouse'
import { unsentHint, unsentPcText } from './since'

/** Other PCs that may still hold scans. Only a warning: closing and approving go on. */
export function UnsentPcsNotice({ pcs }: { pcs: UnsentPc[] }) {
  if (!pcs.length) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      <Warning size={18} className="mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {pcs.map((pc, index) => <p key={`${pc.email}-${pc.since}-${index}`}>{unsentPcText(pc)}</p>)}
        <p className="text-xs">{unsentHint()}</p>
      </div>
    </div>
  )
}
