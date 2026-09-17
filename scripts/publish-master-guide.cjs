// Udgiver den komplette "Saadan bruger du Supply Chain Hub"-guide som DELT guide
// paa tvaers af ALLE teams (samme mekanisme som appens delte guides: _shared/
// shared-guides med sharedWithTeamCodes = alle team-koder). Idempotent: koeres
// den igen, erstattes guiden (fast id) og versionen bumpes.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = 'M:\\372000 - SC All Employees\\ai Tools\\Supply Chain Hub Storage'
const SHARED_DIR = path.join(ROOT, '_shared')
const ALL_TEAMS = ['TCD', 'TRR', 'PIM', 'BPO', 'SCT', 'TSS', 'SCN']
const GUIDE_ID = 'guide_sch_komplet_haandbog'
const ENC_KEY = crypto.scryptSync('tcd-hub-storage-v1', 'tcd-hub-static-salt', 32)

function readKey(dir, key) {
  const file = path.join(dir, encodeURIComponent(key) + '.json')
  if (!fs.existsSync(file)) return undefined
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (parsed && typeof parsed === 'object' && parsed.__enc === 1) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(parsed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8'))
  }
  return parsed
}
function writeKey(dir, key, value) {
  const json = JSON.stringify(value)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const payload = JSON.stringify({ __enc: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
  const target = path.join(dir, encodeURIComponent(key) + '.json')
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, payload)
  // SMB kan kortvarigt holde maalfilen aaben (app-watcher) -> EPERM; proev igen.
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, target); return } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 14) { try { fs.unlinkSync(tmp) } catch { /* behold intet affald */ } throw error }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350)
    }
  }
}

let counter = 0
const sid = () => `section_haandbog_${(++counter).toString(36)}`
const stid = () => `step_haandbog_${(++counter).toString(36)}`
// Kildeteksten er skrevet ASCII-sikkert (aa/oe/ae); konverteres til rigtige
// danske tegn her. Gaelder KUN tekstfelter - aldrig id'er. Indholdet er
// verificeret frit for engelske ord med de digrafer.
const danish = value => value
  .replace(/Aa(?=[a-z])/g, '\u00c5').replace(/aa/g, '\u00e5')
  .replace(/AE(?=[a-z])/g, '\u00c6').replace(/Ae(?=[a-z])/g, '\u00c6').replace(/ae/g, '\u00e6')
  .replace(/OE(?=[a-z])/g, '\u00d8').replace(/Oe(?=[a-z])/g, '\u00d8').replace(/oe/g, '\u00f8')
const S = (heading, steps) => ({ id: sid(), heading: danish(heading), steps: steps.map(text => ({ id: stid(), text: danish(text), imageIds: [] })) })

