// Round 14: the one place that turns an ISO day into the text a person reads. Expectations are literal on purpose (not derived from the module).
const test = require('node:test')
const assert = require('node:assert/strict')
const { formatDay, formatRange, formatHeading, formatMonthDay, closeSentence } = require('./assistantDateFormat.cjs')
const { calendarDate } = require('./assistantDates.cjs')

const NOW = new Date(2026, 8, 15, 12) // Tuesday 2026-09-15

test('one day: weekday, day and month in each language, nominative weekday in Finnish', () => {
  assert.equal(formatDay('2026-09-16', 'da', { now: NOW }), 'onsdag 16. sep.')
  assert.equal(formatDay('2026-09-16', 'en', { now: NOW }), 'Wed 16 Sep')
  assert.equal(formatDay('2026-09-16', 'fi', { now: NOW }), 'keskiviikko 16.9.')
  assert.equal(formatDay('2026-09-16', 'sv', { now: NOW }), 'onsdag 16 sep.')
})

test('every weekday maps to the right name (2026-09-13 is a Sunday)', () => {
  const expected = {
    da: ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    fi: ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'],
    sv: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'],
  }
  for (const language of ['da', 'en', 'fi', 'sv']) {
    for (let i = 0; i < 7; i++) assert.ok(formatDay(`2026-09-${13 + i}`, language, { now: NOW }).startsWith(expected[language][i]), `${language} ${13 + i}`)
  }
})

