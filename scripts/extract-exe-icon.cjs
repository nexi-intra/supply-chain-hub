const fs = require('fs')
const path = require('path')
const PELibrary = require('pe-library')
const ResEdit = require('resedit')

const source = process.argv[2]
const target = process.argv[3]
if (!source || !target) {
  throw new Error('Brug: node scripts/extract-exe-icon.cjs <kilde.exe> <mål.ico>')
}

const executable = PELibrary.NtExecutable.from(fs.readFileSync(source))
const resources = PELibrary.NtExecutableResource.from(executable)
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)
if (groups.length === 0) throw new Error(`Ingen ikonressource fundet i ${source}`)

// Det første ikon-group er programmets almindelige Windows-applikationsikon.
const group = groups[0]
const iconItems = group.getIconItemsFromEntries(resources.entries)
const iconFile = new ResEdit.Data.IconFile()
iconFile.icons = iconItems.map((data, index) => ({
  width: group.icons[index]?.width,
  height: group.icons[index]?.height,
  colors: group.icons[index]?.colors,
  planes: group.icons[index]?.planes,
  bitCount: group.icons[index]?.bitCount,
  data,
}))

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, Buffer.from(iconFile.generate()))
console.log(`Udtrak ${iconItems.length} ikonstørrelser til ${target}`)