const sections = [
  S('1. Log ind og kom i gang', [
    'Opret konto: Aabn appen og vaelg "Opret konto" paa loginskaermen. Udfyld navn, arbejds-email og adgangskode. Din konto faar status "afventer", indtil en manager godkender den i Manager Panel — foerst derefter kan du logge ind.',
    'Log ind: Skriv din email ELLER dit brugernavn samt adgangskode. Appen husker din session, saa du normalt ikke skal logge ind igen naeste gang. Efter laengere tids inaktivitet logges du automatisk ud af sikkerhedshensyn.',
    'Glemt adgangskode: Kontakt din manager, som kan saette en ny adgangskode til dig via Manager Panel. Ved foerste login efter nulstilling boer du aendre den under din profil.',
    'Profil: Klik paa dit navn/avatar oeverst paa forsiden for at rette telefonnummer og se dine kontooplysninger.',
    'Fejlen "Kunne ikke oprette forbindelse": Appen gemmer alle data paa det faelles netvaerksdrev. Faar du denne besked, saa vent et oejeblik og proev igen — lageret kan kortvarigt vaere optaget af en anden klient.',
  ]),
  S('2. Forsiden (dashboard)', [
    'Forsiden samler alt det vigtigste: dine opgaver i dag, "Team status i dag", hvem der er fri/syg/hjemme, dagens ret fra madplanen samt opslagstavlen med firmameddelelser.',
    'Notifikationscenter: Klokken oeverst samler ulaeste beskeder, ferieanmodninger (for managere), guide-reviews og foedselsdage — ét sted.',
    '"Siden sidst": Logger du ind efter en pause, viser appen en kort oversigt over, hvad der er sket siden dit sidste besoeg.',
    'Tilpas widgets: Klik paa tandhjulet ved widgets for at vise/skjule dem og aendre stoerrelse (kompakt/standard/stor). Indstillingerne er personlige og gaelder kun dig.',
    'Team status i dag: Se hver kollegas status — opgave, kommentar, ferie eller sygdom. Du kan tildele en opgave direkte med "Tilfoej opgave" og skrive/rette en kommentar med blyanten — ogsaa for kolleger uden opgave (fx "gaar tidligt").',
  ]),
  S('3. Sprog og tema', [
    'Skift sprog: Brug sprogvaelgeren (flag/globus-ikonet). Appen findes paa dansk, engelsk og finsk. Alt indhold i moduler og hos Hubert foelger dit valg.',
    'Skift tema: Brug tema-knappen for at skifte mellem lyst/moerkt eller egne temaer. Under temaer kan du med Theme Builder bygge dit eget farvetema og gemme det.',
  ]),
  S('4. To Do (opgavestyring)', [
    'Aabn To Do fra forsiden. Modulet har to spor: team-to-do\'s (faelles for teamet) og personlige to-do\'s (kun dig).',
    'Opret en opgave: Klik "Tilfoej opgave", giv den titel og evt. beskrivelse. Opgaver kan ogsaa oprettes direkte fra forsidens Team status-widget.',
    'Kommentarer: Aabn en opgave for at tilfoeje kommentarer, saa teamet kan foelge status og aftaler.',
    'Afslut: Markér opgaven som faerdig, naar den er loest — den flyttes til de afsluttede.',
  ]),
  S('5. Vagtplan', [
    'Aabn Vagtplan fra forsiden. Her ser du ugens opgaver (roller) fordelt paa personer og dage.',
    'Roller: Managere opretter og farvelaegger roller (fx Packing, Receiving) i Manager Panel. Farverne gaar igen i hele appen.',
    'Tildel en vagt: Klik paa en dag/person og vaelg rollen. Med "Tilfoej Opgaver til Hel Uge" kan du tildele samme opgave hele ugen paa én gang.',
    'Kommentarer: Hver tildeling kan have en kommentar (fx "moder kl. 10"). Kommentaren vises ogsaa paa forsidens Team status.',
    'Naviger uger: Brug pilene til at bladre mellem uger — du kan baade planlaegge frem og se tilbage.',
  ]),
  S('6. Ferie og fravaer', [
    'Anmod om ferie: Aabn Feriekalenderen, vaelg periode og send anmodningen. Din manager faar besked og godkender/afviser i Manager Panel.',
    'Se teamets ferie: Kalenderen viser alle godkendte ferier i dit team, farvekodet pr. medarbejder. Manager kan ogsaa registrere ferie direkte for en medarbejder.',
    'Sygemelding: Registrér sygdom via "Sygemelding"-knappen paa forsiden. Manageren godkender registreringen. Syge kolleger vises paa forsiden i dag-oversigten.',
    'Hjemmearbejde: Faste hjemmearbejdsdage saettes som moenster (ugedage) og kan fraviges med undtagelser paa enkeltdage. Forsiden har en samlet "Hjemmearbejde i Supply Chain"-oversigt paa tvaers af alle teams.',
    'Bemaerk: Ferie og sygdom skjuler automatisk personen fra hjemmearbejds- og tilgaengeligheds-visninger de paagaeldende dage.',
  ]),
  S('7. Madplan', [
    'Aabn Madplan fra forsiden. Madplanen er faelles paa tvaers af teams og viser mandag-fredag pr. uge.',
    'Se en bestemt uge: Bladr med pilene eller spoerg Hubert, fx "hvad faar vi at spise paa torsdag?" eller "madplan uge 40".',
    'Redigér (hvis du har rettigheder): Klik paa en dag og skriv retten. AEndringer slaar igennem hos alle med det samme.',
    'Dagens ret vises automatisk paa forsiden i "Dagens ret"-widgetten.',
  ]),
  S('8. Teamoversigt', [
    'Aabn Teamoversigt for at se alle godkendte kolleger i dit team: navn, brugernavn, telefonnummer, rolle (manager/medarbejder) og foedselsdag.',
    'Foedselsdage: Naar en kollega har foedselsdag, fejres det automatisk paa forsiden. Foedselsdage registreres i Teamoversigten.',
    'Medarbejderfarver: Hver kollega har en farve, som gaar igen i vagtplan, feriekalender og team-status. Manageren kan aendre farverne i Manager Panel.',
    'Paa tvaers af teams: Du kan se navne og roller for ANDRE teams via Hubert (fx "personer i BPO") eller i faelleshubs — aldrig deres opgaver, fravaer eller kontaktdetaljer.',
  ]),
  S('9. Notesbog', [
    'Aabn Notesbogen fra forsiden. Der findes personlige noter (kun dig) og faelles noter (hele teamet).',
    'Opret en note: Klik "Ny note", skriv titel og indhold, og tilfoej evt. tags saa noten er let at finde igen.',
    'Fastgoer vigtige noter, saa de ligger oeverst. Redigerer en kollega en faelles note, du har oprettet, faar du en notifikation.',
    'Soeg: Brug soegefeltet eller spoerg Hubert, fx "find min note om terminaler".',
  ]),
  S('10. Beskeder (intern mail)', [
    'Aabn Beskeder fra forsiden. Her sender og modtager du interne beskeder til/fra kolleger i dit team.',
    'Ny besked: Klik "Ny besked", vaelg modtager, skriv emne og indhold, og send. Modtageren ser den i sit notifikationscenter.',
    'Mapper: Organisér din indbakke med egne mapper. Ulaeste beskeder taelles paa forsiden.',
    'Notifikationer: Vigtige haendelser (ferieanmodninger, guide-reviews, systembeskeder) kan ogsaa lande som beskeder.',
  ]),
  S('11. Guide-biblioteket: find og laes', [
    'Aabn Guide Bibliotek fra forsiden. Guides er opdelt i kategorier (fx Procedures, Technical, HR) og kan soeges med fritekst.',
    'Aabn en guide for at laese den trin for trin med billeder. Versionsnummeret (fx v1.03) og forfatteren staar paa guiden.',
    'Oversaettelse: En guide kan laeses paa dansk, engelsk eller finsk via den indbyggede oversaettelse (Bergamot) — vaelg sprog i guide-visningen.',
    'Word: En guide kan eksporteres som Word-dokument (.docx), og Word-filer kan importeres som udkast til nye guides.',
    'Adgang paa tvaers: Ser du en guide fra et andet team (deling), kan du anmode om adgang; ejer-teamet godkender. Delte guides (som denne) er tilgaengelige for alle teams automatisk.',
  ]),
  S('12. Guide-biblioteket: skriv og udgiv (review-flow)', [
    'Opret: Klik "Ny guide", giv titel, kategori, tags og evt. forsidebillede. Indholdet bygges som sektioner med nummererede trin — hvert trin kan have billeder.',
    'Send til review: Guiden udgives IKKE direkte. Naar du gemmer, sendes den til review-koeen, hvor en Guide Admin eller manager godkender den. Foerst ved godkendelse bliver den synlig for alle.',
    'Rettelser: Faar du guiden retur med kommentar, kan du rette og indsende igen. Du kan ogsaa selv traekke den tilbage som kladde eller kassere anmodningen helt.',
    'Versioner: Hver godkendt gemning bumper versionen (1.00 -> 1.01 ...). Versionshistorikken gemmes, og en tidligere version kan gendannes — gendannelsen skal ogsaa godkendes.',
    'Sletning og arkiv: Sletning kraever ogsaa godkendelse. Slettede guides arkiveres og kan gendannes fra arkivet af en reviewer.',
    'Guide Admins: Manageren udpeger Guide Admins i Manager Panel. En Guide Admin maa godkende andres guides, men aldrig sine egne — en manager maa godkende alt.',
  ]),
  S('13. Hubert — din AI-assistent', [
    'Aabn Hubert med hundeikonet nederst til hoejre eller genvejen Ctrl+S. Hubert svarer paa dansk, engelsk og finsk — han foelger automatisk sproget i DIT spoergsmaal.',
    'Hubert kan slaa alt op i hubben: opgaver ("hvilke opgaver har jeg naeste uge?"), madplan, ferie, sygdom, hjemmearbejde (paa tvaers af alle teams), personer, noter, beskeder, projekter, highscores og guides.',
    'Svaere sammenhaenge: Hubert kombinerer moduler — proev "Hvor er [kollega] i dag?", "Hvem er paa arbejde i morgen?", "Hvornaar er [kollega] tilbage?", "Hvem har flest opgaver i naeste uge?" eller "Kolliderer nogen vagter med ferie?".',
    'Opfoelgninger: Hubert forstaar korte opfoelgninger som "og Bo?" (skifter person) eller "og fredag?" (skifter dag).',
    'Aktivér AI-svar: Foerste gang kan du trykke "Aktivér AI-svar" i chatten — saa hentes AI-modellen én gang fra det faelles drev til din pc, og Hubert formulerer svar i naturligt sprog og kan laese guidebilleder. Uden modellen virker alle opslag stadig — bare uden AI-formuleringen. AI-svar kraever ca. 7 GB fri RAM.',
    'Kilder: Hubert viser altid sine kilder under svaret. Han kan kun LAESE data — han kan aldrig aendre, godkende eller slette noget, og han ser kun det, DU har adgang til.',
  ]),
  S('14. Spil (Arcade og Modern)', [
    'Aabn Spilhjoernet fra forsiden. Arcade indeholder fem klassikere: Chickeninvasion, Brick Break, Nexi Flyer, Tetris og Neon Snake. Modern indeholder Cube Basher og The Librarian 2.',
    'Styring: Spillene styres med mus og/eller piletaster/WASD — styringen vises paa hvert spils startskaerm. De fleste har svaerhedsgrader (Let/Mellem/Svaer/Ekspert).',
    'Highscores: Dine bedste resultater gemmes pr. spil og svaerhedsgrad og taeller paa tvaers af alle teams. Spoerg Hubert "hvem foerer i Tetris?" for stillingen.',
    'Escape lukker spillet og gaar tilbage til menuen — dine data er der stadig.',
  ]),
  S('15. Manager Panel (kun managere)', [
    'Godkend brugere: Nye konti lander som "afventer". Godkend eller afvis dem under Brugere. Her kan du ogsaa nulstille adgangskoder og rette roller.',
    'Ferie- og sygeanmodninger: Godkend/afvis medarbejdernes anmodninger. Du kan ogsaa tildele ferie manuelt.',
    'Vagtplan-roller: Opret rollerne (opgavetyperne) med navn og farve, som bruges i vagtplanen.',
    'Medarbejderfarver: Vaelg hver medarbejders farve — den bruges i vagtplan, kalender og teamoversigt.',
    'Guide Admins: Udpeg hvem der maa godkende guide-reviews ud over dig selv.',
    'Klientversioner: Se hvilken app-version hver bruger koerer, og skub en bestemt version ud til dem, der er bagud.',
  ]),
  S('16. App-opdateringer', [
    'Appen tjekker automatisk for nye versioner (ca. hvert kvarter) og viser et opdaterings-vindue, naar en ny version er publiceret. Ét klik — appen opdaterer og genstarter selv.',
    'Publicér (manager/creator): Under Datalagring -> App-opdateringer vaelges den nye .zip fra release-mappen, og der trykkes Publicér. Alle klienter faar derefter opdateringen automatisk.',
    'Ser du et vandmaerke med versionsnummer, koerer du en aeldre version end den publicerede — genstart appen eller brug opdaterings-vinduet.',
  ]),
  S('17. Faelleshubs (paa tvaers af teams)', [
    'En faelleshub er en skrivebeskyttet visning, der samler flere teams — fx faelles feriekalender, vagtplaner, personer og guides.',
    'Har du adgang til en faelleshub, vaelger du den paa skaermen lige efter login (eller via profilmenuen). Alt i en faelleshub er laes-kun.',
    'Hubert virker ogsaa i faelleshubs, men holder sig til de teams, visningen daekker.',
  ]),
  S('18. Data, offline og sikkerhed', [
    'Alle data gemmes krypteret paa det faelles netvaerksdrev — intet gemmes i skyen, og intet forlader virksomhedens netvaerk. AI-svar genereres 100 % lokalt paa din egen pc.',
    'Offline: Mister du forbindelsen til drevet, viser appen en forbindelses-banner. Dine aendringer gemmes i en lokal koe og synkroniseres automatisk, naar forbindelsen er tilbage.',
    'Konflikter: Redigerer to personer det samme samtidigt, beskytter appen mod overskrivning og beder den ene part genindlaese.',
    'Backup (creator): Hele datalageret kan eksporteres som én backup-fil og importeres igen, fx ved versionsmigrering.',
  ]),
  S('19. Genveje og gode vaner', [
    'Ctrl+K: Aabn kommandopaletten og hop direkte til ethvert modul med faa tastetryk.',
    'Ctrl+S: Aabn/luk Hubert. Escape: Gaa et niveau tilbage (lukker dialog -> modul -> forside).',
    'Brug forslag-chipsene i Hubert til at opdage, hvad han kan.',
    'Se "Hvad er nyt"-dialogen efter en opdatering — den viser kort, hvad der er aendret i den nye version.',
  ]),
]

