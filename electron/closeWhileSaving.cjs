// Closing the app while a change was still on its way to the shared drive used to cut the write off after 10 s,
// and a write on M: has taken 80 s (07.11) - so a deleted vacation could come back. Now the window stays open with
// a short message while something is being saved and closes by itself when it is done.
const TEXTS = {
  da: { message: 'Gemmer dine sidste ændringer …', detail: 'Det fælles drev er langsomt lige nu. Appen lukker af sig selv, så snart alt er gemt.', button: 'Luk alligevel' },
  en: { message: 'Saving your last changes …', detail: 'The shared drive is slow right now. The app closes by itself as soon as everything is saved.', button: 'Close anyway' },
  fi: { message: 'Tallennetaan viimeisiä muutoksiasi …', detail: 'Jaettu asema on juuri nyt hidas. Sovellus sulkeutuu itsestään, kun kaikki on tallennettu.', button: 'Sulje silti' },
  sv: { message: 'Sparar dina senaste ändringar …', detail: 'Den delade enheten är långsam just nu. Appen stängs av sig själv så snart allt är sparat.', button: 'Stäng ändå' },
}

function savingMessage(language) {
  const text = TEXTS[language] || TEXTS.da
  return { type: 'info', title: 'Supply Chain Hub', message: text.message, detail: text.detail, buttons: [text.button], defaultId: 0, cancelId: 0, noLink: true }
}

/**
 * `confirmClose` (optional) is asked first: false keeps the window open, true (or a failure) goes on to close. The
 * saving guard below still holds the window while a write is on its way.
 * @param {{ hasPendingWrites: () => boolean, whenSaved: () => Promise<unknown>,
 *   showMessage: (options: object, signal: AbortSignal) => Promise<unknown>, language: () => string,
 *   confirmClose?: () => Promise<boolean> }} deps
 */
function guardCloseWhileSaving(win, { hasPendingWrites, whenSaved, showMessage, language, confirmClose = null }) {
  let allowClose = false
  let waiting = false
  let confirmed = false
  win.on('close', event => {
    if (allowClose) return
    if (waiting) { event.preventDefault(); return }
    if (confirmClose && !confirmed) {
      event.preventDefault()
      waiting = true
      let asking
      try { asking = Promise.resolve(confirmClose()) } catch (error) { asking = Promise.reject(error) }
      asking.then(answer => answer !== false, () => true).then(close => {
        waiting = false
        if (!close || win.isDestroyed()) return
        confirmed = true
        win.close()
      })
      return
    }
    if (!hasPendingWrites()) return
    event.preventDefault()
    waiting = true
    const controller = new AbortController()
    const closeNow = () => {
      if (allowClose) return
      allowClose = true
      controller.abort()
      if (!win.isDestroyed()) win.close()
    }
    // Whichever comes first: everything saved, or the user chose "Luk alligevel".
    Promise.resolve(whenSaved()).then(closeNow, closeNow)
    Promise.resolve(showMessage(savingMessage(language()), controller.signal)).then(closeNow, closeNow)
  })
}

module.exports = { guardCloseWhileSaving, savingMessage }
