import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'

type Migration = NonNullable<Awaited<ReturnType<NonNullable<Window['electronAccounts']>['status']>>>
const labels = {
  da: {
    title: 'En kontoflytning skal afsluttes',
    body: 'Hubdata er midlertidigt spærret, så der ikke arbejdes videre med en ufuldstændig flytning. Kontakt Creator, hvis du ikke selv har adgang til genopretning.',
    resume: 'Fortsæt flytning', rollback: 'Fortryd flytning', logout: 'Log ud',
    progress: 'Gennemførte trin', conflict: 'Data er ændret siden flytningen. Intet overskrives automatisk. Kontakt den ansvarlige for hubben.',
    failed: 'Genopretning kunne ikke afsluttes. Flytningen er fortsat spærret. Prøv igen, når lageret er tilgængeligt.',
    confirm: 'Vil du føre kontoen og de berørte data tilbage til tilstanden før flytningen?',
  },
  en: {
    title: 'An account migration needs recovery',
    body: 'Hub data is temporarily blocked to prevent work on an incomplete migration. Contact Creator if you cannot recover it yourself.',
    resume: 'Resume migration', rollback: 'Roll back migration', logout: 'Log out',
    progress: 'Completed steps', conflict: 'Data has changed since the migration. Nothing is overwritten automatically. Contact the hub administrator.',
    failed: 'Recovery could not finish. The migration remains blocked. Retry when storage is available.',
    confirm: 'Restore the account and affected data to their state before the migration?',
  },
  fi: {
    title: 'Tilin siirto on palautettava',
    body: 'Hubin tiedot on väliaikaisesti lukittu keskeneräisen siirron vuoksi. Ota yhteyttä Creatoriin, jos et voi palauttaa siirtoa itse.',
    resume: 'Jatka siirtoa', rollback: 'Peru siirto', logout: 'Kirjaudu ulos',
    progress: 'Valmiit vaiheet', conflict: 'Tiedot ovat muuttuneet siirron jälkeen. Mitään ei korvata automaattisesti. Ota yhteyttä hubin ylläpitäjään.',
    failed: 'Palautusta ei voitu suorittaa. Siirto on edelleen lukittu. Yritä uudelleen, kun tallennustila on käytettävissä.',
    confirm: 'Palautetaanko tili ja siihen liittyvät tiedot siirtoa edeltävään tilaan?',
  },
}

// Independently available in every logged-in view, even when ordinary KV
// reads are blocked. Only the backend can grant recovery permissions.
export function AccountMigrationRecovery({ userEmail, onLogout }: { userEmail: string; onLogout: () => void }) {
  const { language } = useLanguage()
  const text = labels[language]
  const [migration, setMigration] = useState<Migration | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [canRecover, setCanRecover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const accounts = window.electronAccounts
    if (!accounts) return
    let active = true, checking = false
    const check = async () => {
      // Denne komponent er altid monteret (ogsaa oven paa spil) og laeser IKKE
      // via useKV, saa den fik ikke normalt den samme "data-game-active"-pause
      // som resten af appen - hvert baggrunds-tjek er 2 IPC-rundture, der
      // konkurrerede med spillets main-traad hver gang NOGEN aendrede data
      // paa det delte drev (hyppigere efter watcheren blev speedet op).
      if (checking || (typeof document !== 'undefined' && document.body?.hasAttribute('data-game-active'))) return
      checking = true
      try {
        const record = await accounts.status()
        const actor = record ? await window.electronAuth?.current() : undefined
        if (active) { setMigration(record); setBlocked(!!record); setCanRecover(actor?.role === 'creator' && !actor.viewId) }
      } catch (failure) {
        if (active && String(failure).includes('AUTH_FORBIDDEN')) { setMigration(null); setBlocked(true); setCanRecover(false) }
      } finally { checking = false }
    }
    void check()
    const interval = setInterval(() => { void check() }, 5000)
    const unsubscribe = window.electronKv?.onChanged(() => { void check() })
    return () => { active = false; clearInterval(interval); unsubscribe?.() }
  }, [userEmail])
  if (!blocked) return null
  const recover = async (action: 'resume' | 'rollback') => {
    if (!migration || !window.electronAccounts || busy) return
    if (action === 'rollback' && !window.confirm(text.confirm)) return
    setBusy(true); setError('')
    try { await window.electronAccounts[action](migration.id); onLogout() }
    catch (failure) { setError(String(failure).includes('ACCOUNT_MIGRATION_CONFLICT') ? text.conflict : text.failed) }
    finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[200] bg-background/95 flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-labelledby="account-recovery-title">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl space-y-4">
        <h2 id="account-recovery-title" className="text-xl font-semibold">{text.title}</h2>
        <p className="text-sm text-muted-foreground">{text.body}</p>
        {migration && <div className="text-sm space-y-1"><p className="break-all">{migration.oldEmail} → {migration.newEmail}</p><p>{text.progress}: {migration.applied} / {migration.total}</p></div>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {canRecover && <><Button disabled={busy} onClick={() => { void recover('resume') }}>{text.resume}</Button><Button variant="outline" disabled={busy} onClick={() => { void recover('rollback') }}>{text.rollback}</Button></>}
          <Button variant="ghost" disabled={busy} onClick={onLogout}>{text.logout}</Button>
        </div>
      </section>
    </div>
  )
}
