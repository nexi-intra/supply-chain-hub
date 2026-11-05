import type { Language } from './translations'
import type {
  ImprovementAssignmentKind,
  ImprovementAssignmentStatus,
  ImprovementCategory,
  ImprovementPreset,
  ImprovementView,
  ImprovementPriority,
  ImprovementSort,
  ImprovementStatus,
} from './improvements'

export interface ImprovementsLabels {
  title: string
  newSuggestion: string
  create: string
  save: string
  saving: string
  saved: string
  cancel: string
  close: string
  retry: string
  refresh: string
  loading: string
  unavailable: string
  loadError: string
  saveError: string
  empty: string
  noResults: string
  search: string
  searchPlaceholder: string
  filters: string
  clearFilters: string
  allStatuses: string
  allPriorities: string
  allTeams: string
  allPeople: string
  sortBy: string
  pendingInvitations: string
  caseTitle: string
  problem: string
  proposal: string
  category: string
  standardCategories: string
  customCategories: string
  newCategory: string
  newCategoryName: string
  newCategoryHint: string
  priority: string
  status: string
  originTeam: string
  affectedTeams: string
  person: string
  author: string
  createdAt: string
  updatedAt: string
  nextAction: string
  dueDate: string
  deadlines: string
  responseDueDate: string
  feedbackDueDate: string
  saveDeadlines: string
  noDeadline: string
  clearDeadline: string
  overdue: string
  details: string
  progress: string
  updateProgress: string
  assignments: string
  owner: string
  contributors: string
  unassigned: string
  noContributors: string
  invite: string
  invitePerson: string
  inviteKind: string
  selectPerson: string
  ownerHint: string
  selectTeam: string
  noPeople: string
  noTeams: string
  invitation: string
  invitationPending: string
  invitationAccepted: string
  invitationDeclined: string
  invitedBy: string
  invitedAt: string
  respondedAt: string
  acceptInvitation: string
  declineInvitation: string
  invitationSent: string
  invitationAcceptSuccess: string
  invitationDeclineSuccess: string
  ownerConflict: string
  comments: string
  comment: string
  addComment: string
  commentPlaceholder: string
  noComments: string
  commentSaved: string
  history: string
  noHistory: string
  submitForApproval: string
  submittedForApproval: string
  approve: string
  approved: string
  returnForChanges: string
  returnedForChanges: string
  reviewFeedback: string
  feedbackRequired: string
  readyForApproval: string
  approvalRequired: string
  acceptedOwnerRequired: string
  acceptedAssignmentRequired: string
  notifications: string
  unseenChanges: string
  unreadNotifications: string
  noNotifications: string
  markRead: string
  notificationInvitation: string
  notificationReview: string
  notificationReturned: string
  notificationApproved: string
  requiredFields: string
  titleRequired: string
  problemRequired: string
  proposalRequired: string
  commentRequired: string
  invalidDeadline: string
  permissionDenied: string
  conflict: string
  caseUnavailable: string
  deletion: string
  requestDeletion: string
  deletionReason: string
  deletionPending: string
  deletionRequests: string
  noDeletionRequests: string
  deleteCase: string
  deleteConfirmTitle: string
  deleteConfirmDescription: string
  confirmDelete: string
  rejectDeletion: string
  approveDeletion: string
  rejectionReason: string
  rejectionRequired: string
  deletionStatuses: Record<'pending' | 'rejected' | 'approved', string>
  statuses: Record<ImprovementStatus, string>
  categories: Record<ImprovementCategory, string>
  priorities: Record<ImprovementPriority, string>
  assignmentKinds: Record<ImprovementAssignmentKind, string>
  assignmentStatuses: Record<ImprovementAssignmentStatus, string>
  presets: Record<ImprovementPreset, string>
  views: Record<ImprovementView, string>
  sorts: Record<ImprovementSort, string>
}

