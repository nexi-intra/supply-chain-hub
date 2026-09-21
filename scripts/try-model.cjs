// Ad hoc kvalitetstest af en model i allowlisten. Kun udviklerbrug.
const { createLocalAI } = require('../electron/localAI.cjs')
const { buildHubertSystemPrompt, buildGeneralSystemPrompt } = require('../electron/assistantPersona.cjs')

const modelId = process.argv[process.argv.indexOf('--model') + 1] || '4b'
const onlyFlag = process.argv.indexOf('--only')
const only = onlyFlag < 0 ? null : process.argv[onlyFlag + 1].toLowerCase()
const repeatFlag = process.argv.indexOf('--repeat')
const repeat = repeatFlag < 0 ? 1 : Number(process.argv[repeatFlag + 1])
const ai = createLocalAI({ defaultModelId: modelId, minimumFreeGiB: 0 })

const EVIDENCE = `Vagtplan (Vagtplan-modulet, tile "Vagtplan" paa Hubben)
Saadan melder du dig syg:
1. Aabn Kalender fra Hubben.
2. Vaelg fanen "Sygdom".
3. Tryk "Meld sygdom" og vaelg foerste sygedag.
4. Tryk Gem. Din leder faar besked automatisk.
Bemaerk: Sygemelding fjerner dig automatisk fra vagter i perioden.`

const CASES = [
  { label: 'Grounded DA (app-vejledning)', system: () => buildHubertSystemPrompt('da'),
    user: `Spoergsmaal: Hvordan melder jeg mig syg?\n\nEvidens:\n${EVIDENCE}`, temperature: 0 },
  { label: 'Grounded EN (oversaettelse af dansk evidens)', system: () => buildHubertSystemPrompt('en'),
    user: `Question: How do I report sick leave?\n\nEvidence:\n${EVIDENCE}`, temperature: 0 },
  { label: 'Grounded DA (maa IKKE opfinde)', system: () => buildHubertSystemPrompt('da'),
    user: `Spoergsmaal: Hvor mange feriedage har jeg tilbage?\n\nEvidens:\n${EVIDENCE}`, temperature: 0 },
  { label: 'Generel DA', system: () => buildGeneralSystemPrompt('da'),
    user: 'Forklar kort hvad forskellen er paa en palle og en container i logistik.', temperature: 0.6 },
  { label: 'Generel DA (skal afvise hub-data)', system: () => buildGeneralSystemPrompt('da'),
    user: 'Hvem har vagt paa lageret i morgen?', temperature: 0.6 },
  // Grounding: evidensen daekker IKKE spoergsmaalet. Modellen skal sige det
  // rent ud og maa ikke opfinde et modul, menupunkt eller tal.
  { label: 'Grounding: tom evidens', system: () => buildHubertSystemPrompt('da'),
    user: 'Spoergsmaal: Hvor mange feriedage har jeg tilbage?\n\nEvidens:\n(ingen relevante oplysninger fundet)', temperature: 0 },
  { label: 'Grounding: data findes', system: () => buildHubertSystemPrompt('da'),
    user: `Spoergsmaal: Hvem har aftenvagt paa fredag?\n\nEvidens:\n[1] Vagter fredag 2026-09-25:\n- Morgenvagt: Anna Jensen\n- Aftenvagt: Peter Madsen\n- Nattevagt: (ingen tildelt)`, temperature: 0 },
  { label: 'Grounding: fravaer er ikke fridag', system: () => buildHubertSystemPrompt('da'),
    user: `Spoergsmaal: Har Anna fri paa loerdag?\n\nEvidens:\n[1] Vagter loerdag 2026-09-26: ingen registrerede vagter for Anna Jensen.`, temperature: 0 },
]

async function main() {
  console.log(`Model: ${modelId}\n${'='.repeat(70)}`)
  for (const test of CASES.filter(test => !only || test.label.toLowerCase().includes(only))) {
    for (let attempt = 1; attempt <= repeat; attempt++) {
      const startedAt = Date.now()
      try {
        const result = await ai.complete([
          { role: 'system', content: test.system() },
          { role: 'user', content: test.user },
        ], { maxTokens: 512, temperature: test.temperature })
        console.log(`\n--- ${test.label}${repeat > 1 ? ` #${attempt}` : ''} --- (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`)
        console.log(result.text.trim())
      } catch (error) {
        console.log(`\n--- ${test.label} --- FEJL: ${error.message}`)
      }
    }
  }
  ai.stop()
}

main().catch(error => { console.error(error); ai.stop(); process.exitCode = 1 })
