import JSZip from 'jszip'

export async function validateDocx(file: File): Promise<void> {
  if (!/\.docx$/i.test(file.name)) throw new Error('Kun .docx-filer kan importeres')
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: false })
    if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) throw new Error('Missing Word parts')
  } catch {
    throw new Error('Filen er ikke et gyldigt Word-dokument (.docx)')
  }
}