export const IMPROVEMENTS_LABELS: Record<Language, ImprovementsLabels> = {
  da: {
    title: 'Forbedringer og forslag', newSuggestion: 'Nyt forslag', create: 'Opret forslag',
    save: 'Gem', saving: 'Gemmer...', saved: 'Gemt', cancel: 'Annuller', close: 'Luk',
    retry: 'Pr\u00f8v igen', refresh: 'Opdater', loading: 'Indl\u00e6ser forbedringer...',
    unavailable: 'Forbedringer er ikke tilg\u00e6ngelige i dette vindue.',
    loadError: 'Forbedringerne kunne ikke indl\u00e6ses.', saveError: '\u00c6ndringen kunne ikke gemmes. Pr\u00f8v igen.',
    empty: 'Ingen forbedringer endnu.',
    noResults: 'Ingen forbedringer matcher filtrene.', search: 'S\u00f8g',
    searchPlaceholder: 'S\u00f8g i titel, problem eller forslag', filters: 'Filtre', clearFilters: 'Ryd filtre',
    allStatuses: 'Alle statusser', allPriorities: 'Alle prioriteter', allTeams: 'Alle afdelinger',
    allPeople: 'Alle personer', sortBy: 'Sortering', pendingInvitations: 'Mine afventende invitationer',
    caseTitle: 'Titel', problem: 'Problem', proposal: 'Forslag til forbedring', category: 'Kategori',
    standardCategories: 'Faste kategorier', customCategories: 'Oprettet af kolleger', newCategory: '+ Ny kategori…',
    newCategoryName: 'Navn på den nye kategori', newCategoryHint: 'Bruges når ingen af de eksisterende kategorier passer. Den kan derefter vælges af alle.',
    priority: 'Prioritet', status: 'Status', originTeam: 'Oprindelig afdeling', affectedTeams: 'Ber\u00f8rte afdelinger',
    person: 'Ansvarlig eller bidragyder', author: 'Oprettet af', createdAt: 'Oprettet', updatedAt: 'Senest opdateret',
    nextAction: 'N\u00e6ste handling', dueDate: 'Opgavefrist', noDeadline: 'Ingen frist', clearDeadline: 'Fjern frist',
    deadlines: 'Frister', responseDueDate: 'Svarfrist for invitation', feedbackDueDate: 'Frist for tilbagemelding', saveDeadlines: 'Gem frister',
    overdue: 'Frist overskredet', details: 'Detaljer', progress: 'Fremdrift', updateProgress: 'Opdater fremdrift',
    assignments: 'Ansvar og bidragydere', owner: 'Ansvarlig', contributors: 'Bidragydere',
    unassigned: 'Ingen accepteret ansvarlig', noContributors: 'Ingen accepterede bidragydere',
    invite: 'Inviter', invitePerson: 'Inviter person', inviteKind: 'Rolle', selectPerson: 'V\u00e6lg person',
    ownerHint: 'V\u00e6lger du en anden end dig selv, f\u00e5r personen en invitation til at v\u00e6re ansvarlig.',
    selectTeam: 'V\u00e6lg afdeling', noPeople: 'Ingen tilg\u00e6ngelige personer', noTeams: 'Ingen tilg\u00e6ngelige afdelinger',
    invitation: 'Invitation', invitationPending: 'Afventer svar', invitationAccepted: 'Invitation accepteret',
    invitationDeclined: 'Invitation afvist', invitedBy: 'Inviteret af', invitedAt: 'Inviteret', respondedAt: 'Besvaret',
    acceptInvitation: 'Accepter invitation', declineInvitation: 'Afvis invitation', invitationSent: 'Invitation sendt.',
    invitationAcceptSuccess: 'Du har accepteret invitationen.', invitationDeclineSuccess: 'Du har afvist invitationen.',
    ownerConflict: 'Der findes allerede en ansvarlig eller en afventende invitation til rollen.',
    comments: 'Kommentarer', comment: 'Kommentar', addComment: 'Tilf\u00f8j kommentar',
    commentPlaceholder: 'Skriv en kommentar', noComments: 'Ingen kommentarer endnu.', commentSaved: 'Kommentar gemt.',
    history: 'Historik', noHistory: 'Ingen historik endnu.', submitForApproval: 'Meld færdig (til godkendelse)',
    submittedForApproval: 'Sendt til godkendelse.', approve: 'Godkend afslutning', approved: 'Afslutning godkendt.',
    returnForChanges: 'Send tilbage', returnedForChanges: 'Sendt tilbage med feedback.', reviewFeedback: 'Feedback',
    feedbackRequired: 'Skriv feedback, f\u00f8r forbedringen sendes tilbage.', readyForApproval: 'Klar til godkendelse',
    approvalRequired: 'Afslutning afventer ledergodkendelse.', acceptedOwnerRequired: 'Kun den accepterede ansvarlige kan sende til godkendelse.',
    acceptedAssignmentRequired: 'Kun accepterede ansvarlige og bidragydere kan opdatere fremdrift.',
    notifications: 'Notifikationer', unseenChanges: 'Nye ændringer, du ikke har set', unreadNotifications: 'Ul\u00e6ste notifikationer', noNotifications: 'Ingen notifikationer.',
    markRead: 'Marker som l\u00e6st', notificationInvitation: 'Ny invitation', notificationReview: 'Afventer din godkendelse',
    notificationReturned: 'Sendt tilbage med feedback', notificationApproved: 'Afslutning godkendt',
    requiredFields: 'Udfyld de p\u00e5kr\u00e6vede felter.', titleRequired: 'Angiv en titel.',
    problemRequired: 'Beskriv problemet.', proposalRequired: 'Beskriv forbedringsforslaget.',
    commentRequired: 'Skriv en kommentar.', invalidDeadline: 'Angiv en gyldig frist.',
    permissionDenied: 'Du har ikke adgang til denne handling.', conflict: 'Forbedringen er \u00e6ndret. Opdater og pr\u00f8v igen.',
    caseUnavailable: 'Forbedringen er ikke l\u00e6ngere tilg\u00e6ngelig.',
    deletion: 'Sletning', requestDeletion: 'Anmod om sletning', deletionReason: 'Begrundelse for sletning',
    deletionPending: 'Din sletningsanmodning afventer behandling.', deletionRequests: 'Sletningsanmodninger', noDeletionRequests: 'Ingen sletningsanmodninger.',
    deleteCase: 'Slet forbedring', deleteConfirmTitle: 'Slet denne forbedring?',
    deleteConfirmDescription: 'Forbedringen fjernes fra oversigten for alle. Denne handling kan ikke fortrydes her.',
    confirmDelete: 'Bekræft sletning', rejectDeletion: 'Afvis anmodning', approveDeletion: 'Godkend sletning',
    rejectionReason: 'Begrundelse for afvisning', rejectionRequired: 'Angiv en begrundelse for afvisningen.',
    deletionStatuses: { pending: 'Afventer behandling', rejected: 'Afvist', approved: 'Godkendt' },
    statuses: {
      new: 'Ny', assessment: 'Under vurdering', planned: 'Planlagt', 'in-progress': 'I gang', testing: 'Under test',
      'ready-for-approval': 'Klar til godkendelse', completed: 'Gennemført', 'on-hold': 'Sat p\u00e5 pause', declined: 'Afvist',
    },
    categories: { process: 'Proces', automation: 'Automatisering', quality: 'Kvalitet', workplace: 'Arbejdsmilj\u00f8', cost: 'Omkostninger', other: 'Andet' },
    priorities: { critical: 'Kritisk', high: 'H\u00f8j', medium: 'Mellem', low: 'Lav' },
    assignmentKinds: { owner: 'Ansvarlig', contributor: 'Bidragyder' },
    assignmentStatuses: { pending: 'Afventer svar', accepted: 'Accepteret', declined: 'Afvist' },
    presets: { all: 'Alle forslag', mine: 'Mine forslag', assigned: 'Tildelt mig', department: 'Min afdeling' },
    views: { active: 'Igangv\u00e6rende', completed: 'Gennemf\u00f8rte', declined: 'Afviste' },
    sorts: { updated: 'Senest opdateret', newest: 'Nyeste f\u00f8rst', oldest: '\u00c6ldste f\u00f8rst', priority: 'H\u00f8jeste prioritet', due: 'N\u00e6rmeste frist' },
  },
  en: {
    title: 'Improvements and suggestions', newSuggestion: 'New suggestion', create: 'Create suggestion',
    save: 'Save', saving: 'Saving...', saved: 'Saved', cancel: 'Cancel', close: 'Close',
    retry: 'Try again', refresh: 'Refresh', loading: 'Loading improvements...',
    unavailable: 'Improvements are unavailable in this window.',
    loadError: 'Improvements could not be loaded.', saveError: 'The change could not be saved. Try again.',
    empty: 'No improvements yet.',
    noResults: 'No improvements match the filters.', search: 'Search',
    searchPlaceholder: 'Search title, problem or proposal', filters: 'Filters', clearFilters: 'Clear filters',
    allStatuses: 'All statuses', allPriorities: 'All priorities', allTeams: 'All departments',
    allPeople: 'All people', sortBy: 'Sort by', pendingInvitations: 'My pending invitations',
    caseTitle: 'Title', problem: 'Problem', proposal: 'Improvement proposal', category: 'Category',
    standardCategories: 'Standard categories', customCategories: 'Created by colleagues', newCategory: '+ New category…',
    newCategoryName: 'Name of the new category', newCategoryHint: 'Use this when none of the existing categories fits. Everyone can choose it afterwards.',
    priority: 'Priority', status: 'Status', originTeam: 'Origin department', affectedTeams: 'Affected departments',
    person: 'Owner or contributor', author: 'Created by', createdAt: 'Created', updatedAt: 'Last updated',
    nextAction: 'Next action', dueDate: 'Work deadline', noDeadline: 'No deadline', clearDeadline: 'Clear deadline',
    deadlines: 'Deadlines', responseDueDate: 'Invitation response deadline', feedbackDueDate: 'Feedback deadline', saveDeadlines: 'Save deadlines',
    overdue: 'Overdue', details: 'Details', progress: 'Progress', updateProgress: 'Update progress',
    assignments: 'Owner and contributors', owner: 'Owner', contributors: 'Contributors',
    unassigned: 'No accepted owner', noContributors: 'No accepted contributors',
    invite: 'Invite', invitePerson: 'Invite person', inviteKind: 'Role', selectPerson: 'Select person',
    ownerHint: 'If you choose someone other than yourself, they are invited to be the owner.',
    selectTeam: 'Select department', noPeople: 'No people available', noTeams: 'No departments available',
    invitation: 'Invitation', invitationPending: 'Awaiting response', invitationAccepted: 'Invitation accepted',
    invitationDeclined: 'Invitation declined', invitedBy: 'Invited by', invitedAt: 'Invited', respondedAt: 'Responded',
    acceptInvitation: 'Accept invitation', declineInvitation: 'Decline invitation', invitationSent: 'Invitation sent.',
    invitationAcceptSuccess: 'You accepted the invitation.', invitationDeclineSuccess: 'You declined the invitation.',
    ownerConflict: 'An owner or pending owner invitation already exists.',
    comments: 'Comments', comment: 'Comment', addComment: 'Add comment',
    commentPlaceholder: 'Write a comment', noComments: 'No comments yet.', commentSaved: 'Comment saved.',
    history: 'History', noHistory: 'No history yet.', submitForApproval: 'Mark work done (for approval)',
    submittedForApproval: 'Submitted for approval.', approve: 'Approve completion', approved: 'Completion approved.',
    returnForChanges: 'Return for changes', returnedForChanges: 'Returned with feedback.', reviewFeedback: 'Feedback',
    feedbackRequired: 'Enter feedback before returning the improvement.', readyForApproval: 'Ready for approval',
    approvalRequired: 'Completion awaits leader approval.', acceptedOwnerRequired: 'Only the accepted owner can submit for approval.',
    acceptedAssignmentRequired: 'Only accepted owners and contributors can update progress.',
    notifications: 'Notifications', unseenChanges: 'New changes you have not seen', unreadNotifications: 'Unread notifications', noNotifications: 'No notifications.',
    markRead: 'Mark as read', notificationInvitation: 'New invitation', notificationReview: 'Awaiting your approval',
    notificationReturned: 'Returned with feedback', notificationApproved: 'Completion approved',
    requiredFields: 'Complete the required fields.', titleRequired: 'Enter a title.',
    problemRequired: 'Describe the problem.', proposalRequired: 'Describe the improvement proposal.',
    commentRequired: 'Enter a comment.', invalidDeadline: 'Enter a valid deadline.',
    permissionDenied: 'You do not have permission for this action.', conflict: 'The improvement has changed. Refresh and try again.',
    caseUnavailable: 'The improvement is no longer available.',
    deletion: 'Deletion', requestDeletion: 'Request deletion', deletionReason: 'Reason for deletion',
    deletionPending: 'Your deletion request is awaiting review.', deletionRequests: 'Deletion requests', noDeletionRequests: 'No deletion requests.',
    deleteCase: 'Delete improvement', deleteConfirmTitle: 'Delete this improvement?',
    deleteConfirmDescription: 'The improvement will be removed from the list for everyone. This action cannot be undone here.',
    confirmDelete: 'Confirm deletion', rejectDeletion: 'Reject request', approveDeletion: 'Approve deletion',
    rejectionReason: 'Reason for rejection', rejectionRequired: 'Enter a reason for rejection.',
    deletionStatuses: { pending: 'Awaiting review', rejected: 'Rejected', approved: 'Approved' },
    statuses: {
      new: 'New', assessment: 'Under assessment', planned: 'Planned', 'in-progress': 'In progress', testing: 'Testing',
      'ready-for-approval': 'Ready for approval', completed: 'Completed', 'on-hold': 'On hold', declined: 'Declined',
    },
    categories: { process: 'Process', automation: 'Automation', quality: 'Quality', workplace: 'Workplace', cost: 'Cost', other: 'Other' },
    priorities: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    assignmentKinds: { owner: 'Owner', contributor: 'Contributor' },
    assignmentStatuses: { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' },
    presets: { all: 'All suggestions', mine: 'My suggestions', assigned: 'Assigned to me', department: 'My department' },
    views: { active: 'Ongoing', completed: 'Completed', declined: 'Declined' },
    sorts: { updated: 'Last updated', newest: 'Newest first', oldest: 'Oldest first', priority: 'Highest priority', due: 'Earliest deadline' },
  },
  fi: {
    title: 'Parannukset ja ehdotukset', newSuggestion: 'Uusi ehdotus', create: 'Luo ehdotus',
    save: 'Tallenna', saving: 'Tallennetaan...', saved: 'Tallennettu', cancel: 'Peruuta', close: 'Sulje',
    retry: 'Yrit\u00e4 uudelleen', refresh: 'P\u00e4ivit\u00e4', loading: 'Ladataan parannuksia...',
    unavailable: 'Parannukset eiv\u00e4t ole k\u00e4ytett\u00e4viss\u00e4 t\u00e4ss\u00e4 ikkunassa.',
    loadError: 'Parannuksia ei voitu ladata.', saveError: 'Muutosta ei voitu tallentaa. Yrit\u00e4 uudelleen.',
    empty: 'Ei viel\u00e4 parannuksia.',
    noResults: 'Suodattimia vastaavia parannuksia ei l\u00f6ytynyt.', search: 'Haku',
    searchPlaceholder: 'Hae otsikosta, ongelmasta tai ehdotuksesta', filters: 'Suodattimet', clearFilters: 'Tyhjenn\u00e4 suodattimet',
    allStatuses: 'Kaikki tilat', allPriorities: 'Kaikki prioriteetit', allTeams: 'Kaikki osastot',
    allPeople: 'Kaikki henkil\u00f6t', sortBy: 'Lajittelu', pendingInvitations: 'Omat odottavat kutsut',
    caseTitle: 'Otsikko', problem: 'Ongelma', proposal: 'Parannusehdotus', category: 'Luokka',
    standardCategories: 'Vakioluokat', customCategories: 'Kollegojen luomat', newCategory: '+ Uusi luokka…',
    newCategoryName: 'Uuden luokan nimi', newCategoryHint: 'Käytä, kun mikään nykyisistä luokista ei sovi. Kaikki voivat valita sen jatkossa.',
    priority: 'Prioriteetti', status: 'Tila', originTeam: 'Alkuper\u00e4inen osasto', affectedTeams: 'Osastot, joita parannus koskee',
    person: 'Vastuuhenkil\u00f6 tai osallistuja', author: 'Luonut', createdAt: 'Luotu', updatedAt: 'Viimeksi p\u00e4ivitetty',
    nextAction: 'Seuraava toimenpide', dueDate: 'Tehtävän määräaika', noDeadline: 'Ei m\u00e4\u00e4r\u00e4aikaa', clearDeadline: 'Poista m\u00e4\u00e4r\u00e4aika',
    deadlines: 'Määräajat', responseDueDate: 'Kutsun vastausmääräaika', feedbackDueDate: 'Palautteen määräaika', saveDeadlines: 'Tallenna määräajat',
    overdue: 'M\u00e4\u00e4r\u00e4aika ylitetty', details: 'Tiedot', progress: 'Edistyminen', updateProgress: 'P\u00e4ivit\u00e4 edistyminen',
    assignments: 'Vastuuhenkil\u00f6 ja osallistujat', owner: 'Vastuuhenkil\u00f6', contributors: 'Osallistujat',
    unassigned: 'Ei hyv\u00e4ksynytt\u00e4 vastuuhenkil\u00f6\u00e4', noContributors: 'Ei hyv\u00e4ksyneit\u00e4 osallistujia',
    invite: 'Kutsu', invitePerson: 'Kutsu henkil\u00f6', inviteKind: 'Rooli', selectPerson: 'Valitse henkil\u00f6',
    ownerHint: 'Jos valitset jonkun muun kuin itsesi, h\u00e4net kutsutaan vastuuhenkil\u00f6ksi.',
    selectTeam: 'Valitse osasto', noPeople: 'Ei saatavilla olevia henkil\u00f6it\u00e4', noTeams: 'Ei saatavilla olevia osastoja',
    invitation: 'Kutsu', invitationPending: 'Odottaa vastausta', invitationAccepted: 'Kutsu hyv\u00e4ksytty',
    invitationDeclined: 'Kutsu hyl\u00e4tty', invitedBy: 'Kutsunut', invitedAt: 'Kutsuttu', respondedAt: 'Vastattu',
    acceptInvitation: 'Hyv\u00e4ksy kutsu', declineInvitation: 'Hylk\u00e4\u00e4 kutsu', invitationSent: 'Kutsu l\u00e4hetetty.',
    invitationAcceptSuccess: 'Hyv\u00e4ksyit kutsun.', invitationDeclineSuccess: 'Hylk\u00e4sit kutsun.',
    ownerConflict: 'Vastuuhenkil\u00f6 tai odottava vastuuhenkil\u00f6kutsu on jo olemassa.',
    comments: 'Kommentit', comment: 'Kommentti', addComment: 'Lis\u00e4\u00e4 kommentti',
    commentPlaceholder: 'Kirjoita kommentti', noComments: 'Ei viel\u00e4 kommentteja.', commentSaved: 'Kommentti tallennettu.',
    history: 'Historia', noHistory: 'Ei viel\u00e4 historiaa.', submitForApproval: 'Merkitse työ valmiiksi (hyväksyttäväksi)',
    submittedForApproval: 'L\u00e4hetetty hyv\u00e4ksytt\u00e4v\u00e4ksi.', approve: 'Hyv\u00e4ksy valmistuminen', approved: 'Valmistuminen hyv\u00e4ksytty.',
    returnForChanges: 'Palauta muokattavaksi', returnedForChanges: 'Palautettu palautteen kanssa.', reviewFeedback: 'Palaute',
    feedbackRequired: 'Kirjoita palaute ennen parannuksen palauttamista.', readyForApproval: 'Valmis hyv\u00e4ksytt\u00e4v\u00e4ksi',
    approvalRequired: 'Valmistuminen odottaa esihenkil\u00f6n hyv\u00e4ksynt\u00e4\u00e4.', acceptedOwnerRequired: 'Vain hyv\u00e4ksynyt vastuuhenkil\u00f6 voi l\u00e4hett\u00e4\u00e4 hyv\u00e4ksytt\u00e4v\u00e4ksi.',
    acceptedAssignmentRequired: 'Vain hyv\u00e4ksyneet vastuuhenkil\u00f6t ja osallistujat voivat p\u00e4ivitt\u00e4\u00e4 edistymist\u00e4.',
    notifications: 'Ilmoitukset', unseenChanges: 'Uusia muutoksia, joita et ole nähnyt', unreadNotifications: 'Lukemattomat ilmoitukset', noNotifications: 'Ei ilmoituksia.',
    markRead: 'Merkitse luetuksi', notificationInvitation: 'Uusi kutsu', notificationReview: 'Odottaa hyv\u00e4ksynt\u00e4\u00e4si',
    notificationReturned: 'Palautettu palautteen kanssa', notificationApproved: 'Valmistuminen hyv\u00e4ksytty',
    requiredFields: 'T\u00e4yt\u00e4 pakolliset kent\u00e4t.', titleRequired: 'Anna otsikko.',
    problemRequired: 'Kuvaile ongelma.', proposalRequired: 'Kuvaile parannusehdotus.',
    commentRequired: 'Kirjoita kommentti.', invalidDeadline: 'Anna kelvollinen m\u00e4\u00e4r\u00e4aika.',
    permissionDenied: 'Sinulla ei ole oikeutta t\u00e4h\u00e4n toimintoon.', conflict: 'Parannus on muuttunut. P\u00e4ivit\u00e4 ja yrit\u00e4 uudelleen.',
    caseUnavailable: 'Parannus ei ole en\u00e4\u00e4 saatavilla.',
    deletion: 'Poistaminen', requestDeletion: 'Pyydä poistamista', deletionReason: 'Poistamisen syy',
    deletionPending: 'Poistopyyntösi odottaa käsittelyä.', deletionRequests: 'Poistopyynnöt', noDeletionRequests: 'Ei poistopyyntöjä.',
    deleteCase: 'Poista parannus', deleteConfirmTitle: 'Poistetaanko tämä parannus?',
    deleteConfirmDescription: 'Parannus poistetaan kaikkien luettelosta. Tätä toimintoa ei voi kumota täällä.',
    confirmDelete: 'Vahvista poistaminen', rejectDeletion: 'Hylkää pyyntö', approveDeletion: 'Hyväksy poistaminen',
    rejectionReason: 'Hylkäyksen syy', rejectionRequired: 'Anna hylkäyksen syy.',
    deletionStatuses: { pending: 'Odottaa käsittelyä', rejected: 'Hylätty', approved: 'Hyväksytty' },
    statuses: {
      new: 'Uusi', assessment: 'Arvioitavana', planned: 'Suunniteltu', 'in-progress': 'K\u00e4ynniss\u00e4', testing: 'Testauksessa',
      'ready-for-approval': 'Valmis hyv\u00e4ksytt\u00e4v\u00e4ksi', completed: 'Valmis', 'on-hold': 'Keskeytetty', declined: 'Hyl\u00e4tty',
    },
    categories: { process: 'Prosessi', automation: 'Automaatio', quality: 'Laatu', workplace: 'Ty\u00f6ymp\u00e4rist\u00f6', cost: 'Kustannukset', other: 'Muu' },
    priorities: { critical: 'Kriittinen', high: 'Korkea', medium: 'Keskitaso', low: 'Matala' },
    assignmentKinds: { owner: 'Vastuuhenkil\u00f6', contributor: 'Osallistuja' },
    assignmentStatuses: { pending: 'Odottaa vastausta', accepted: 'Hyv\u00e4ksytty', declined: 'Hyl\u00e4tty' },
    presets: { all: 'Kaikki ehdotukset', mine: 'Omat ehdotukset', assigned: 'Minulle osoitetut', department: 'Oma osasto' },
    views: { active: 'K\u00e4ynniss\u00e4 olevat', completed: 'Valmiit', declined: 'Hyl\u00e4tyt' },
    sorts: { updated: 'Viimeksi p\u00e4ivitetty', newest: 'Uusimmat ensin', oldest: 'Vanhimmat ensin', priority: 'Korkein prioriteetti', due: 'L\u00e4hin m\u00e4\u00e4r\u00e4aika' },
  },
  sv: {
    title: 'Förbättringar och förslag', newSuggestion: 'Nytt förslag', create: 'Skapa förslag',
    save: 'Spara', saving: 'Sparar...', saved: 'Sparat', cancel: 'Avbryt', close: 'Stäng',
    retry: 'Försök igen', refresh: 'Uppdatera', loading: 'Laddar förbättringar...',
    unavailable: 'Förbättringar är inte tillgängliga i det här fönstret.',
    loadError: 'Förbättringarna kunde inte laddas.', saveError: 'Ändringen kunde inte sparas. Försök igen.',
    empty: 'Inga förbättringar ännu.',
    noResults: 'Inga förbättringar matchar filtren.', search: 'Sök',
    searchPlaceholder: 'Sök i titel, problem eller förslag', filters: 'Filter', clearFilters: 'Rensa filter',
    allStatuses: 'Alla statusar', allPriorities: 'Alla prioriteter', allTeams: 'Alla avdelningar',
    allPeople: 'Alla personer', sortBy: 'Sortera efter', pendingInvitations: 'Mina väntande inbjudningar',
    caseTitle: 'Titel', problem: 'Problem', proposal: 'Förbättringsförslag', category: 'Kategori',
    standardCategories: 'Standardkategorier', customCategories: 'Skapade av kollegor', newCategory: '+ Ny kategori…',
    newCategoryName: 'Namn på den nya kategorin', newCategoryHint: 'Använd den när ingen av de befintliga kategorierna passar. Den kan sedan väljas av alla.',
    priority: 'Prioritet', status: 'Status', originTeam: 'Ursprunglig avdelning', affectedTeams: 'Berörda avdelningar',
    person: 'Ansvarig eller medverkande', author: 'Skapad av', createdAt: 'Skapad', updatedAt: 'Senast uppdaterad',
    nextAction: 'Nästa åtgärd', dueDate: 'Frist för arbetet', noDeadline: 'Ingen frist', clearDeadline: 'Ta bort frist',
    deadlines: 'Tidsfrister', responseDueDate: 'Svarsfrist för inbjudan', feedbackDueDate: 'Frist för återkoppling', saveDeadlines: 'Spara tidsfrister',
    overdue: 'Försenad', details: 'Detaljer', progress: 'Framsteg', updateProgress: 'Uppdatera framsteg',
    assignments: 'Ansvarig och medverkande', owner: 'Ansvarig', contributors: 'Medverkande',
    unassigned: 'Ingen godkänd ansvarig', noContributors: 'Inga godkända medverkande',
    invite: 'Bjud in', invitePerson: 'Bjud in person', inviteKind: 'Roll', selectPerson: 'Välj person',
    ownerHint: 'Väljer du någon annan än dig själv får personen en inbjudan att bli ansvarig.',
    selectTeam: 'Välj avdelning', noPeople: 'Inga tillgängliga personer', noTeams: 'Inga tillgängliga avdelningar',
    invitation: 'Inbjudan', invitationPending: 'Väntar på svar', invitationAccepted: 'Inbjudan godkänd',
    invitationDeclined: 'Inbjudan avböjd', invitedBy: 'Inbjuden av', invitedAt: 'Inbjuden', respondedAt: 'Besvarad',
    acceptInvitation: 'Godkänn inbjudan', declineInvitation: 'Avböj inbjudan', invitationSent: 'Inbjudan skickad.',
    invitationAcceptSuccess: 'Du har godkänt inbjudan.', invitationDeclineSuccess: 'Du har avböjt inbjudan.',
    ownerConflict: 'Det finns redan en ansvarig eller en väntande inbjudan till rollen.',
    comments: 'Kommentarer', comment: 'Kommentar', addComment: 'Lägg till kommentar',
    commentPlaceholder: 'Skriv en kommentar', noComments: 'Inga kommentarer ännu.', commentSaved: 'Kommentaren sparad.',
    history: 'Historik', noHistory: 'Ingen historik ännu.', submitForApproval: 'Markera som klart (för godkännande)',
    submittedForApproval: 'Skickad för godkännande.', approve: 'Godkänn avslut', approved: 'Avslutet godkänt.',
    returnForChanges: 'Skicka tillbaka', returnedForChanges: 'Skickad tillbaka med återkoppling.', reviewFeedback: 'Återkoppling',
    feedbackRequired: 'Skriv återkoppling innan förbättringen skickas tillbaka.', readyForApproval: 'Redo för godkännande',
    approvalRequired: 'Avslutet väntar på chefens godkännande.', acceptedOwnerRequired: 'Endast den godkända ansvariga kan skicka för godkännande.',
    acceptedAssignmentRequired: 'Endast godkända ansvariga och medverkande kan uppdatera framsteg.',
    notifications: 'Notiser', unseenChanges: 'Nya ändringar som du inte har sett', unreadNotifications: 'Olästa notiser', noNotifications: 'Inga notiser.',
    markRead: 'Markera som läst', notificationInvitation: 'Ny inbjudan', notificationReview: 'Väntar på ditt godkännande',
    notificationReturned: 'Skickad tillbaka med återkoppling', notificationApproved: 'Avslutet godkänt',
    requiredFields: 'Fyll i de obligatoriska fälten.', titleRequired: 'Ange en titel.',
    problemRequired: 'Beskriv problemet.', proposalRequired: 'Beskriv förbättringsförslaget.',
    commentRequired: 'Skriv en kommentar.', invalidDeadline: 'Ange en giltig frist.',
    permissionDenied: 'Du har inte behörighet till den här åtgärden.', conflict: 'Förbättringen har ändrats. Uppdatera och försök igen.',
    caseUnavailable: 'Förbättringen är inte längre tillgänglig.',
    deletion: 'Radering', requestDeletion: 'Begär radering', deletionReason: 'Anledning till radering',
    deletionPending: 'Din raderingsbegäran väntar på behandling.', deletionRequests: 'Raderingsbegäranden', noDeletionRequests: 'Inga raderingsbegäranden.',
    deleteCase: 'Radera förbättring', deleteConfirmTitle: 'Radera den här förbättringen?',
    deleteConfirmDescription: 'Förbättringen tas bort från listan för alla. Den här åtgärden kan inte ångras här.',
    confirmDelete: 'Bekräfta radering', rejectDeletion: 'Avslå begäran', approveDeletion: 'Godkänn radering',
    rejectionReason: 'Anledning till avslag', rejectionRequired: 'Ange en anledning till avslaget.',
    deletionStatuses: { pending: 'Väntar på behandling', rejected: 'Avslagen', approved: 'Godkänd' },
    statuses: {
      new: 'Ny', assessment: 'Under bedömning', planned: 'Planerad', 'in-progress': 'Pågår', testing: 'Under test',
      'ready-for-approval': 'Redo för godkännande', completed: 'Genomförd', 'on-hold': 'Pausad', declined: 'Avslagen',
    },
    categories: { process: 'Process', automation: 'Automatisering', quality: 'Kvalitet', workplace: 'Arbetsmiljö', cost: 'Kostnader', other: 'Övrigt' },
    priorities: { critical: 'Kritisk', high: 'Hög', medium: 'Medel', low: 'Låg' },
    assignmentKinds: { owner: 'Ansvarig', contributor: 'Medverkande' },
    assignmentStatuses: { pending: 'Väntar på svar', accepted: 'Godkänd', declined: 'Avböjd' },
    presets: { all: 'Alla förslag', mine: 'Mina förslag', assigned: 'Tilldelade mig', department: 'Min avdelning' },
    views: { active: 'Pågående', completed: 'Genomförda', declined: 'Avvisade' },
    sorts: { updated: 'Senast uppdaterad', newest: 'Nyast först', oldest: 'Äldst först', priority: 'Högsta prioritet', due: 'Närmaste frist' },
  },
}

export function getImprovementsLabels(language: string): ImprovementsLabels {
  return language === 'da' || language === 'fi' || language === 'sv' ? IMPROVEMENTS_LABELS[language] : IMPROVEMENTS_LABELS.en
}