const now = Date.now()
const guide = {
  id: GUIDE_ID,
  schemaVersion: 2,
  title: danish('Supply Chain Hub — den komplette haandbog'),
  category: 'General',
  tags: ['haandbog', 'manual', 'hjaelp', 'kom i gang', 'alle moduler'].map(danish),
  language: 'da',
  content: danish('Den komplette haandbog til Supply Chain Hub: login, forside, To Do, vagtplan, ferie/fravaer, madplan, teamoversigt, notesbog, beskeder, guides og review-flow, Hubert AI, spil, Manager Panel, opdateringer, faelleshubs, datasikkerhed og genveje.'),
  sections,
  version: '1.00',
  author: 'Supply Chain Hub',
  createdBy: 'jacob.remmer.creator@nexigroup.com',
  updatedBy: 'jacob.remmer.creator@nexigroup.com',
  createdAt: now,
  updatedAt: now,
  reviewIntervalMonths: null,
  nextReviewAt: null,
  sharedWithTeamCodes: ALL_TEAMS,
}

const existing = readKey(SHARED_DIR, 'shared-guides') || []
const bump = version => ((Math.round(Number.parseFloat(version || '1.00') * 100) + 1) / 100).toFixed(2)
const previous = existing.find(item => item.id === GUIDE_ID)
if (previous) { guide.version = bump(previous.version); guide.createdAt = previous.createdAt }
const next = [guide, ...existing.filter(item => item.id !== GUIDE_ID)]

