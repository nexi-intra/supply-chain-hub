// The spellchecker follows the language the user picked in the app, not the Electron locale (en-US on most work PCs).
const DICTIONARIES = { da: 'da', sv: 'sv', en: 'en-US' }

/** Dictionaries for an app language; English stays on so English terms are not marked. Empty = turn checking off. */
function spellcheckLanguages(language, available) {
  const own = DICTIONARIES[language]
  // No Finnish dictionary ships with Chromium: underlining every Finnish word is worse than no checking.
  if (!own || !available.includes(own)) return []
  return [...new Set([own, 'en-US'])].filter(code => available.includes(code))
}

function applySpellcheckLanguage(session, language) {
  const languages = spellcheckLanguages(language, session.availableSpellCheckerLanguages)
  session.setSpellCheckerEnabled(languages.length > 0)
  if (languages.length) session.setSpellCheckerLanguages(languages)
  return languages
}

module.exports = { spellcheckLanguages, applySpellcheckLanguage }
