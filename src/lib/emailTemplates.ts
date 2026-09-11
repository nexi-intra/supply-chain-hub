// Deterministic Danish email templates. These replace the previous
// LLM-generated notification emails so the app works fully offline
// with no AI backend dependency.

export interface EmailContent {
  subject: string
  body: string
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 'ukendt dato'
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
}

const AUTO_NOTE = 'Dette er en automatisk notifikation fra Supply Chain Hub.'

export function vacationRequestEmail(employeeName: string, start: Date | string, end: Date | string, notes?: string): EmailContent {
  return {
    subject: `Ny ferieanmodning fra ${employeeName}`,
    body: [
      `${employeeName} har anmodet om ferie.`,
      '',
      `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      notes ? `Bemærkninger: ${notes}` : 'Ingen bemærkninger.',
      '',
      'Gå til Manager Panelet for at godkende eller afvise anmodningen.',
      '',
      AUTO_NOTE,
    ].join('\n'),
  }
}

export function vacationApprovedEmail(start: Date | string, end: Date | string, approvedBy: string, notes?: string): EmailContent {
  return {
    subject: 'Din ferieanmodning er godkendt',
    body: [
      'Godt nyt! Din ferieanmodning er blevet godkendt.',
      '',
      `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      notes ? `Bemærkninger: ${notes}` : '',
      `Godkendt af: ${approvedBy}`,
      '',
      'God ferie!',
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function vacationRejectedEmail(start: Date | string, end: Date | string, rejectedBy: string, notes?: string): EmailContent {
  return {
    subject: 'Din ferieanmodning er afvist',
    body: [
      'Din ferieanmodning er desværre blevet afvist.',
      '',
      `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      notes ? `Bemærkninger: ${notes}` : '',
      `Afvist af: ${rejectedBy}`,
      '',
      'Kontakt din manager, hvis du har spørgsmål eller ønsker at aftale alternative datoer.',
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function vacationEditedEmail(
  originalStart: Date | string,
  originalEnd: Date | string,
  newStart: Date | string,
  newEnd: Date | string,
  editedBy: string,
  newNotes?: string,
): EmailContent {
  return {
    subject: 'Din ferie er blevet ændret',
    body: [
      'En manager har ændret din registrerede ferie.',
      '',
      `Tidligere periode: ${formatDate(originalStart)} til ${formatDate(originalEnd)}`,
      `Ny periode: ${formatDate(newStart)} til ${formatDate(newEnd)}`,
      newNotes ? `Bemærkninger: ${newNotes}` : '',
      `Ændret af: ${editedBy}`,
      '',
      'Kontakt din manager, hvis du har spørgsmål til ændringen.',
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function vacationDeletedEmail(start: Date | string, end: Date | string, status: string, deletedBy: string, notes?: string): EmailContent {
  const statusLabel = status === 'approved' ? 'Godkendt' : status === 'pending' ? 'Afventende' : 'Ukendt'
  return {
    subject: 'Din ferie er blevet slettet',
    body: [
      'En manager har fjernet din ferie fra systemet.',
      '',
      `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      `Status ved sletning: ${statusLabel}`,
      notes ? `Bemærkninger: ${notes}` : '',
      `Slettet af: ${deletedBy}`,
      '',
      'Kontakt din manager, hvis du har spørgsmål, eller hvis dette er sket ved en fejl.',
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function vacationCancelledByEmployeeEmail(employeeName: string, start: Date | string, end: Date | string): EmailContent {
  return {
    subject: `${employeeName} har annulleret en ferieanmodning`,
    body: [
      `${employeeName} har annulleret sin ferieanmodning.`,
      '',
      `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      '',
      AUTO_NOTE,
    ].join('\n'),
  }
}

export function singleDayOffRequestEmail(employeeName: string, date: Date | string, notes?: string): EmailContent {
  return {
    subject: `Ny anmodning om fridag fra ${employeeName}`,
    body: [
      `${employeeName} har anmodet om en enkelt fridag.`,
      '',
      `Dato: ${formatDate(date)}`,
      notes ? `Bemærkninger: ${notes}` : 'Ingen bemærkninger.',
      '',
      'Gå til Manager Panelet for at godkende eller afvise anmodningen.',
      '',
      AUTO_NOTE,
    ].join('\n'),
  }
}

export function vacationRequestConfirmationEmail(start: Date | string, end: Date | string, notes?: string): EmailContent {
  return {
    subject: 'Din ferieanmodning er modtaget',
    body: [
      'Vi har modtaget din ferieanmodning.',
      '',
      `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      notes ? `Dine bemærkninger: ${notes}` : '',
      '',
      'Anmodningen afventer nu godkendelse fra en manager. Du får besked, så snart den er behandlet.',
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function singleDayOffConfirmationEmail(date: Date | string, notes?: string): EmailContent {
  return {
    subject: 'Din anmodning om fridag er modtaget',
    body: [
      'Vi har modtaget din anmodning om en fridag.',
      '',
      `Dato: ${formatDate(date)}`,
      notes ? `Dine bemærkninger: ${notes}` : '',
      '',
      'Anmodningen afventer nu godkendelse fra en manager. Du får besked, så snart den er behandlet.',
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function manualVacationGrantEmail(grantedBy: string, start: Date | string, end: Date | string, isSingleDay: boolean, notes?: string): EmailContent {
  return {
    subject: isSingleDay ? 'Du har fået tildelt en fridag' : 'Du har fået tildelt ferie',
    body: [
      isSingleDay
        ? 'En manager har tildelt dig en fridag.'
        : 'En manager har tildelt dig ferie.',
      '',
      isSingleDay ? `Dato: ${formatDate(start)}` : `Periode: ${formatDate(start)} til ${formatDate(end)}`,
      notes ? `Bemærkninger: ${notes}` : '',
      `Tildelt af: ${grantedBy}`,
      '',
      AUTO_NOTE,
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n'),
  }
}

export function userSignupRequestEmail(fullName: string, email: string, phone: string): EmailContent {
  return {
    subject: `Ny brugeranmodning: ${fullName}`,
    body: [
      'En ny bruger har anmodet om adgang til Supply Chain Hub.',
      '',
      `Navn: ${fullName}`,
      `Email: ${email}`,
      `Telefon: ${phone}`,
      '',
      'Gå til Manager Panelet under "Rettigheder" for at godkende eller afvise anmodningen.',
      '',
      AUTO_NOTE,
    ].join('\n'),
  }
}

export function userApprovedEmail(fullName: string, approvedBy: string): EmailContent {
  return {
    subject: 'Din adgang til Supply Chain Hub er godkendt',
    body: [
      `Hej ${fullName},`,
      '',
      'Din konto er blevet godkendt, og du kan nu logge ind på Supply Chain Hub.',
      `Godkendt af: ${approvedBy}`,
      '',
      AUTO_NOTE,
    ].join('\n'),
  }
}

export function userRejectedEmail(fullName: string, rejectedBy: string): EmailContent {
  return {
    subject: 'Din anmodning om adgang til Supply Chain Hub er afvist',
    body: [
      `Hej ${fullName},`,
      '',
      'Din anmodning om adgang er desværre blevet afvist.',
      `Afvist af: ${rejectedBy}`,
      '',
      'Kontakt en manager, hvis du mener, det er en fejl.',
      '',
      AUTO_NOTE,
    ].join('\n'),
  }
}
