import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// In English, Optælling must not show Danish. Every Danish text in the module's screens goes through t(da, en)
// (or a `da:` entry next to an `en:` one); this scan finds the ones that do not.
const ROOT = join(__dirname, '..', '..', '..')
const FOLDERS = ['src/views/warehouse', 'src/components/warehouse', 'src/lib/warehouse']
// errors.ts keeps its Danish texts in MESSAGES and has its own English test; text.ts is the t() helper itself.
const SKIP = new Set(['src/lib/warehouse/errors.ts', 'src/lib/warehouse/text.ts'])

const DANISH_WORDS = /(^|[^\p{L}])(og|ikke|af|på|til|med|kan|skal|eller|hvis|når|ingen|alle|fra|efter|hent|gem|annuller|luk|tilbage|arkiv|nyt?|vis|slet|tilføj|fjern|vælg|søg|opret|afslut|godkend|bogfør|antal|materialer?|serienumre|serienummer|placering|placeringer|lagerregler|optællinger?|dokumenter|mangler|fundet|talt|godkendt|låst|bruger|brugere|spærret|hvem|der|ved|denne|dette|igen|ændr|ændret)(?=$|[^\p{L}])/iu

export const looksDanish = (text: string) => /[æøåÆØÅ]/.test(text) || DANISH_WORDS.test(text)

function files(folder: string): string[] {
  return readdirSync(folder).flatMap(name => {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

function isTranslated(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    const parent = current.parent
    if (!parent) return false
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 't' && parent.arguments[0] === current) return true
    // { da: …, en: … } tables; Swedish and Finnish entries (Manager Panel card) are their own languages.
    if (ts.isPropertyAssignment(parent) && parent.initializer === current && /^["']?(da|sv|fi)["']?$/.test(parent.name.getText())) return true
    // A ['dansk', 'English'] pair for t(...pair).
    if (ts.isArrayLiteralExpression(parent) && parent.elements.length === 2 && parent.elements[0] === current && ts.isStringLiteralLike(parent.elements[1])) return true
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true
  }
  return false
}

function untranslated(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    let text: string | null = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text
    else if (ts.isJsxText(node)) text = node.text.trim()
    if (text && looksDanish(text) && !isTranslated(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
      found.push(`${relative(ROOT, path).replace(/\\/g, '/')}:${line}  ${text.slice(0, 70)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('Optælling in English', () => {
  it('the detector recognises Danish and leaves English and code alone', () => {
    for (const text of ['Hent fra SAP', 'Ny optælling', 'Gem', 'Annuller', 'Alle materialer', 'Spærret']) expect(looksDanish(text), text).toBe(true)
    for (const text of ['Fetch from SAP', 'New count', 'Save', 'flex items-center gap-2', 'warehouse:counts:list', 'PS4', 'Status']) expect(looksDanish(text), text).toBe(false)
  })

  it('every Danish text in the screens goes through t(da, en)', () => {
    const relativeFiles = FOLDERS.flatMap(folder => files(join(ROOT, folder))).filter(path => !SKIP.has(relative(ROOT, path).replace(/\\/g, '/')))
    expect(relativeFiles.length).toBeGreaterThan(30)
    const leaks = relativeFiles.flatMap(untranslated)
    expect(leaks, `${leaks.length} danske tekster uden t():\n${leaks.join('\n')}`).toEqual([])
  })
})
