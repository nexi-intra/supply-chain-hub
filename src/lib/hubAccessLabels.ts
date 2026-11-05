import type { Language } from './translations'

export interface HubAccessLabels {
  pickerTitle: string
  pickerSubtitle: string
  homeTeam: string
  managerRole: string
  waiting: (count: number) => string
  open: string
  switchHub: string
  switchTo: (name: string) => string
  managerHere: string
  accessRemoved: (name: string) => string
  switchFailed: string
  // Creator Panel
  sectionTitle: string
  sectionDescription: string
  add: string
  edit: string
  remove: string
  empty: string
  managerIn: string
  dialogTitleAdd: string
  dialogTitleEdit: string
  person: string
  personPlaceholder: string
  teams: string
  ownTeamHint: string
  save: string
  cancel: string
  saved: string
  removed: (name: string) => string
  removeConfirm: (name: string) => string
  saveFailed: string
  loadFailed: string
  // Manager Panel
  extraManagersTitle: string
  extraManagersDescription: string
  fromTeam: (team: string) => string
}

const LABELS: Record<Language, HubAccessLabels> = {
  da: {
    pickerTitle: 'Vælg din hub',
    pickerSubtitle: 'Du har adgang til flere hubs. Du kan altid skifte senere fra profilmenuen eller med Ctrl+K.',
    homeTeam: 'Dit team',
    managerRole: 'Manager',
    waiting: count => `${count} venter`,
    open: 'Åbn',
    switchHub: 'Skift hub',
    switchTo: name => `Skift til ${name}`,
    managerHere: 'Manager-adgang',
    accessRemoved: name => `Din manager-adgang til ${name} er fjernet`,
    switchFailed: 'Kunne ikke skifte hub. Prøv igen.',
    sectionTitle: 'Managere på tværs af teams',
    sectionDescription: 'Giv en person manager-adgang i andre teams end sit eget. Personen bliver i sit eget team og vælger hub ved login.',
    add: 'Tilføj',
    edit: 'Rediger',
    remove: 'Fjern',
    empty: 'Ingen har manager-adgang i andre teams endnu.',
    managerIn: 'Manager i',
    dialogTitleAdd: 'Giv manager-adgang i andre teams',
    dialogTitleEdit: 'Rediger manager-adgang',
    person: 'Person',
    personPlaceholder: 'Søg efter navn eller e-mail',
    teams: 'Manager i disse teams',
    ownTeamHint: 'eget team',
    save: 'Gem',
    cancel: 'Annuller',
    saved: 'Manager-adgangen er gemt',
    removed: name => `Manager-adgangen for ${name} er fjernet`,
    removeConfirm: name => `Fjern al manager-adgang i andre teams for ${name}?`,
    saveFailed: 'Kunne ikke gemme manager-adgangen',
    loadFailed: 'Kunne ikke hente manager-adgange',
    extraManagersTitle: 'Managere fra andre teams',
    extraManagersDescription: 'Har manager-adgang til dette team via Creator Panel. Kun creator kan ændre det.',
    fromTeam: team => `fra ${team}`,
  },
  en: {
    pickerTitle: 'Choose your hub',
    pickerSubtitle: 'You have access to several hubs. You can always switch later from the profile menu or with Ctrl+K.',
    homeTeam: 'Your team',
    managerRole: 'Manager',
    waiting: count => `${count} waiting`,
    open: 'Open',
    switchHub: 'Switch hub',
    switchTo: name => `Switch to ${name}`,
    managerHere: 'Manager access',
    accessRemoved: name => `Your manager access to ${name} was removed`,
    switchFailed: 'Could not switch hub. Please try again.',
    sectionTitle: 'Managers across teams',
    sectionDescription: 'Give a person manager access in teams other than their own. The person stays in their own team and chooses a hub at login.',
    add: 'Add',
    edit: 'Edit',
    remove: 'Remove',
    empty: 'Nobody has manager access in other teams yet.',
    managerIn: 'Manager in',
    dialogTitleAdd: 'Give manager access in other teams',
    dialogTitleEdit: 'Edit manager access',
    person: 'Person',
    personPlaceholder: 'Search by name or e-mail',
    teams: 'Manager in these teams',
    ownTeamHint: 'own team',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Manager access saved',
    removed: name => `Manager access for ${name} removed`,
    removeConfirm: name => `Remove all manager access in other teams for ${name}?`,
    saveFailed: 'Could not save the manager access',
    loadFailed: 'Could not load manager access',
    extraManagersTitle: 'Managers from other teams',
    extraManagersDescription: 'Have manager access to this team via the Creator Panel. Only the creator can change it.',
    fromTeam: team => `from ${team}`,
  },
  fi: {
    pickerTitle: 'Valitse hubisi',
    pickerSubtitle: 'Sinulla on pääsy useaan hubiin. Voit aina vaihtaa myöhemmin profiilivalikosta tai Ctrl+K:lla.',
    homeTeam: 'Oma tiimisi',
    managerRole: 'Esihenkilö',
    waiting: count => `${count} odottaa`,
    open: 'Avaa',
    switchHub: 'Vaihda hubia',
    switchTo: name => `Vaihda: ${name}`,
    managerHere: 'Esihenkilöoikeus',
    accessRemoved: name => `Esihenkilöoikeutesi tiimiin ${name} on poistettu`,
    switchFailed: 'Hubin vaihto epäonnistui. Yritä uudelleen.',
    sectionTitle: 'Esihenkilöt tiimien välillä',
    sectionDescription: 'Anna henkilölle esihenkilöoikeus muissa kuin omassa tiimissään. Henkilö pysyy omassa tiimissään ja valitsee hubin kirjautuessaan.',
    add: 'Lisää',
    edit: 'Muokkaa',
    remove: 'Poista',
    empty: 'Kenelläkään ei vielä ole esihenkilöoikeutta muissa tiimeissä.',
    managerIn: 'Esihenkilö tiimeissä',
    dialogTitleAdd: 'Anna esihenkilöoikeus muissa tiimeissä',
    dialogTitleEdit: 'Muokkaa esihenkilöoikeutta',
    person: 'Henkilö',
    personPlaceholder: 'Hae nimellä tai sähköpostilla',
    teams: 'Esihenkilö näissä tiimeissä',
    ownTeamHint: 'oma tiimi',
    save: 'Tallenna',
    cancel: 'Peruuta',
    saved: 'Esihenkilöoikeus tallennettu',
    removed: name => `Henkilön ${name} esihenkilöoikeus poistettu`,
    removeConfirm: name => `Poistetaanko henkilön ${name} kaikki esihenkilöoikeudet muissa tiimeissä?`,
    saveFailed: 'Esihenkilöoikeutta ei voitu tallentaa',
    loadFailed: 'Esihenkilöoikeuksia ei voitu hakea',
    extraManagersTitle: 'Esihenkilöt muista tiimeistä',
    extraManagersDescription: 'Heillä on esihenkilöoikeus tähän tiimiin Creator Panelin kautta. Vain creator voi muuttaa sitä.',
    fromTeam: team => `tiimistä ${team}`,
  },
  sv: {
    pickerTitle: 'Välj din hub',
    pickerSubtitle: 'Du har tillgång till flera hubbar. Du kan alltid byta senare från profilmenyn eller med Ctrl+K.',
    homeTeam: 'Ditt team',
    managerRole: 'Chef',
    waiting: count => `${count} väntar`,
    open: 'Öppna',
    switchHub: 'Byt hub',
    switchTo: name => `Byt till ${name}`,
    managerHere: 'Chefsbehörighet',
    accessRemoved: name => `Din chefsbehörighet till ${name} har tagits bort`,
    switchFailed: 'Kunde inte byta hub. Försök igen.',
    sectionTitle: 'Chefer över teamgränser',
    sectionDescription: 'Ge en person chefsbehörighet i andra team än sitt eget. Personen stannar i sitt eget team och väljer hub vid inloggning.',
    add: 'Lägg till',
    edit: 'Redigera',
    remove: 'Ta bort',
    empty: 'Ingen har chefsbehörighet i andra team ännu.',
    managerIn: 'Chef i',
    dialogTitleAdd: 'Ge chefsbehörighet i andra team',
    dialogTitleEdit: 'Redigera chefsbehörighet',
    person: 'Person',
    personPlaceholder: 'Sök på namn eller e-post',
    teams: 'Chef i dessa team',
    ownTeamHint: 'eget team',
    save: 'Spara',
    cancel: 'Avbryt',
    saved: 'Chefsbehörigheten har sparats',
    removed: name => `Chefsbehörigheten för ${name} har tagits bort`,
    removeConfirm: name => `Ta bort all chefsbehörighet i andra team för ${name}?`,
    saveFailed: 'Kunde inte spara chefsbehörigheten',
    loadFailed: 'Kunde inte hämta chefsbehörigheter',
    extraManagersTitle: 'Chefer från andra team',
    extraManagersDescription: 'Har chefsbehörighet till detta team via Creator Panel. Endast creator kan ändra det.',
    fromTeam: team => `från ${team}`,
  },
}

export function getHubAccessLabels(language: Language): HubAccessLabels {
  return LABELS[language] ?? LABELS.da
}
