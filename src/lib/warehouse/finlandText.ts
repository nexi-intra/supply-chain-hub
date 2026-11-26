// Finlandsforsendelser's backend writes some texts for the window in Danish (why a parcel needs a check, what is wrong
// with a row typed in by hand, how the sheet was opened). In English the known ones are shown in English; anything
// else is shown as the backend wrote it.
import { currentWarehouseLanguage, t } from './text'

const TEXTS: [string, string][] = [
  // Why a parcel is to be checked (core/compare.cjs)
  ['Levering står i arket med et andet T&T', 'The delivery is in the sheet with another T&T'],
  ['Ukendt courier', 'Unknown courier'],
  ['Mangler T&T', 'No T&T'],
  // A row typed in by hand (core/manualRow.cjs and service.cjs)
  ['Skriv leveringsnummeret.', 'Type the delivery number.'],
  ['Leveringsnummeret må kun have cifre.', 'The delivery number may only have digits.'],
  ['Leveringsnummeret kan ikke kun være nuller.', 'The delivery number cannot be only zeros.'],
  ['Order type må højst have 10 tegn.', 'Order type may have at most 10 characters.'],
  ['Order type må kun have bogstaver og cifre, fx ZRO.', 'Order type may only have letters and digits, e.g. ZRO.'],
  ['Skriv postnummeret.', 'Type the postal code.'],
  ['Postnummeret er for langt.', 'The postal code is too long.'],
  ['Vælg DSV, PostNord eller DHL.', 'Choose DSV, PostNord or DHL.'],
  ['Skriv T&T-nummeret.', 'Type the T&T number.'],
  ['T&T skal være 20 cifre (DSV og PostNord) eller JD og 18 cifre (DHL).', 'The T&T must be 20 digits (DSV and PostNord) or JD and 18 digits (DHL).'],
  ['Et DHL-nummer starter med JD. Vælg DSV eller PostNord.', 'A DHL number starts with JD. Choose DSV or PostNord.'],
  ['Vælg datoen for afhentning.', 'Choose the pick-up date.'],
  ['Datoen findes ikke.', 'The date does not exist.'],
  ['Datoen må ikke ligge efter i dag.', 'The date may not be after today.'],
  ['Kolliet er markeret som ikke sendt. Tryk "Sæt ind igen" først.', 'The parcel is marked as not sent. Press "Put back" first.'],
  ['Kolliet er skrevet i arket for lidt siden. Tryk "Læs arket".', 'The parcel was written in the sheet a moment ago. Press "Read the sheet".'],
  // How the sheet was opened (excel.cjs)
  ['Arket er åbent i Excel', 'The sheet is open in Excel'],
  ['Arket er åbnet fra SharePoint', 'The sheet was opened from SharePoint'],
  ['Filteret i arket er fjernet, så alle rækker kan ses', 'The filter in the sheet was removed, so every row can be seen'],
]

const ENGLISH = new Map(TEXTS)

const PATTERNS: [RegExp, (...groups: string[]) => string][] = [
  [/^Står allerede i række (\d+)\.$/, row => `Already on row ${row}.`],
  [/^T&T står allerede på levering (\d+) i række (\d+)\.$/, (delivery, row) => `The T&T is already on delivery ${delivery} on row ${row}.`],
  [/^Nummeret er et (\S+)-nummer\. Vælg (\S+)\.$/, courier => `The number is a ${courier} number. Choose ${courier}.`],
]

/** A Danish text from Finlandsforsendelser's backend, in the window's language where it is known. */
export function backendText(danish: string): string {
  if (currentWarehouseLanguage() === 'da') return danish
  const known = ENGLISH.get(danish)
  if (known) return known
  for (const [pattern, english] of PATTERNS) {
    const match = pattern.exec(danish)
    if (match) return english(...match.slice(1))
  }
  return danish
}

/** "3 kolli" / "3 parcels". */
export const kolli = (count: number) => t(`${count} kolli`, count === 1 ? '1 parcel' : `${count} parcels`)
