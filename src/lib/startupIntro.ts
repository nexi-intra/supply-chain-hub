export function dismissStartupIntro(
  doc: Pick<Document, 'getElementById'> = document,
  { fadeMs = 400 }: { fadeMs?: number } = {},
): void {
  const intro = doc.getElementById('startup-intro')
  if (!intro || intro.classList.contains('is-leaving')) return
  intro.classList.add('is-leaving')
  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    intro.remove()
  }
  intro.addEventListener('transitionend', remove)
  // Fallback when no transition runs (reduced motion, hidden window).
  setTimeout(remove, fadeMs + 200)
}
