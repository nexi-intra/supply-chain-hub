import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Every place that has Finnish text must also have Swedish. TypeScript catches Record<Language, …>;
// this catches inline objects, ternaries and locales that would silently fall back to English.
const root = join(__dirname, '..')
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}
const count = (text: string, pattern: RegExp) => (text.match(pattern) || []).length
const CHECKS: Array<[string, RegExp, RegExp]> = [
  ['language ternary', /===\s*['"]fi['"]/g, /===\s*['"]sv['"]/g],
  ['inline text object', /(?:^|[\s{,])fi:\s*[{'"`(\[]/g, /(?:^|[\s{,])sv:\s*[{'"`(\[]/g],
  ['locale', /['"]fi-FI['"]/g, /['"]sv-SE['"]/g],
  ['date-fns locale', /\bfi\b[^;\n]*from ['"]date-fns\/locale['"]|from ['"]date-fns\/locale['"][^;\n]*\bfi\b/g, /\bsv\b[^;\n]*from ['"]date-fns\/locale['"]/g],
]

describe('Swedish coverage', () => {
  it('every file with Finnish texts, ternaries or locales also has Swedish', () => {
    const gaps: string[] = []
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8')
      for (const [label, finnish, swedish] of CHECKS) {
        const fi = count(text, finnish)
        const sv = count(text, swedish)
        if (sv < fi) gaps.push(`${relative(root, file)}: ${label} fi=${fi} sv=${sv}`)
      }
    }
    expect(gaps).toEqual([])
  }, 30_000) // scans every source file: >5 s when the whole suite runs in parallel
})
