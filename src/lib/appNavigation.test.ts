import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import type { AssistantApi, AssistantSource } from './assistantBridge'

describe('one-shot navigation params', () => {
  it('peeking leaves them for the mounted view to clear, consuming clears them', async () => {
    vi.stubGlobal('window', { dispatchEvent: () => true })
    try {
      const { navigateTo, peekNavigationParams, consumeNavigationParams } = await import('./appNavigation')
      navigateTo('games', { tab: 'multiplayer', itemId: 'game-1' })
      expect(peekNavigationParams()).toEqual({ tab: 'multiplayer', itemId: 'game-1' })
      expect(peekNavigationParams()).toEqual({ tab: 'multiplayer', itemId: 'game-1' })
      expect(consumeNavigationParams()).toEqual({ tab: 'multiplayer', itemId: 'game-1' })
      expect(peekNavigationParams()).toBeNull()
      expect(consumeNavigationParams()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

function appClickHandler(setCurrentView: (view: string) => void): (moduleId: string) => void {
  const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let initializer: ts.Expression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleNavigate') initializer = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!initializer) throw new Error('App click handler not found')
  const compiled = ts.transpileModule(`const navigate = ${initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function('setCurrentView', `${compiled}\nreturn navigate;`)(setCurrentView)
}

describe('main Hub module clicks', () => {
  it('opens the improvements view through the actual App click handler', () => {
    const views: string[] = []
    appClickHandler(view => views.push(view))('improvements')
    expect(views).toEqual(['improvements'])
  })

  it('keeps existing module navigation and ignores unavailable module IDs', () => {
    const views: string[] = []
    const navigate = appClickHandler(view => views.push(view))
    navigate('guides')
    navigate('projects')
    navigate('notebook')
    navigate('documents')
    expect(views).toEqual(['guides', 'projects', 'notebook'])
  })

  it('opens the Knowledge Base and still opens Game Corner', () => {
    const views: string[] = []
    const navigate = appClickHandler(view => views.push(view))
    navigate('knowledge')
    navigate('games')
    expect(views).toEqual(['knowledge', 'games'])
  })
})

function hubModules(): Array<{ id: string; icon: string; available: string }> {
  const source = ts.createSourceFile('Hub.tsx', readFileSync(new URL('../views/Hub.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let modules: ts.ArrayLiteralExpression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'modules' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) modules = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!modules) throw new Error('Hub modules not found')
  return modules.elements.filter(ts.isObjectLiteralExpression).map((module) => {
    const property = (name: string) => module.properties.find((entry): entry is ts.PropertyAssignment => ts.isPropertyAssignment(entry) && entry.name.getText(source) === name)?.initializer
    const icon = property('icon')
    const tag = icon && ts.isJsxSelfClosingElement(icon) ? icon.tagName.getText(source) : ''
    return { id: (property('id') as ts.StringLiteral).text, icon: tag, available: property('available')?.getText(source) || '' }
  })
}

describe('Hub module tiles', () => {
  const modules = hubModules()
  const ids = modules.map((module) => module.id)

  it('places the Knowledge Base directly after the Guide Library', () => {
    expect(ids.indexOf('knowledge')).toBe(ids.indexOf('guides') + 1)
    expect(modules.find((module) => module.id === 'knowledge')?.available).toBe('true')
  })

  it('gives the Knowledge Base its own Brain icon that no other module uses', () => {
    expect(modules.find((module) => module.id === 'knowledge')?.icon).toBe('Brain')
    const icons = modules.map((module) => module.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('keeps Game Corner as its own available tile with its controller icon', () => {
    expect(modules.find((module) => module.id === 'games')).toEqual({ id: 'games', icon: 'GameController', available: 'true' })
  })

  it('keeps Game Corner in the bottom-left corner of the employees\' four-column grid; managers get the Manager Panel on a row of its own', () => {
    const everyone = modules.filter((module) => module.available === 'true').map((module) => module.id)
    const managers = modules.filter((module) => module.available === 'true' || module.id === 'manager').map((module) => module.id)
    expect(everyone.indexOf('games')).toBe(Math.floor((everyone.length - 1) / 4) * 4)
    expect(everyone.indexOf('games')).toBe(8)
    expect(managers.indexOf('games')).toBe(8)
    expect(managers.indexOf('manager')).toBe(Math.floor((managers.length - 1) / 4) * 4)
  })
})

describe('Hubert library sources', () => {
  const source = ts.createSourceFile('HubAssistant.tsx', readFileSync(new URL('../components/HubAssistant.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function handler(name: string, bindings: Record<string, unknown>) {
    let initializer: ts.Expression | undefined
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) initializer = node.initializer
      ts.forEachChild(node, visit)
    }
    visit(source)
    if (!initializer) throw new Error(`${name} handler not found`)
    const compiled = ts.transpileModule(`const handler = ${initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    return new Function(...Object.keys(bindings), `${compiled}\nreturn handler;`)(...Object.values(bindings))
  }

  it('fetches an article source from its library rather than the Guide Library', async () => {
    const requests: unknown[] = []
    const openSource = handler('openSource', {
      api: { guide: async (request: Parameters<AssistantApi['guide']>[0]) => { requests.push(request); return { id: 'article', version: '1.00' } } },
      token: 'valid', language: 'en', sequence: { current: 1 }, setSelectedGuide: () => {}, setError: () => {}, linkSourceId: () => '',
    }) as (source: AssistantSource) => Promise<void>
    await openSource({ kind: 'guide', teamId: 'TCD', guideId: 'article', title: 'Article', version: '1.00', library: 'knowledge' } as AssistantSource)
    expect(requests).toEqual([{ token: 'valid', teamId: 'TCD', guideId: 'article', library: 'knowledge' }])
  })

  it('fetches article attachments with the same library and authorization scope', async () => {
    const requests: unknown[] = []
    const load = handler('fileLoader', {
      useCallback: (callback: unknown) => callback,
      api: { image: async (request: unknown) => { requests.push(request); return 'data:application/pdf;base64,JVBERi0=' } },
      token: 'valid', selectedGuide: { guide: { id: 'article' }, source: { teamId: 'TCD', library: 'knowledge' } },
    }) as (url: string) => Promise<Blob>
    await load('kv://file_original')
    expect(requests).toEqual([{ token: 'valid', teamId: 'TCD', guideId: 'article', imageId: 'file_original', library: 'knowledge' }])
  })

  it('renders article sources within their own LibraryProvider', () => {
    let kind: string | undefined
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'LibraryProvider' && node.children.some(child => ts.isJsxSelfClosingElement(child) && child.tagName.getText(source) === 'GuideViewer')) {
        kind = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'kind')?.getText(source)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(kind).toBe('kind={selectedGuide?.source.library || \'guides\'}')
  })
})