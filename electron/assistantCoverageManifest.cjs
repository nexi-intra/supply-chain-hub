// Round 13 coverage audit data: which app-guide entry explains each piece of the real UI, and one probe question per feature in every language.
// The test (assistantCoverageAudit.test.cjs) derives tiles, views, panel tabs, dashboard cards and UI components from src/ and fails when one of them is missing here or in the guide.
const { APP_GUIDE, APP_TOPICS, formatAppGuide } = require('./assistantAppGuide.cjs')

// A guide target is "module", "module:task" or "topic:id".
function resolveTarget(target) {
  if (target.startsWith('topic:')) { const topic = APP_TOPICS.find(entry => entry.id === target.slice(6)); return topic ? { kind: 'topic', topic } : null }
  const [moduleId, taskId] = target.split(':')
  const module_ = APP_GUIDE.find(entry => entry.id === moduleId)
  if (!module_) return null
  if (!taskId) return { kind: 'module', module: module_ }
  const task = module_.tasks.find(entry => entry.id === taskId)
  return task ? { kind: 'task', module: module_, task } : null
}
// First line of the answer for a target in a language ("Module - Task", or the title of a module/topic).
const firstLine = (target, language) => formatAppGuide([resolveTarget(target)], language).split('\n')[0]

// Guide targets are "module", "module:task" or "topic:id".
// src/components/** and src/views/**: every file maps to a guide target, or is internal (no user-facing feature of its own).
const INTERNAL = 'internal'
const COMPONENT_MAP = {
  'views/AdminPanel.tsx': 'admin',
  'views/Arcade.tsx': 'games:play-game',
  'views/Auth.tsx': INTERNAL, // login/signup: Hubert is only available after login
  'views/BackgammonLobby.tsx': 'multiplayer:backgammon-challenge',
  'views/ChessLobby.tsx': 'multiplayer:chess-challenge',
  'views/CreatorPanel.tsx': 'creator',
  'views/EmailSystem.tsx': 'email',
  'views/GameCorner.tsx': 'games:game-sections',
  'views/GuideLibrary.tsx': 'guides',
  'views/Hub.tsx': 'hub',
  'views/Improvements.tsx': 'improvements',
  'views/LinkLibrary.tsx': 'links',
  'views/ManagerPanel.tsx': 'manager',
  'views/MealPlan.tsx': 'meals:view-meal-plan',
  'views/Modern.tsx': 'games:game-sections',
  'views/Multiplayer.tsx': 'multiplayer',
  'views/MultiplayerHub.tsx': 'multiplayer',
  'views/ProjectBoard.tsx': 'projects',
  'views/ShiftSchedule.tsx': 'shifts',
  'views/TeamOverview.tsx': 'team',
  'views/VacationCalendar.tsx': 'calendar',
  'views/VirtualNotebook.tsx': 'notebook',
  'components/AccountMigrationRecovery.tsx': INTERNAL, // account-recovery screen shown instead of the app
  'components/AnimatedBackground.tsx': INTERNAL,
  'components/AnnouncementsBoard.tsx': 'hub:post-announcement',
  'components/ArcadeReadyOverlay.tsx': INTERNAL,
  'components/AssistantChatWindow.tsx': 'topic:assistant',
  'components/AutoText.tsx': INTERNAL,
  'components/BirthdayCelebration.tsx': 'manager:manage-birthdays',
  'components/CategoryManager.tsx': 'guides:manage-categories',
  'components/ClientVersionManager.tsx': 'creator:publish-update',
  'components/CommandPalette.tsx': 'hub:quick-navigation',
  'components/HubPicker.tsx': 'hub:switch-hub',
  'components/HubSwitchController.tsx': 'hub:switch-hub',
  'components/ExtraManagersCard.tsx': 'hub:switch-hub',
  'components/CrossTeamManagersCard.tsx': 'creator:cross-team-managers',
  'components/CrossHubHighscores.tsx': 'games:play-game',
  'components/CubeBasherGame.tsx': 'games:game-sections',
  'components/DataStorageManager.tsx': 'creator:data-backup',
  'components/DatePickerField.tsx': INTERNAL,
  'components/DesktopNotificationBridge.tsx': 'topic:windows-notifications',
  'components/DesktopNotificationsSetting.tsx': 'topic:windows-notifications',
  'components/EmailNotifications.tsx': 'email:read-message',
  'components/EndlessRunner.tsx': 'games:game-sections',
  'components/GameLeaderboardAdmin.tsx': 'creator:edit-highscores',
  'components/GuideCard.tsx': 'guides',
  'components/GuideChat.tsx': 'guides',
  'components/GuideEditor.tsx': 'guides:create-guide',
  'components/GuideImportStatus.tsx': 'guides:import-word-guide',
  'components/GuideLinkPreview.tsx': INTERNAL,
  'components/GuideReviewAlert.tsx': 'guides:guide-review-due',
  'components/GuideReviewDashboard.tsx': 'guides:guide-review-due',
  'components/GuideRichText.tsx': INTERNAL,
  'components/GuideStepEditor.tsx': 'guides:create-guide',
  'components/GuideViewer.tsx': 'guides',
  'components/HomeOfficeDialog.tsx': 'calendar:home-office',
  'components/HubAssistant.tsx': 'topic:assistant',
  'components/HubertIcon.tsx': INTERNAL,
  'components/HubMark.tsx': INTERNAL, // the app logo and the module loader
  'components/HighFiveDialog.tsx': 'hub:send-high-five',
  'components/HighFivesCard.tsx': 'hub:send-high-five',
  'components/ImprovementCaseDialog.tsx': 'improvements:answer-invitation',
  'components/ImprovementCreateDialog.tsx': 'improvements:create-suggestion',
  'components/LanguageToggle.tsx': 'topic:appearance',
  'components/LoginDigest.tsx': 'hub:since-last-time',
  'components/ManualVacationGrant.tsx': 'manager:grant-vacation',
  'components/MyWeekCard.tsx': 'hub:my-week',
  'components/MyWeekQuickAdd.tsx': 'projects:create-todo',
  'components/NotificationCenter.tsx': 'hub:notification-bell',
  'components/OnboardingWizard.tsx': 'manager:onboard-user',
  'components/ParentalLeaveDialog.tsx': 'manager:register-parental',
  'components/PauseOverlay.tsx': INTERNAL,
  'components/SickLeaveDialog.tsx': 'calendar:sick-leave',
  'components/ShiftRoleDialog.tsx': 'shifts:roles', // the task dialog of Vagtplan, also used by Stempelkort
  'components/SingleDayOffDialog.tsx': 'calendar:single-day-off',
  'components/StorageConnectionBanner.tsx': 'topic:storage',
  'components/TimeRangeFields.tsx': INTERNAL,
  'components/TranslationScope.tsx': INTERNAL, // "Oversat fra … · Vis original" under auto-translated text
  'components/ThemeToggle.tsx': 'topic:appearance',
  'components/UpdateManager.tsx': 'creator:publish-update',
  'components/UpdateNotification.tsx': 'topic:updates',
  'components/UserProfile.tsx': 'topic:profile',
  'components/VacationRequestDialog.tsx': 'calendar:request-vacation',
  'components/VirtualizedTable.tsx': INTERNAL,
  'components/WhatsNewDialog.tsx': 'hub:whats-new',
  // Softwareload (Arbejdsværktøjer, TCD/TRR): every file of the tool folder is mapped one by one (see VIEW_FOLDERS).
  'views/warehouse/softwareload/Softwareload.tsx': 'warehouse:softwareload-start',
  'views/warehouse/softwareload/SoftwareloadTask.tsx': 'warehouse:softwareload-start', // also the "Fejlet" dialog: warehouse:softwareload-failed
  'views/warehouse/softwareload/SoftwareloadFinish.tsx': 'warehouse:softwareload-finish',
  'views/warehouse/softwareload/SoftwareloadPending.tsx': 'warehouse:softwareload-finish', // "Venter på SAP" is explained in the finish task
  'views/warehouse/softwareload/SoftwareloadPlan.tsx': 'warehouse:softwareload-finish', // SAP's plan on the finish screen and before "Fortsæt i SAP"
  'views/warehouse/softwareload/SoftwareloadStop.tsx': 'warehouse:softwareload-finish', // "Stop tiden nu, flyt i SAP senere" (finish screen and running task)
  'views/warehouse/softwareload/SoftwareloadKif.tsx': 'warehouse:softwareload-kif',
  'views/warehouse/softwareload/SoftwareloadSearch.tsx': 'warehouse:softwareload-search',
  'views/warehouse/softwareload/SoftwareloadStats.tsx': 'warehouse:softwareload-stats',
  'views/warehouse/softwareload/common.tsx': INTERNAL, // progress, result table and helpers shared by the tabs
}
// Sub-folders of src/views whose files are each mapped in COMPONENT_MAP (the other view folders are covered by their module).
const VIEW_FOLDERS = ['warehouse/softwareload']
// Sub-folders of src/components: one entry per folder.
const COMPONENT_FOLDERS = {
  arcade: 'games:play-game',
  backgammon: 'multiplayer:backgammon-move',
  boardgame: 'multiplayer:send-emoji',
  chess: 'multiplayer:chess-move',
  christmas: INTERNAL, // seasonal decoration; on purpose not in the app guide before it appears
  multiplayer: 'multiplayer',
  ui: INTERNAL,
  warehouse: 'warehouse',
}

