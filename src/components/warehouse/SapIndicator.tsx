import { ArrowClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSapStatus } from '@/components/warehouse/SapStatusContext'
import { describeSapState, type SapTone } from '@/lib/warehouse/sapStatus'
import { t } from '@/lib/warehouse/text'
import { cn } from '@/lib/utils'

const PILL: Record<SapTone, string> = {
  ok: 'border-ok/40 bg-ok-surface text-ok',
  attention: 'border-attention/40 bg-attention-surface text-attention',
  blocked: 'border-blocked/40 bg-blocked-surface text-blocked',
  unknown: 'border-border bg-muted text-muted-foreground',
}

const DOT: Record<SapTone, string> = {
  ok: 'bg-ok',
  attention: 'bg-attention',
  blocked: 'bg-blocked',
  unknown: 'bg-muted-foreground',
}

export function SapIndicator() {
  const { status, checking, refresh } = useSapStatus()
  const description = describeSapState(status)

  return (
    <div className="flex items-center gap-2">
    {status?.expectedSystem && status.expectedSystem !== 'PS4' && (
      <span className="rounded-full border-2 border-amber-500 bg-amber-500/15 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-700 dark:text-amber-300" title={t("Optælling læser fra og skriver til SAP's testsystem", "Stock count reads from and writes to SAP's test system")}>
        TEST-SAP {status.expectedSystem}
      </span>
    )}
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', PILL[description.tone])}
          aria-label={`SAP-status: ${description.label}`}
        >
          <span className="relative flex size-2.5">
            {description.tone === 'ok' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-40" />}
            <span className={cn('relative inline-flex size-2.5 rounded-full', DOT[description.tone])} />
          </span>
          {description.label}
          {status?.ready && status.system && <span className="font-mono text-xs opacity-80">{status.system}/{status.client}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{description.label}</p>
          <p className="text-sm text-muted-foreground">{description.help}</p>
        </div>
        {status?.system && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/40 p-3 text-xs">
            <dt className="text-muted-foreground">System</dt>
            <dd className="font-mono">{status.system}</dd>
            <dt className="text-muted-foreground">{t('Klient', 'Client')}</dt>
            <dd className="font-mono">{status.client}</dd>
            {status.user && (
              <>
                <dt className="text-muted-foreground">{t('Bruger', 'User')}</dt>
                <dd className="font-mono">{status.user}</dd>
              </>
            )}
          </dl>
        )}
        <p className="text-xs text-muted-foreground">{t('Optælling læser fra SAP. Optællingsdokumenter udfyldes i SAP, men du trykker altid selv F8, Gem eller Post.', 'Stock count reads from SAP. Count documents are filled in in SAP, but you always press F8, Save or Post yourself.')}</p>
        <Button variant="outline" size="sm" className="w-full" loading={checking} onClick={() => refresh(true)}>
          <ArrowClockwise />
          {t('Tjek igen', 'Check again')}
        </Button>
      </PopoverContent>
    </Popover>
    </div>
  )
}
