// Words for the nisse hunt. None of them may hint at where the nisse hides (Jacob: no tips).

export interface NisseLabels {
  nisse: string
  searching: string
  wonTitle: string
  wonBody: string
  taken: (name: string, time: string) => string
  preview: string
  failed: string
  foundLine: (name: string, time: string) => string
  foundToast: (name: string, time: string) => string
  greetingTitle: string
  greetingBody: (hub: string) => string
  greetingOn: string
  greetingGo: string
  close: string
}

const LABELS: Record<string, NisseLabels> = {
  da: {
    nisse: 'Nisse',
    searching: 'Nissen tjekker, om du er den første …',
    wonTitle: 'Du fandt dagens nisse! 🍫',
    wonBody: 'Du var den første i dag. Din chokolade er på vej.',
    taken: (name, time) => `Nissen er allerede fundet i dag af ${name} kl. ${time}.`,
    preview: 'Det her er kun en forhåndsvisning, så fundet tæller ikke.',
    failed: 'Nissen kunne ikke registreres lige nu. Prøv igen om lidt.',
    foundLine: (name, time) => `Dagens nisse blev fundet af ${name} kl. ${time}`,
    foundToast: (name, time) => `🎅 Nissen er fundet af ${name} kl. ${time}. Du kan godt stoppe med at lede.`,
    greetingTitle: 'God jul fra hubben! 🎄',
    greetingBody: hub => `Nu begynder dagens nisseleg i ${hub}. En lille nisse har gemt sig et sted i appen, og den første, der finder den, får en chokolade.`,
    greetingOn: 'Slå juletema til og vær med',
    greetingGo: 'God jagt!',
    close: 'Luk',
  },
  en: {
    nisse: 'Nisse',
    searching: 'The elf is checking whether you were first …',
    wonTitle: "You found today's elf! 🍫",
    wonBody: 'You were the first today. Your chocolate is on its way.',
    taken: (name, time) => `The elf was already found today by ${name} at ${time}.`,
    preview: "This is only a preview, so the find doesn't count.",
    failed: "The find couldn't be saved right now. Try again in a moment.",
    foundLine: (name, time) => `Today's elf was found by ${name} at ${time}`,
    foundToast: (name, time) => `🎅 The elf was found by ${name} at ${time}. You can stop searching now.`,
    greetingTitle: 'Merry Christmas from the hub! 🎄',
    greetingBody: hub => `Today's elf hunt starts now in ${hub}. A little elf is hiding somewhere in the app, and the first to find it gets a chocolate.`,
    greetingOn: 'Turn on the Christmas theme and join in',
    greetingGo: 'Happy hunting!',
    close: 'Close',
  },
  fi: {
    nisse: 'Nisse',
    searching: 'Tonttu tarkistaa, olitko ensimmäinen …',
    wonTitle: 'Löysit päivän tontun! 🍫',
    wonBody: 'Olit tänään ensimmäinen. Suklaasi on tulossa.',
    taken: (name, time) => `${name} löysi tontun jo tänään klo ${time}.`,
    preview: 'Tämä on vain esikatselu, joten löytö ei lasketa.',
    failed: 'Löytöä ei voitu tallentaa juuri nyt. Yritä hetken päästä uudelleen.',
    foundLine: (name, time) => `${name} löysi päivän tontun klo ${time}`,
    foundToast: (name, time) => `🎅 ${name} löysi tontun klo ${time}. Voit lopettaa etsimisen.`,
    greetingTitle: 'Hyvää joulua hubista! 🎄',
    greetingBody: hub => `Päivän tonttujahti alkaa nyt: ${hub}. Pieni tonttu on piilossa jossain sovelluksessa, ja ensimmäinen löytäjä saa suklaata.`,
    greetingOn: 'Ota jouluteema käyttöön ja osallistu',
    greetingGo: 'Hyvää metsästystä!',
    close: 'Sulje',
  },
  sv: {
    nisse: 'Nisse',
    searching: 'Tomten kollar om du var först …',
    wonTitle: 'Du hittade dagens tomte! 🍫',
    wonBody: 'Du var först i dag. Din choklad är på väg.',
    taken: (name, time) => `Tomten hittades redan i dag av ${name} kl. ${time}.`,
    preview: 'Det här är bara en förhandsvisning, så fyndet räknas inte.',
    failed: 'Fyndet kunde inte sparas just nu. Försök igen om en stund.',
    foundLine: (name, time) => `Dagens tomte hittades av ${name} kl. ${time}`,
    foundToast: (name, time) => `🎅 Tomten hittades av ${name} kl. ${time}. Du kan sluta leta nu.`,
    greetingTitle: 'God jul från hubben! 🎄',
    greetingBody: hub => `Nu börjar dagens tomtejakt i ${hub}. En liten tomte gömmer sig någonstans i appen, och den som hittar den först får en choklad.`,
    greetingOn: 'Slå på jultemat och var med',
    greetingGo: 'Lycka till!',
    close: 'Stäng',
  },
}

export function nisseLabels(language: string): NisseLabels {
  return LABELS[language] ?? LABELS.en
}
