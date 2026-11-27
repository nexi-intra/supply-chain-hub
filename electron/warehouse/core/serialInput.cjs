// A serial a person scanned or typed. TRR's scanners read 24 digits where SAP knows the last 18, so exactly 24 digits
// (spaces ignored) become the last 18; anything else goes on unchanged to the normal check. Never used on serials from SAP.
function scannedSerial(value) {
  const text = String(value ?? '')
  const digits = text.replace(/\s+/g, '')
  return /^\d{24}$/.test(digits) ? digits.slice(-18) : text
}

module.exports = { scannedSerial }
