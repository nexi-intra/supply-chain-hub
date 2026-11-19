import type { Language } from './translations'

export function wordPdfErrorMessage(error: unknown, language: Language): string | null {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.match(/WORD_PDF_(?:UNAVAILABLE|BUSY|TIMEOUT|FAILED)/)?.[0]
  if (!code) return null
  const labels = {
    WORD_PDF_UNAVAILABLE: {
      da: 'Microsoft Word er ikke tilgængelig på denne computer. PDF-visning af originale Word-guides kræver Word.',
      en: 'Microsoft Word is unavailable on this computer. Original-layout guide PDF previews require Word.',
      fi: 'Microsoft Word ei ole käytettävissä tällä tietokoneella. Alkuperäisen asettelun PDF-esikatselu edellyttää Wordia.',
      sv: 'Microsoft Word är inte tillgängligt på den här datorn. PDF-förhandsvisning av Word-guider med originallayout kräver Word.',
    },
    WORD_PDF_BUSY: {
      da: 'Word kunne ikke starte en separat visningsproces. Luk Word og prøv igen.',
      en: 'Word could not start a separate preview process. Close Word and try again.',
      fi: 'Word ei voinut käynnistää erillistä esikatseluprosessia. Sulje Word ja yritä uudelleen.',
      sv: 'Word kunde inte starta en separat förhandsvisningsprocess. Stäng Word och försök igen.',
    },
    WORD_PDF_TIMEOUT: {
      da: 'Word brugte for lang tid på at danne PDF-visningen. Prøv igen eller åbn originalen i Word.',
      en: 'Word took too long to create the PDF preview. Try again or open the original in Word.',
      fi: 'Word käytti liian kauan PDF-esikatselun luomiseen. Yritä uudelleen tai avaa alkuperäinen Wordissa.',
      sv: 'Word tog för lång tid på sig att skapa PDF-förhandsvisningen. Försök igen eller öppna originalet i Word.',
    },
    WORD_PDF_FAILED: {
      da: 'Word kunne ikke danne PDF-visningen. Originalfilen er ikke ændret. Prøv igen eller åbn den i Word.',
      en: 'Word could not create the PDF preview. The original file is unchanged. Try again or open it in Word.',
      fi: 'Word ei voinut luoda PDF-esikatselua. Alkuperäinen tiedosto ei muuttunut. Yritä uudelleen tai avaa se Wordissa.',
      sv: 'Word kunde inte skapa PDF-förhandsvisningen. Originalfilen är oförändrad. Försök igen eller öppna den i Word.',
    },
  } as const
  return labels[code as keyof typeof labels][language]
}