// Panel tabs (TabsTrigger value) -> tasks that explain them. A tab without an entry here fails the audit.
const TAB_MAP = {
  'ManagerPanel:permissions': ['manager:approve-user', 'manager:permissions', 'manager:onboard-user', 'manager:offboard-user'],
  'ManagerPanel:vacation-requests': ['manager:bulk-approve', 'calendar:approve-vacation'],
  'ManagerPanel:vacation-overview': ['manager:manage-vacations', 'manager:grant-vacation', 'manager:register-parental'],
  'ManagerPanel:birthdays': ['manager:manage-birthdays'],
  'ManagerPanel:guide-access': ['manager:access-requests'],
  'AdminPanel:users': ['admin:admin-users'],
  'AdminPanel:shift-management': ['admin:admin-employees'],
  'CreatorPanel:teams': ['creator:manage-teams'],
  'CreatorPanel:games': ['creator:edit-highscores'],
  'CreatorPanel:data-storage': ['creator:publish-update', 'creator:data-backup'],
}

// Profile menu items (translations profile.menu*) -> the topic/module that names them.
const PROFILE_MAP = {
  menuSettings: 'topic:profile',
  menuAdminPanel: 'admin',
  menuCreatorPanel: 'creator',
  menuLogout: 'topic:profile',
}