test('month abbreviations per language, all twelve', () => {
  const months = {
    da: ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    sv: ['jan.', 'feb.', 'mars', 'apr.', 'maj', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'],
  }
  for (const language of ['da', 'en', 'sv']) {
    months[language].forEach((name, index) => {
      const text = formatDay(`2026-${String(index + 1).padStart(2, '0')}-01`, language, { now: NOW, weekday: false })
      assert.equal(text, language === 'en' ? `1 ${name}` : language === 'da' ? `1. ${name}` : `1 ${name}`, `${language} ${index + 1}`)
    })
  }
  for (let month = 1; month <= 12; month++) assert.equal(formatDay(`2026-${String(month).padStart(2, '0')}-01`, 'fi', { now: NOW, weekday: false }), `1.${month}.`)
})

test('the weekday can be left out; Finnish "on"-phrases take the essive weekday', () => {
  assert.equal(formatDay('2026-09-21', 'da', { now: NOW, weekday: false }), '21. sep.')
  assert.equal(formatDay('2026-09-21', 'fi', { now: NOW, weekday: false }), '21.9.')
  assert.equal(formatDay('2026-09-21', 'fi', { now: NOW, inflect: 'essive' }), 'maanantaina 21.9.')
  assert.equal(formatDay('2026-09-26', 'fi', { now: NOW, inflect: 'essive' }), 'lauantaina 26.9.')
  assert.equal(formatDay('2026-09-21', 'sv', { now: NOW, inflect: 'essive' }), 'måndag 21 sep.', 'other languages ignore it')
})

test('the year is shown only when it is not the current year (current = the now that is passed in)', () => {
  assert.equal(formatDay('2027-01-04', 'da', { now: NOW }), 'mandag 4. jan. 2027')
  assert.equal(formatDay('2027-01-04', 'en', { now: NOW }), 'Mon 4 Jan 2027')
  assert.equal(formatDay('2027-01-04', 'fi', { now: NOW }), 'maanantai 4.1.2027')
  assert.equal(formatDay('2027-01-04', 'sv', { now: NOW }), 'måndag 4 jan. 2027')
  assert.equal(formatDay('2025-12-31', 'da', { now: NOW }), 'onsdag 31. dec. 2025')
  assert.equal(formatDay('2027-01-04', 'da', { now: new Date(2027, 0, 1, 12) }), 'mandag 4. jan.', 'the same date is year-less when now is in 2027')
  assert.equal(formatDay('2026-09-16', 'da', {}), 'onsdag 16. sep. 2026', 'without a now the year is always shown (never the real clock)')
})

test('leap day, month ends and year change', () => {
  assert.equal(formatDay('2028-02-29', 'da', { now: new Date(2028, 0, 10, 12) }), 'tirsdag 29. feb.')
  assert.equal(formatDay('2028-02-29', 'en', { now: new Date(2028, 0, 10, 12) }), 'Tue 29 Feb')
  assert.equal(formatDay('2026-01-31', 'fi', { now: NOW }), 'lauantai 31.1.')
  assert.equal(formatDay('2026-12-31', 'sv', { now: NOW }), 'torsdag 31 dec.')
  assert.equal(formatDay('2027-01-01', 'sv', { now: NOW }), 'fredag 1 jan. 2027')
  assert.equal(formatDay('2026-10-31', 'en', { now: NOW }), 'Sat 31 Oct')
})

test('ranges: same month, across months, across years, with the year rule', () => {
  assert.equal(formatRange('2026-09-16', '2026-09-20', 'da', { now: NOW }), '16.–20. sep.')
  assert.equal(formatRange('2026-09-16', '2026-09-20', 'en', { now: NOW }), '16–20 Sep')
  assert.equal(formatRange('2026-09-16', '2026-09-20', 'fi', { now: NOW }), '16.–20.9.')
  assert.equal(formatRange('2026-09-16', '2026-09-20', 'sv', { now: NOW }), '16–20 sep.')
  assert.equal(formatRange('2026-09-28', '2026-10-04', 'da', { now: NOW }), '28. sep.–4. okt.')
  assert.equal(formatRange('2026-09-28', '2026-10-04', 'en', { now: NOW }), '28 Sep–4 Oct')
  assert.equal(formatRange('2026-09-28', '2026-10-04', 'fi', { now: NOW }), '28.9.–4.10.')
  assert.equal(formatRange('2026-09-28', '2026-10-04', 'sv', { now: NOW }), '28 sep.–4 okt.')
  assert.equal(formatRange('2027-03-25', '2027-03-29', 'da', { now: NOW }), '25.–29. mar. 2027')
  assert.equal(formatRange('2027-03-25', '2027-04-02', 'fi', { now: NOW }), '25.3.–2.4.2027')
  assert.equal(formatRange('2026-12-28', '2027-01-03', 'da', { now: NOW }), '28. dec. 2026–3. jan. 2027')
  assert.equal(formatRange('2026-12-28', '2027-01-03', 'en', { now: NOW }), '28 Dec 2026–3 Jan 2027')
  assert.equal(formatRange('2026-12-28', '2027-01-03', 'fi', { now: NOW }), '28.12.2026–3.1.2027')
  assert.equal(formatRange('2026-12-28', '2027-01-03', 'sv', { now: NOW }), '28 dec. 2026–3 jan. 2027')
  assert.equal(formatRange('2026-09-01', '2026-09-30', 'da', { now: NOW }), '1.–30. sep.')
})

test('a one-day range is the day with its weekday; a reversed or broken range degrades to its parts', () => {
  assert.equal(formatRange('2026-09-18', '2026-09-18', 'da', { now: NOW }), 'fredag 18. sep.')
  assert.equal(formatRange('2026-09-18', '2026-09-18', 'fi', { now: NOW }), 'perjantai 18.9.')
  assert.equal(formatRange('2026-09-20', '2026-09-16', 'da', { now: NOW }), '20. sep.–16. sep.')
  assert.equal(formatRange('2026-09-16', undefined, 'da', { now: NOW }), 'onsdag 16. sep.')
  assert.equal(formatRange('nonsense', 'x', 'da', { now: NOW }), 'nonsense – x')
  assert.equal(formatRange(undefined, undefined, 'da', { now: NOW }), '')
})

test('headings: today, tomorrow and yesterday get the word plus the date, other days the date alone', () => {
  assert.equal(formatHeading('2026-09-15', '2026-09-15', 'da', { now: NOW }), 'i dag, tirsdag 15. sep.')
  assert.equal(formatHeading('2026-09-16', '2026-09-16', 'da', { now: NOW }), 'i morgen, onsdag 16. sep.')
  assert.equal(formatHeading('2026-09-14', '2026-09-14', 'da', { now: NOW }), 'i går, mandag 14. sep.')
  assert.equal(formatHeading('2026-09-17', '2026-09-17', 'da', { now: NOW }), 'torsdag 17. sep.')
  assert.equal(formatHeading('2026-09-16', '2026-09-16', 'en', { now: NOW }), 'tomorrow, Wed 16 Sep')
  assert.equal(formatHeading('2026-09-15', '2026-09-15', 'en', { now: NOW }), 'today, Tue 15 Sep')
  assert.equal(formatHeading('2026-09-14', '2026-09-14', 'en', { now: NOW }), 'yesterday, Mon 14 Sep')
  assert.equal(formatHeading('2026-09-16', '2026-09-16', 'fi', { now: NOW }), 'huomenna, keskiviikko 16.9.')
  assert.equal(formatHeading('2026-09-15', '2026-09-15', 'fi', { now: NOW }), 'tänään, tiistai 15.9.')
  assert.equal(formatHeading('2026-09-14', '2026-09-14', 'fi', { now: NOW }), 'eilen, maanantai 14.9.')
  assert.equal(formatHeading('2026-09-16', '2026-09-16', 'sv', { now: NOW }), 'imorgon, onsdag 16 sep.')
  assert.equal(formatHeading('2026-09-15', '2026-09-15', 'sv', { now: NOW }), 'idag, tisdag 15 sep.')
  assert.equal(formatHeading('2026-09-14', '2026-09-14', 'sv', { now: NOW }), 'igår, måndag 14 sep.')
  assert.equal(formatHeading('2026-09-21', '2026-09-27', 'da', { now: NOW }), '21.–27. sep.', 'a period never gets a relative word')
  assert.equal(formatHeading('2026-09-30', '2026-09-30', 'da', { now: new Date(2026, 9, 1, 12) }), 'i går, onsdag 30. sep.', 'month boundary')
  assert.equal(formatHeading('2027-01-01', '2027-01-01', 'da', { now: new Date(2026, 11, 31, 12) }), 'i morgen, fredag 1. jan. 2027', 'year boundary keeps the year')
  assert.equal(formatHeading('2026-09-16', '2026-09-16', 'da', {}), 'onsdag 16. sep. 2026', 'no now, no relative word')
})

test('month and day without a year (birthdays are stored as MM-DD)', () => {
  assert.equal(formatMonthDay('09-25', 'da'), '25. sep.')
  assert.equal(formatMonthDay('09-25', 'en'), '25 Sep')
  assert.equal(formatMonthDay('09-25', 'fi'), '25.9.')
  assert.equal(formatMonthDay('09-25', 'sv'), '25 sep.')
  assert.equal(formatMonthDay('02-29', 'da'), '29. feb.')
  assert.equal(formatMonthDay('13-45', 'da'), '13-45')
})

test('invalid or empty input falls back to the text as given, never throws, never prints "undefined" or "NaN"', () => {
  assert.equal(formatDay(undefined, 'da', { now: NOW }), '')
  assert.equal(formatDay(null, 'da', { now: NOW }), '')
  assert.equal(formatDay('', 'en', { now: NOW }), '')
  assert.equal(formatDay('not a date', 'da', { now: NOW }), 'not a date')
  assert.equal(formatDay('2026-02-30', 'da', { now: NOW }), '2026-02-30')
  assert.equal(formatDay('2027-02-29', 'en', { now: NOW }), '2027-02-29')
  assert.equal(formatDay('2026-13-01', 'fi', { now: NOW }), '2026-13-01')
  assert.equal(formatDay(20260916, 'da', { now: NOW }), '20260916')
  assert.equal(formatDay('2026-09-16', 'xx', { now: NOW }), 'onsdag 16. sep.', 'unknown language falls back to Danish')
  assert.equal(formatDay('2026-09-16', 'da', { now: new Date('nope') }), 'onsdag 16. sep. 2026', 'an invalid now counts as no now')
})

test('a time of day on the ISO value is ignored', () => {
  assert.equal(formatDay('2026-09-25T12:00:00', 'da', { now: NOW }), 'fredag 25. sep.')
  assert.equal(formatDay('2026-09-25T23:59:59.000Z', 'en', { now: NOW }), 'Fri 25 Sep')
})

test('a sentence that ends in an abbreviated date gets one full stop, not two', () => {
  assert.equal(closeSentence('Anne er tilbage mandag 21. sep.'), 'Anne er tilbage mandag 21. sep.')
  assert.equal(closeSentence('Anne is back on Mon 21 Sep'), 'Anne is back on Mon 21 Sep.')
  assert.equal(closeSentence('Anne palaa maanantaina 21.9.'), 'Anne palaa maanantaina 21.9.')
  assert.equal(closeSentence('Anne är tillbaka måndag 21 sep.'), 'Anne är tillbaka måndag 21 sep.')
  assert.equal(closeSentence(''), '.')
})

test('round trip: what Hubert writes can be typed back and is read as the same day (without the weekday and with the year when shown)', () => {
  // A year-less past date older than 120 days is read as next year (existing rule), so the round trip covers today and the future.
  const days = ['2026-06-30', '2026-07-04', '2026-09-15', '2026-09-16', '2026-10-31', '2026-11-03', '2026-12-24', '2026-12-31']
  for (const language of ['da', 'en', 'fi', 'sv']) {
    for (const day of days) {
      const typed = formatDay(day, language, { now: NOW, weekday: false })
      assert.equal(calendarDate(typed, NOW), day, `${language} ${typed}`)
    }
    for (const day of ['2027-01-05', '2027-02-28', '2027-12-24']) {
      const typed = formatDay(day, language, { now: NOW, weekday: false })
      assert.equal(calendarDate(typed, NOW), day, `${language} ${typed}`)
    }
  }
})