fs.mkdirSync(path.join(ROOT, 'Backup'), { recursive: true })
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const sharedFile = path.join(SHARED_DIR, 'shared-guides.json')
if (fs.existsSync(sharedFile)) fs.copyFileSync(sharedFile, path.join(ROOT, 'Backup', `shared-guides-before-haandbog-${stamp}.json`))
writeKey(SHARED_DIR, 'shared-guides', next)

const verify = readKey(SHARED_DIR, 'shared-guides')
const written = verify.find(item => item.id === GUIDE_ID)
console.log(`Udgivet: "${written.title}" v${written.version}`)
console.log(`Sektioner: ${written.sections.length} · Trin i alt: ${written.sections.reduce((total, section) => total + section.steps.length, 0)}`)
console.log(`Delt med: ${written.sharedWithTeamCodes.join(', ')}`)
// Kontrol: ingen tilbagevaerende ASCII-digrafer i den udgivne tekst.
const flat = JSON.stringify(written.sections.map(section => [section.heading, section.steps.map(step => step.text)])) + written.title + written.content
const leftovers = flat.match(/[a-zA-Z]*(?:aa|ae|oe)[a-zA-Z]*/g)
console.log(leftovers ? `ADVARSEL - ukonverterede ord: ${[...new Set(leftovers)].slice(0, 10).join(', ')}` : 'Tegn-kontrol: OK (ingen digrafer tilbage)')