// Dashboard cards (Hub.tsx dashboardOptions) are all explained by this task.
const DASHBOARD_TASK = 'hub:customize-dashboard'

// Probe questions: the answer must come from `id` for `role`. `gated` roles must NOT get that entry (they are pointed to the role explanation or the employee version).
// persona: A beginner, F manager, J creator.
const PROBES = [
  { id: 'hub:read-announcements', persona: 'A', q: { da: 'hvordan skjuler jeg et opslag?', en: 'how do I hide an announcement?', fi: 'miten piilotan ilmoituksen?', sv: 'hur döljer jag ett inlägg?' } },
  { id: 'hub:post-announcement', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan skriver jeg et opslag til alle?', en: 'how do I post an announcement?', fi: 'miten kirjoitan ilmoituksen kaikille?', sv: 'hur skriver jag ett inlägg till alla?' } },
  { id: 'hub:notification-bell', persona: 'A', q: { da: 'hvad er klokken oppe i hjørnet?', en: 'what is the bell icon at the top?', fi: 'mikä on kello ylhäällä?', sv: 'vad är klockan högst upp?' } },
  { id: 'hub:quick-navigation', persona: 'A', q: { da: 'findes der en tastaturgenvej til at skifte modul?', en: 'is there a keyboard shortcut to switch modules?', fi: 'onko pikanäppäin moduulien vaihtoon?', sv: 'finns det ett kortkommando för att byta modul?' } },
  { id: 'hub:customize-dashboard', persona: 'A', q: { da: 'hvordan skjuler jeg dagens mad på forsiden?', en: "how do I hide today's meal on the home page?", fi: 'miten piilotan päivän ruoan etusivulta?', sv: 'hur döljer jag dagens mat på startsidan?' } },
  { id: 'hub:since-last-time', persona: 'A', q: { da: "hvad er 'Siden sidst'?", en: "what is the 'Since last time' pop-up?", fi: 'mikä on Viime kerrasta lähtien?', sv: 'vad är Sedan sist?' } },
  { id: 'hub:send-high-five', persona: 'A', q: { da: 'hvordan sender jeg en high-five til en kollega?', en: 'how do I send a high-five to a colleague?', fi: 'miten lähetän high fiven kollegalle?', sv: 'hur skickar jag en high five till en kollega?' } },
  { id: 'hub:my-week', persona: 'A', q: { da: 'hvad viser kortet Min uge på forsiden?', en: 'what does the My week card on the home page show?', fi: 'mitä Oma viikkoni -kortti näyttää etusivulla?', sv: 'vad visar kortet Min vecka på startsidan?' } },
  { id: 'hub:morning-briefing', persona: 'A', q: { da: 'hvad er Huberts morgenbriefing?', en: 'what is the morning briefing from Hubert?', fi: 'mikä on Huberttin aamuyhteenveto?', sv: 'vad är Huberts morgonbriefing?' } },
  { id: 'hub:whats-new', persona: 'A', q: { da: 'hvor ser jeg hvad der er nyt i appen?', en: "where can I see what's new in the app?", fi: 'mistä näen mitä uutta sovelluksessa on?', sv: 'var ser jag vad som är nytt i appen?' } },
  { id: 'admin', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvor finder jeg Admin Panel?', en: 'where is the Admin Panel?', fi: 'missä Hallintopaneeli on?', sv: 'var hittar jag Admin Panel?' } },
  { id: 'admin:admin-employees', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan tilføjer jeg en medarbejder i Admin Panel?', en: 'how do I add an employee in the Admin Panel?', fi: 'miten lisään työntekijän Hallintopaneelissa?', sv: 'hur lägger jag till en medarbetare i Admin Panel?' } },
  { id: 'creator', persona: 'J', role: 'creator', gated: ['manager', 'user'], q: { da: 'hvad er Creator Panel?', en: 'what is the Creator Panel?', fi: 'mikä on Luojapaneeli?', sv: 'vad är Creator Panel?' } },
  { id: 'creator:manage-teams', persona: 'J', role: 'creator', gated: ['manager', 'user'], q: { da: 'hvordan opretter jeg et nyt team?', en: 'how do I create a new team?', fi: 'miten luon uuden tiimin?', sv: 'hur skapar jag ett nytt team?' } },
  { id: 'creator:switch-team', persona: 'J', role: 'creator', gated: ['manager', 'user'], q: { da: 'hvordan skifter jeg team?', en: 'how do I switch team?', fi: 'miten vaihdan tiimiä?', sv: 'hur byter jag team?' } },
  { id: 'creator:edit-highscores', persona: 'J', role: 'creator', gated: ['manager', 'user'], q: { da: 'hvordan sletter jeg en highscore?', en: 'how do I delete a highscore?', fi: 'miten poistan huipputuloksen?', sv: 'hur tar jag bort en highscore?' } },
  { id: 'creator:publish-update', persona: 'J', role: 'creator', gated: ['manager', 'user'], q: { da: 'hvordan publicerer jeg en opdatering?', en: 'how do I publish an update?', fi: 'miten julkaisen päivityksen?', sv: 'hur publicerar jag en uppdatering?' } },
  { id: 'creator:data-backup', persona: 'J', role: 'creator', gated: ['manager', 'user'], q: { da: 'hvordan tager jeg en backup?', en: 'how do I export a backup?', fi: 'miten otan varmuuskopion?', sv: 'hur gör jag en säkerhetskopia?' } },
  { id: 'calendar:single-day-off', persona: 'A', q: { da: 'hvordan melder jeg en enkelt fridag?', en: 'how do I request a single day off?', fi: 'miten haen yhden vapaapäivän?', sv: 'hur ansöker jag om en enstaka ledig dag?' } },
  { id: 'meals:view-meal-plan', persona: 'A', q: { da: 'hvordan kan jeg se tidligere madplaner?', en: 'how do I see previous meal plans?', fi: 'miten näen aiemmat ateriasuunnitelmat?', sv: 'hur kan jag se tidigare matsedlar?' } },
  { id: 'meals:edit-meal-plan', persona: 'A', q: { da: 'hvordan retter jeg madplanen?', en: 'how do I edit the meal plan?', fi: 'miten muokkaan ateriasuunnitelmaa?', sv: 'hur ändrar jag matsedeln?' } },
  { id: 'notebook:edit-note', persona: 'A', q: { da: 'hvordan sletter jeg en note?', en: 'how do I delete a note?', fi: 'miten poistan muistiinpanon?', sv: 'hur tar jag bort en anteckning?' } },
  { id: 'notebook:find-note', persona: 'A', q: { da: 'hvordan kan jeg finde en note?', en: 'how do I find a note?', fi: 'miten etsin muistiinpanon?', sv: 'hur kan jag hitta en anteckning?' } },
  { id: 'email:mail-folders', persona: 'A', q: { da: 'hvordan opretter jeg en mappe til mails?', en: 'how do I create a mail folder?', fi: 'miten luon sähköpostikansion?', sv: 'hur skapar jag en e-postmapp?' } },
  { id: 'email:mail-filter', persona: 'A', q: { da: 'hvordan filtrerer jeg mails efter afsender?', en: 'how do I filter emails by sender?', fi: 'miten suodatan viestit lähettäjän mukaan?', sv: 'hur filtrerar jag mejl på avsändare?' } },
  { id: 'team:other-teams', persona: 'A', q: { da: 'hvordan kan jeg se kolleger i andre teams?', en: 'how do I see colleagues in other teams?', fi: 'miten näen kollegat muissa tiimeissä?', sv: 'hur kan jag se kollegor i andra team?' } },
  { id: 'guides:manage-categories', persona: 'A', q: { da: 'hvordan administrerer jeg kategorier i guides?', en: 'how do I manage guide categories?', fi: 'miten hallitsen opaskategorioita?', sv: 'hur hanterar jag guidekategorier?' } },
  { id: 'guides:export-library', persona: 'A', q: { da: 'hvordan eksporterer jeg guide-biblioteket?', en: 'how do I export the guide library?', fi: 'miten vien oppaat?', sv: 'hur exporterar jag guidebiblioteket?' } },
  { id: 'multiplayer:backgammon-challenge', persona: 'A', q: { da: 'hvordan udfordrer jeg en kollega i backgammon?', en: 'how do I challenge a colleague to backgammon?', fi: 'miten haastan työkaverin backgammoniin?', sv: 'hur utmanar jag en kollega i backgammon?' } },
  { id: 'multiplayer:backgammon-move', persona: 'A', q: { da: 'hvordan flytter jeg mine brikker i backgammon?', en: 'how do I move my checkers in backgammon?', fi: 'miten siirrän nappuloita backgammonissa?', sv: 'hur flyttar jag mina brickor i backgammon?' } },
  { id: 'manager:bulk-approve', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan godkender jeg flere ferieanmodninger på én gang?', en: 'how do I approve several vacation requests at once?', fi: 'miten hyväksyn kaikki lomapyynnöt kerralla?', sv: 'hur godkänner jag flera semesterförfrågningar på en gång?' } },
  { id: 'manager:manage-vacations', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan kan jeg se ferieoversigten som leder?', en: 'how do I see the vacation overview as a manager?', fi: 'miten voin nähdä lomakatsauksen esihenkilönä?', sv: 'hur kan jag se semesteröversikten som chef?' } },
  { id: 'manager:manage-birthdays', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvor registrerer jeg fødselsdage?', en: 'where do I manage birthdays?', fi: 'mistä hallitsen syntymäpäiviä?', sv: 'var hanterar jag födelsedagar?' } },
  { id: 'manager:access-requests', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan godkender jeg adgangsanmodninger fra andre teams?', en: 'how do I approve access requests from other teams?', fi: 'miten käsittelen muiden tiimien pääsypyyntöjä?', sv: 'hur hanterar jag åtkomstförfrågningar från andra team?' } },
  { id: 'manager:onboard-user', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan tilføjer jeg en ny medarbejder?', en: 'how do I add a new employee?', fi: 'miten lisään uuden työntekijän?', sv: 'hur lägger jag till en ny medarbetare?' } },
  { id: 'manager:offboard-user', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan offboarder jeg en medarbejder?', en: 'how do I offboard an employee?', fi: 'miten poistan työntekijän käytöstä?', sv: 'hur tar jag bort en medarbetare?' } },
  { id: 'links:add-link', persona: 'A', q: { da: 'hvordan tilføjer jeg et link?', en: 'how do I add a link?', fi: 'miten lisään linkin?', sv: 'hur lägger jag till en länk?' } },
  { id: 'links:report-link', persona: 'A', q: { da: 'hvad gør jeg hvis et link ikke virker?', en: 'what do I do if a link does not work?', fi: 'mitä teen, jos linkki ei toimi?', sv: 'vad gör jag om länken inte fungerar?' } },
  { id: 'links:approve-link', persona: 'F', role: 'manager', gated: ['user'], q: { da: 'hvordan godkender jeg et link?', en: 'how do I approve a link?', fi: 'miten hyväksyn linkin?', sv: 'hur godkänner jag en länk?' } },
]

module.exports = { COMPONENT_MAP, COMPONENT_FOLDERS, VIEW_FOLDERS, TAB_MAP, PROFILE_MAP, DASHBOARD_TASK, PROBES, INTERNAL, resolveTarget, firstLine }
