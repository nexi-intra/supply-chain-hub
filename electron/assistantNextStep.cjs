// "No results" is a dead end unless it says what to try next: another period and the module to open.
const { moduleTitle } = require('./assistantAppGuide.cjs')

// The period an example is about, so a question that already asks for it gets another example.
const NEXT_WEEK = /næste uge|next week|ensi viik|nästa vecka/
const TODAY = /i dag|idag|today|tänään/
const TOMORROW = /i morgen|imorgen|tomorrow|huomenna|i morgon|imorgon/

const KINDS = {
  vacation: { module: 'calendar', same: NEXT_WEEK, example: { da: 'hvem har ferie næste uge?', en: 'who is on vacation next week?', fi: 'kuka on lomalla ensi viikolla?', sv: 'vem har semester nästa vecka?' }, other: { da: 'hvem har ferie denne uge?', en: 'who is on vacation this week?', fi: 'kuka on lomalla tällä viikolla?', sv: 'vem har semester den här veckan?' } },
  sick: { module: 'calendar', same: TODAY, example: { da: 'hvem er syg i dag?', en: 'who is sick today?', fi: 'kuka on sairaana tänään?', sv: 'vem är sjuk idag?' }, other: { da: 'hvem er syg i morgen?', en: 'who is sick tomorrow?', fi: 'kuka on sairaana huomenna?', sv: 'vem är sjuk imorgon?' } },
  home: { module: 'calendar', same: TOMORROW, example: { da: 'hvem arbejder hjemme i morgen?', en: 'who works from home tomorrow?', fi: 'kuka on etätöissä huomenna?', sv: 'vem jobbar hemifrån imorgon?' }, other: { da: 'hvem arbejder hjemme i dag?', en: 'who works from home today?', fi: 'kuka on etätöissä tänään?', sv: 'vem jobbar hemifrån idag?' } },
  tasks: { module: 'shifts', same: NEXT_WEEK, example: { da: 'hvilke opgaver har jeg næste uge?', en: 'what are my tasks next week?', fi: 'mitä tehtäviä minulla on ensi viikolla?', sv: 'vilka uppgifter har jag nästa vecka?' }, other: { da: 'hvilke opgaver har jeg i morgen?', en: 'what are my tasks tomorrow?', fi: 'mitä tehtäviä minulla on huomenna?', sv: 'vilka uppgifter har jag imorgon?' } },
  meals: { module: 'meals', same: TOMORROW, example: { da: 'hvad er der til frokost i morgen?', en: "what's for lunch tomorrow?", fi: 'mitä lounaaksi huomenna?', sv: 'vad är det för lunch imorgon?' }, other: { da: 'hvad er der til frokost i dag?', en: "what's for lunch today?", fi: 'mitä lounaaksi tänään?', sv: 'vad är det för lunch idag?' } },
  people: { module: 'team' },
  notes: { module: 'notebook' },
  messages: { module: 'email' },
  projects: { module: 'projects' },
  improvements: { module: 'improvements' },
  administration: { module: 'manager' },
  guides: { module: 'guides' },
  knowledge: { module: 'knowledge', plain: {
    da: module => `Prøv et andet søgeord, eller anmod om adgang til et andet teams artikel i «${module}».`,
    en: module => `Try another search word, or request access to another team's article in “${module}”.`,
    fi: module => `Kokeile toista hakusanaa tai pyydä pääsyä toisen tiimin artikkeliin kohdassa «${module}».`,
    sv: module => `Prova ett annat sökord, eller begär åtkomst till ett annat teams artikel i «${module}».`,
  } },
}
const TEXT = {
  da: { period: (example, module) => `Prøv en anden periode, fx «${example}», eller åbn «${module}» direkte.`, plain: module => `Prøv at omformulere spørgsmålet, eller åbn «${module}» direkte.` },
  en: { period: (example, module) => `Try another period, e.g. “${example}”, or open “${module}” directly.`, plain: module => `Try rephrasing the question, or open “${module}” directly.` },
  fi: { period: (example, module) => `Kokeile toista ajanjaksoa, esim. «${example}», tai avaa «${module}» suoraan.`, plain: module => `Kokeile muotoilla kysymys toisin tai avaa «${module}» suoraan.` },
  sv: { period: (example, module) => `Prova en annan period, t.ex. «${example}», eller öppna «${module}» direkt.`, plain: module => `Prova att formulera om frågan, eller öppna «${module}» direkt.` },
}

/** One sentence with a next step for an empty answer; '' for an unknown kind. */
function nextStep(language, kind, { period = true, asked = '' } = {}) {
  const entry = KINDS[kind]
  if (!entry) return ''
  const text = TEXT[language] || TEXT.da
  const module = moduleTitle(entry.module, language)
  // The example never repeats the period the question was already about.
  const examples = entry.other && entry.same?.test(String(asked).toLowerCase()) ? entry.other : entry.example
  const example = examples && (examples[language] || examples.da)
  if (entry.plain) return (entry.plain[language] || entry.plain.da)(module)
  return period && example ? text.period(example, module) : text.plain(module)
}

module.exports = { nextStep }
