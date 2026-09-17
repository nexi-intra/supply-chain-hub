import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const harness = vi.hoisted(() => ({ state: [] as unknown[], index: 0, capture: false, effects: [] as Array<() => (() => void) | undefined>, cleanups: [] as Array<() => void>, language: 'da', buttons: [] as Array<{ children: string; onClick?: () => void }> }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: unknown) { const index = harness.index++; if (!(index in harness.state)) harness.state[index] = initial; return [harness.state[index], (value: unknown) => { harness.state[index] = typeof value === 'function' ? value(harness.state[index]) : value }] },
  useEffect(effect: () => (() => void) | undefined) { if (harness.capture) harness.effects.push(effect) },
}))
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ language: harness.language }) }))
vi.mock('@/components/ui/button', () => ({ Button: (props: { children: string; onClick?: () => void; disabled?: boolean }) => { harness.buttons.push(props); return <button disabled={props.disabled}>{props.children}</button> } }))
import { AccountMigrationRecovery } from './AccountMigrationRecovery'
const record = { id: 'synthetic', state: 'failed', oldEmail: 'old@example.test', newEmail: 'new@example.test', applied: 2, total: 5, teamId: 'a' }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const logout = vi.fn()
function render() { harness.index = 0; harness.buttons = []; return renderToStaticMarkup(<AccountMigrationRecovery userEmail="creator@example.test" onLogout={logout} />) }
async function mount(role = 'creator', status = vi.fn(async () => record)) {
  const unsubscribe = vi.fn(), accounts = { status, resume: vi.fn(async () => ({ state: 'committed' })), rollback: vi.fn(async () => ({ state: 'rolled-back' })) }
  vi.stubGlobal('window', { electronAccounts: accounts, electronAuth: { current: vi.fn(async () => ({ role, viewId: null })) }, electronKv: { onChanged: vi.fn(() => unsubscribe) }, confirm: vi.fn(() => true) })
  harness.capture = true; render(); harness.capture = false
  for (const effect of harness.effects) { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup) }
  await flush()
  return { accounts, unsubscribe, html: render() }
}
beforeEach(() => { harness.state = []; harness.effects = []; harness.cleanups = []; harness.language = 'da'; logout.mockClear(); vi.useFakeTimers() })
afterEach(() => { for (const cleanup of harness.cleanups) cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('account recovery lifecycle (isolated hook harness, not a real DOM)', () => {
  it('does not show an overlay or load credentials when no migration is pending', async () => {
    const f = await mount('creator', vi.fn(async () => null) as never)
    expect(f.html).toBe(''); expect(window.electronAuth!.current).not.toHaveBeenCalled()
  })
  it('creator sees progress and recovery actions, never private journal snapshots', async () => {
    const f = await mount()
    expect(f.html).toContain('role="alertdialog"'); expect(f.html).toContain('2 / 5')
    expect(f.html).toContain('Fortsæt flytning'); expect(f.html).toContain('Fortryd flytning')
    expect(f.html).not.toMatch(/password|steps|signature|SYNTHETIC SECRET/)
  })
  it('manager sees the pending account but never creator recovery actions', async () => {
    const f = await mount('manager')
    expect(f.html).toContain('old@example.test'); expect(f.html).not.toContain('Fortsæt flytning'); expect(f.html).not.toContain('Fortryd flytning')
  })
  it('ordinary account sees only a blocking notice when detailed status is forbidden', async () => {
    const f = await mount('user', vi.fn(async () => { throw new Error('AUTH_FORBIDDEN') }))
    expect(f.html).toContain('Kontakt Creator'); expect(f.html).not.toContain('old@example.test'); expect(f.html).not.toContain('Fortsæt flytning')
  })
  it('resumes through the narrow API and logs out after confirmed success', async () => {
    const f = await mount(); harness.buttons.find(button => button.children === 'Fortsæt flytning')!.onClick!(); await flush()
    expect(f.accounts.resume).toHaveBeenCalledWith('synthetic'); expect(logout).toHaveBeenCalledOnce()
  })
  it('cancelled rollback makes no write and conflicts stay blocked without logging out', async () => {
    const f = await mount(); vi.mocked(window.confirm).mockReturnValue(false)
    harness.buttons.find(button => button.children === 'Fortryd flytning')!.onClick!(); await flush()
    expect(f.accounts.rollback).not.toHaveBeenCalled()
    f.accounts.resume.mockRejectedValue(new Error('ACCOUNT_MIGRATION_CONFLICT'))
    harness.buttons.find(button => button.children === 'Fortsæt flytning')!.onClick!(); await flush()
    expect(render()).toContain('Intet overskrives automatisk'); expect(logout).not.toHaveBeenCalled()
  })
  it('polling and subscriptions stop on cleanup', async () => {
    const f = await mount(); await vi.advanceTimersByTimeAsync(5000); expect(f.accounts.status).toHaveBeenCalledTimes(2)
    for (const cleanup of harness.cleanups) cleanup(); harness.cleanups = []
    await vi.advanceTimersByTimeAsync(10000); expect(f.accounts.status).toHaveBeenCalledTimes(2); expect(f.unsubscribe).toHaveBeenCalledOnce()
  })
  for (const [language, title] of [['en', 'An account migration needs recovery'], ['fi', 'Tilin siirto on palautettava']]) it(`localizes recovery in ${language}`, async () => {
    harness.language = language; const f = await mount(); expect(f.html).toContain(title); expect(f.html).not.toContain('En kontoflytning skal afsluttes')
  })
})
