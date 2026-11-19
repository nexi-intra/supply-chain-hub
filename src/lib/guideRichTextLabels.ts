import type { Language } from './translations'

export interface GuideRichTextLabels {
  editor: string
  heading: string
  formatting: string
  bold: string
  italic: string
  underline: string
  color: string
  size: string
  defaultStyle: string
  clearFormatting: string
  undo: string
  redo: string
  link: string
  removeLink: string
  guide: string
  documents: string
  web: string
  section: string
  step: string
  wholeGuide: string
  wholeSection: string
  shared: string
  savedTarget: string
  noGuides: string
  address: string
  apply: string
  cancel: string
  note: string
  important: string
  invalidLink: string
  invalidContent: string
  back: string
  references: string
  linkWarnings: string
  continueWithLinks: string
  unavailable: string
  archived: string
  missingAnchor: string
  translatedPlainText: string
  colors: readonly string[]
}

export const GUIDE_RICH_TEXT_LABELS: Record<Language, GuideRichTextLabels> = {
  da: {
    editor: 'Trintekst', heading: 'Sektionsoverskrift', formatting: 'Tekstformatering', bold: 'Fed', italic: 'Kursiv',
    underline: 'Understreget', color: 'Tekstfarve', size: 'Tekstst\u00f8rrelse',
    defaultStyle: 'Standard', clearFormatting: 'Fjern formatering', undo: 'Fortryd', redo: 'Gentag',
    link: 'Rediger link', removeLink: 'Fjern link', guide: 'Guide', documents: 'Dokumenter', web: 'Web',
    section: 'Sektion', step: 'Trin', wholeGuide: 'Hele guiden', wholeSection: 'Hele sektionen',
    shared: 'Delt', savedTarget: 'Gemt destination', noGuides: 'Ingen tilg\u00e6ngelige guides',
    address: 'Adresse', apply: 'Anvend', cancel: 'Annuller', note: 'Bem\u00e6rk', important: 'Vigtigt',
    invalidLink: 'Ugyldig linkdestination.',
    invalidContent: '\u00c6ndringen kunne ikke anvendes. Indholdet er ugyldigt eller for stort.',
    back: 'Tilbage til forrige guide', references: 'Denne guide henvises til fra',
    linkWarnings: 'Guidehenvisninger kr\u00e6ver kontrol',
    continueWithLinks: 'Nogle guidehenvisninger er arkiverede, utilg\u00e6ngelige eller peger p\u00e5 et fjernet trin. Indsend alligevel?',
    unavailable: 'Destinationen er ikke tilg\u00e6ngelig eller kunne ikke verificeres.',
    archived: 'Destinationen er arkiveret.', missingAnchor: 'Sektionen eller trinnet findes ikke l\u00e6ngere. Guiden \u00e5bnes i stedet.',
    translatedPlainText: 'Oversat visning: ren tekst',
    colors: ['M\u00f8rk', 'R\u00f8d', 'Gr\u00f8n', 'Bl\u00e5', 'Rav'],
  },
  en: {
    editor: 'Step text', heading: 'Section heading', formatting: 'Text formatting', bold: 'Bold', italic: 'Italic',
    underline: 'Underline', color: 'Text color', size: 'Text size',
    defaultStyle: 'Default', clearFormatting: 'Clear formatting', undo: 'Undo', redo: 'Redo',
    link: 'Edit link', removeLink: 'Remove link', guide: 'Guide', documents: 'Documents', web: 'Web',
    section: 'Section', step: 'Step', wholeGuide: 'Whole guide', wholeSection: 'Whole section',
    shared: 'Shared', savedTarget: 'Saved target', noGuides: 'No guides available',
    address: 'Address', apply: 'Apply', cancel: 'Cancel', note: 'Note', important: 'Important',
    invalidLink: 'Invalid link target.',
    invalidContent: 'The change could not be applied. Content is invalid or too large.',
    back: 'Back to previous guide', references: 'This guide is referenced by',
    linkWarnings: 'Guide references need checking',
    continueWithLinks: 'Some guide references are archived, unavailable, or point to a removed step. Submit anyway?',
    unavailable: 'The destination is unavailable or could not be verified.',
    archived: 'The destination is archived.', missingAnchor: 'The section or step no longer exists. Opening the guide instead.',
    translatedPlainText: 'Translated view: plain text',
    colors: ['Dark', 'Red', 'Green', 'Blue', 'Amber'],
  },
  fi: {
    editor: 'Vaiheen teksti', heading: 'Osion otsikko', formatting: 'Tekstin muotoilu', bold: 'Lihavointi', italic: 'Kursivointi',
    underline: 'Alleviivaus', color: 'Tekstin v\u00e4ri', size: 'Tekstin koko',
    defaultStyle: 'Oletus', clearFormatting: 'Poista muotoilu', undo: 'Kumoa', redo: 'Tee uudelleen',
    link: 'Muokkaa linkki\u00e4', removeLink: 'Poista linkki', guide: 'Ohje', documents: 'Asiakirjat', web: 'Verkko',
    section: 'Osio', step: 'Vaihe', wholeGuide: 'Koko ohje', wholeSection: 'Koko osio',
    shared: 'Jaettu', savedTarget: 'Tallennettu kohde', noGuides: 'Ei saatavilla olevia ohjeita',
    address: 'Osoite', apply: 'K\u00e4yt\u00e4', cancel: 'Peruuta', note: 'Huomautus', important: 'T\u00e4rke\u00e4\u00e4',
    invalidLink: 'Virheellinen linkin kohde.',
    invalidContent: 'Muutosta ei voitu tehd\u00e4. Sis\u00e4lt\u00f6 on virheellinen tai liian suuri.',
    back: 'Takaisin edelliseen ohjeeseen', references: 'T\u00e4h\u00e4n ohjeeseen viitataan ohjeissa',
    linkWarnings: 'Ohjeviittaukset on tarkistettava',
    continueWithLinks: 'Osa ohjeviittauksista on arkistoitu, ei ole saatavilla tai viittaa poistettuun vaiheeseen. L\u00e4hetet\u00e4\u00e4nk\u00f6 silti?',
    unavailable: 'Kohde ei ole saatavilla tai sit\u00e4 ei voitu tarkistaa.',
    archived: 'Kohde on arkistoitu.', missingAnchor: 'Osiota tai vaihetta ei en\u00e4\u00e4 ole. Avataan sen sijaan ohje.',
    translatedPlainText: 'K\u00e4\u00e4nnetty n\u00e4kym\u00e4: pelkk\u00e4 teksti',
    colors: ['Tumma', 'Punainen', 'Vihre\u00e4', 'Sininen', 'Meripihka'],
  },
  sv: {
    editor: 'Steg-text', heading: 'Avsnittsrubrik', formatting: 'Textformatering', bold: 'Fet', italic: 'Kursiv',
    underline: 'Understruken', color: 'Textfärg', size: 'Textstorlek',
    defaultStyle: 'Standard', clearFormatting: 'Ta bort formatering', undo: 'Ångra', redo: 'Gör om',
    link: 'Redigera länk', removeLink: 'Ta bort länk', guide: 'Guide', documents: 'Dokument', web: 'Webb',
    section: 'Avsnitt', step: 'Steg', wholeGuide: 'Hela guiden', wholeSection: 'Hela avsnittet',
    shared: 'Delad', savedTarget: 'Sparat mål', noGuides: 'Inga tillgängliga guider',
    address: 'Adress', apply: 'Använd', cancel: 'Avbryt', note: 'Notering', important: 'Viktigt',
    invalidLink: 'Ogiltigt länkmål.',
    invalidContent: 'Ändringen kunde inte tillämpas. Innehållet är ogiltigt eller för stort.',
    back: 'Tillbaka till föregående guide', references: 'Denna guide refereras från',
    linkWarnings: 'Guidereferenser behöver kontrolleras',
    continueWithLinks: 'Vissa guidereferenser är arkiverade, otillgängliga eller pekar på ett borttaget steg. Skicka in ändå?',
    unavailable: 'Målet är inte tillgängligt eller kunde inte verifieras.',
    archived: 'Målet är arkiverat.', missingAnchor: 'Avsnittet eller steget finns inte längre. Guiden öppnas i stället.',
    translatedPlainText: 'Översatt vy: ren text',
    colors: ['Mörk', 'Röd', 'Grön', 'Blå', 'Bärnsten'],
  },
}