const REQUIRED = ['VBELN', 'TRACKINGNO', 'AUART', 'POST_CODE', 'COUNTRY', 'ERDAT', 'SHIPPED_DATE'];

function decode(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le').slice(1);
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function isoDate(sapDate) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(sapDate.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseSapList(buffer) {
  const lines = decode(buffer).split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const head = lines[0].split('\t').map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !head.includes(h));
  if (missing.length) throw new Error(`ZMS_cons_info har ændret kolonner (mangler ${missing.join(', ')})`);
  const col = Object.fromEntries(REQUIRED.map((h) => [h, head.indexOf(h)]));
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const get = (h) => (cells[col[h]] || '').trim();
    return {
      delivery: get('VBELN').replace(/^0+/, ''),
      tracking: get('TRACKINGNO'),
      orderType: get('AUART'),
      postalCode: get('POST_CODE'),
      country: get('COUNTRY'),
      createdOn: isoDate(get('ERDAT')),
      shippedOn: isoDate(get('SHIPPED_DATE')),
    };
  });
}

module.exports = { parseSapList };
