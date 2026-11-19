const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')

const baseUrl = process.env.GUIDE_VERIFY_URL || 'http://127.0.0.1:5019'
const selectionOnly = process.argv.includes('--selection-only')
const appearanceOnly = process.argv.includes('--appearance-only')

async function selectEditorText(page, textbox, expectedText, keys = ['Control+Home', 'Control+Shift+End']) {
  await textbox.click()
  await page.waitForFunction(expectedLabel => document.activeElement?.getAttribute('aria-label') === expectedLabel
    && document.activeElement?.getAttribute('contenteditable') === 'true'
    && document.activeElement.editor?.isInitialized
    && document.activeElement.editor?.isEditorContentInitialized, await textbox.getAttribute('aria-label'))
  for (const key of keys) await page.keyboard.press(key)
  const state = await textbox.evaluate(element => {
    const editor = element.editor
    const native = document.getSelection()
    return {
      initialized: editor?.isInitialized, contentMounted: editor?.isEditorContentInitialized,
      focused: document.activeElement === element, documentFocused: document.hasFocus(), html: element.innerHTML,
      native: { text: native?.toString(), anchor: native?.anchorNode?.nodeName, anchorOffset: native?.anchorOffset,
        focus: native?.focusNode?.nodeName, focusOffset: native?.focusOffset, ranges: native?.rangeCount,
        insideEditor: !!native?.anchorNode && !!native?.focusNode && element.contains(native.anchorNode) && element.contains(native.focusNode) },
      proseMirror: editor ? { ...editor.state.selection.toJSON(), text: editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to) } : null,
      focusAge: editor ? Date.now() - editor.view.input.lastFocus : null,
      clickAge: editor ? Date.now() - editor.view.input.lastClick.time : null,
    }
  })
  if (state.native.text !== expectedText || state.proseMirror?.text !== expectedText) console.error(JSON.stringify(state, null, 2))
  assert.ok(state.focused && state.documentFocused, 'Keyboard selection must retain editor focus')
  assert.ok(state.native.insideEditor, 'Native selection must remain inside the active editor')
  assert.equal(state.native.text, expectedText, 'Keyboard native selection must cover the editor text')
  assert.equal(state.proseMirror?.text, expectedText, 'Keyboard ProseMirror selection must cover the editor text')
  console.log(`PASS: keyboard selection ${JSON.stringify({ text: expectedText, initialized: state.initialized, native: state.native, proseMirror: state.proseMirror })}`)
}

async function verify() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack || error.message) })
    await page.route('**/__guide-rich-text-check', route => route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><link rel="stylesheet" href="/src/main.css"></head><body><div id="root"></div></body></html>',
    }))
    await page.goto(`${baseUrl}/__guide-rich-text-check`)
    await page.evaluate(async () => {
      const runtime = (await import('/@react-refresh')).default
      runtime.injectIntoGlobalHook(window)
      window[String.fromCharCode(36) + 'RefreshReg' + String.fromCharCode(36)] = () => {}
      window[String.fromCharCode(36) + 'RefreshSig' + String.fromCharCode(36)] = () => type => type
      window.__vite_plugin_react_preamble_installed__ = true
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const ReactDOM = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { localKv } = await import('/src/lib/localKvStore.ts')
      const { upsertInKvArray } = await import('/src/lib/kvArrays.ts')
      const { saveVersionSnapshot } = await import('/src/lib/guideStore.ts')
      const { LanguageProvider } = await import('/src/contexts/LanguageContext.tsx')
      const { GuideEditor } = await import('/src/components/GuideEditor.tsx')
      const { GuideViewer } = await import('/src/components/GuideViewer.tsx')
      const { fileStorage } = await import('/src/lib/fileStorage.ts')
      const { Document, Paragraph, Packer } = await import('/node_modules/.vite/deps/docx.js')
      window.kv = localKv
      const attachedDocx = await Packer.toBlob(new Document({ sections: [{ children: [new Paragraph('Target original Word document')] }] }))
      const attachment = await fileStorage.uploadFile(new File([attachedDocx], 'verification.docx'))
      const readerKeys = []
      const restoredAttachment = await fileStorage.downloadFile(attachment.url, async key => {
        readerKeys.push(key)
        return localKv.get(key)
      })
      if (!readerKeys.length || restoredAttachment.size !== attachedDocx.size) throw new Error('Scoped document reader was not used correctly')
      const categories = ['General']
      const source = {
        id: 'guide-ui-source', schemaVersion: 2, title: 'Editor verification', category: 'General', tags: [],
        content: '', version: '1.00', language: 'da', author: 'verification', createdAt: 1, updatedAt: 1,
        sections: [{ id: 'section-ui-source', heading: 'Source section', steps: [{ id: 'step-ui-source', text: 'Open linked guide', imageIds: [] }] }],
      }
      const target = {
        ...source, id: 'guide-ui-target', title: 'Linked guide target', preserveWordLayout: true,
        fileUrl: attachment.url, wordFileName: attachment.filename,
        sections: [{ id: 'section-ui-target', heading: 'Target section', steps: [{ id: 'step-ui-target', text: 'Target step text', imageIds: [] }] }],
      }
      await localKv.set('guides', [source, target])
      function Harness() {
        const [saved, setSaved] = React.useState(source)
        const [editing, setEditing] = React.useState(true)
        const [viewing, setViewing] = React.useState(false)
        const [manySteps, setManySteps] = React.useState(false)
        const editingGuide = manySteps ? { ...saved, sections: [{ ...saved.sections[0], steps: Array.from({ length: 105 }, (_, index) => ({
          id: `long-step-${index}`, text: `Instruction ${index + 1}`, imageIds: [],
        })) }] } : source
        const entries = [{ guide: saved, scope: 'team', teamCode: 'TCD' }, { guide: target, scope: 'team', teamCode: 'TCD' }]
        const save = async guide => {
          await upsertInKvArray('guides', [guide])
          await saveVersionSnapshot(guide, 'verification')
          setSaved(guide)
          setEditing(false)
          setViewing(true)
        }
        return React.createElement(React.Fragment, null,
          React.createElement('button', { id: 'verify-long-guide', onClick: () => { setViewing(false); setManySteps(true); setEditing(true) } }, 'Verify long guide'),
          React.createElement(GuideEditor, {
            open: editing, onOpenChange: setEditing, editGuide: editingGuide, categories, userEmail: 'verification',
            linkTargets: entries, linkCatalog: entries, onSave: save, submitLabel: 'Save verification',
          }),
          React.createElement(GuideViewer, { guide: saved, open: viewing, onOpenChange: setViewing, linkTargets: entries }),
        )
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LanguageProvider, null, React.createElement(Harness)))
    })

    const textbox = page.getByRole('textbox', { name: 'Trintekst', exact: true })
    await textbox.waitFor({ timeout: 15000 }).catch(async error => {
      throw new Error(`${error.message}\nBrowser errors: ${errors.join('; ')}\nPage: ${(await page.locator('body').innerText()).slice(0, 2000)}`)
    })
    if (appearanceOnly) {
      const heading = page.getByRole('textbox', { name: 'Sektionsoverskrift', exact: true })
      await selectEditorText(page, heading, 'Source section')
      await page.keyboard.press('Backspace')
      await selectEditorText(page, textbox, 'Open linked guide')
      await page.keyboard.press('Backspace')
      const screenshots = []
      for (const dark of [false, true]) {
        await page.evaluate(dark => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.setAttribute('data-appearance', dark ? 'dark' : 'light')
        }, dark)
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          await page.waitForFunction(width => {
            const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect()
            return !!dialog && dialog.left >= -1 && dialog.right <= width + 1
          }, width)
          const headingField = page.locator('[data-guide-field="heading"]')
          const stepField = page.locator('[data-guide-field="step"]')
          await headingField.getByText('Sektionsoverskrift', { exact: true }).waitFor()
          await stepField.getByText('Trintekst', { exact: true }).waitFor()
          await headingField.locator('[data-guide-placeholder]').waitFor()
          await stepField.locator('[data-guide-placeholder]').waitFor()
          const headingBounds = await heading.boundingBox()
          const stepBounds = await textbox.boundingBox()
          assert.ok(headingBounds.height < stepBounds.height, 'Heading must be more compact than step text')
          assert.ok(headingBounds.x >= 0 && headingBounds.x + headingBounds.width <= width, 'Heading must fit viewport')
          assert.ok(stepBounds.x >= 0 && stepBounds.x + stepBounds.width <= width, 'Step text must fit viewport')
          if (dark) {
            const background = await textbox.evaluate(element => getComputedStyle(element.parentElement).backgroundColor)
            assert.notEqual(background, 'rgb(255, 255, 255)', 'Dark editor must not use a fixed white surface')
          }
          const image = require('node:path').join(require('node:os').tmpdir(), `guide-fields-${dark ? 'dark' : 'light'}-${width}.png`)
          await headingField.locator('..').locator('..').locator('..').screenshot({ path: image })
          screenshots.push(image)
        }
      }
      await textbox.click()
      await page.keyboard.type('Readable instruction')
      await selectEditorText(page, textbox, 'Readable instruction')
      for (const color of ['M\u00f8rk', 'R\u00f8d', 'Gr\u00f8n', 'Bl\u00e5', 'Rav']) {
        await page.getByRole('button', { name: 'Tekstfarve', exact: true }).click()
        await page.getByRole('button', { name: color, exact: true }).click()
        const contrast = await textbox.evaluate(element => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')
          const luminance = cssColor => {
            context.fillStyle = cssColor
            context.fillRect(0, 0, 1, 1)
            const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(channel => {
              const value = channel / 255
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
            })
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
          }
          const foreground = luminance(getComputedStyle(element.querySelector('span[style]')).color)
          const background = luminance(getComputedStyle(element.parentElement).backgroundColor)
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        })
        assert.ok(contrast >= 4.5, `Dark-theme ${color} text contrast was ${contrast.toFixed(2)}`)
      }
      assert.deepEqual(errors, [])
      console.log(`PASS: persistent labels, active/inactive placeholders, compact headings, themed surfaces, light/dark desktop/mobile fit and readable palette. Screenshots: ${JSON.stringify(screenshots)}`)
      return
    }
    await selectEditorText(page, textbox, 'Open linked guide')
    await page.getByRole('button', { name: 'Fed', exact: true }).click()
    await textbox.locator('strong').waitFor()
    await page.getByRole('button', { name: 'Understreget', exact: true }).click()
    await textbox.locator('u').waitFor()
    if (selectionOnly) {
      const headingEditor = page.getByRole('textbox', { name: /^Sektionsoverskrift/ })
      await selectEditorText(page, headingEditor, 'Source section')
      await page.getByRole('button', { name: 'Fed', exact: true }).click()
      await headingEditor.locator('strong').waitFor()
      await selectEditorText(page, headingEditor, 'Source section', ['Control+End', 'Control+Shift+Home'])
      await page.getByRole('button', { name: 'Understreget', exact: true }).click()
      await headingEditor.locator('u').waitFor()
      await selectEditorText(page, textbox, 'Open linked guide', ['Control+a'])
      await page.getByRole('button', { name: 'Kursiv', exact: true }).click()
      await textbox.locator('em').waitFor()
      assert.deepEqual(errors, [])
      console.log('PASS: step-to-heading activation; forward/reverse boundary and Ctrl+A selections; bold/underline/italic formatting; no browser errors.')
      return
    }
    await page.getByRole('button', { name: 'Tekstfarve', exact: true }).click()
    await page.getByRole('button', { name: 'R\u00f8d', exact: true }).click()
    await page.getByRole('combobox', { name: 'Tekstst\u00f8rrelse', exact: true }).click()
    await page.getByRole('option', { name: '16px', exact: true }).click()
    await page.getByRole('button', { name: 'Rediger link', exact: true }).click()
    const linkDialog = page.getByRole('dialog', { name: 'Rediger link', exact: true })
    await linkDialog.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'Linked guide target (TCD)', exact: true }).click()
    await linkDialog.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'Target section', exact: true }).click()
    await linkDialog.getByRole('combobox').nth(2).click()
    await page.getByRole('option', { name: '1. Target step text', exact: true }).click()
    await linkDialog.getByRole('button', { name: 'Anvend', exact: true }).click()
    await page.getByRole('button', { name: 'Vigtigt', exact: true }).click()
    const headingEditor = page.getByRole('textbox', { name: /^Sektionsoverskrift/ })
    await selectEditorText(page, headingEditor, 'Source section')
    await page.getByRole('button', { name: 'Fed', exact: true }).click()
    await headingEditor.locator('strong').waitFor()
    await page.getByRole('button', { name: 'Tekstfarve', exact: true }).click()
    await page.getByRole('button', { name: 'Bl\u00e5', exact: true }).click()
    await page.getByRole('combobox', { name: 'Tekstst\u00f8rrelse', exact: true }).click()
    await page.getByRole('option', { name: '18px', exact: true }).click()
    await page.getByRole('button', { name: 'Rediger link', exact: true }).click()
    const headingLinkDialog = page.getByRole('dialog', { name: 'Rediger link', exact: true })
    await headingLinkDialog.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: 'Linked guide target (TCD)', exact: true }).click()
    await headingLinkDialog.getByRole('button', { name: 'Anvend', exact: true }).click()
    await page.getByRole('button', { name: 'Save verification', exact: true }).click()

    let viewer = page.getByRole('dialog', { name: 'Editor verification', exact: true })
    await viewer.waitFor()
    await viewer.locator('strong').filter({ hasText: 'Open linked guide' }).waitFor()
    await viewer.getByRole('note', { name: 'Vigtigt', exact: true }).waitFor()
    await viewer.getByRole('heading', { level: 3 }).filter({ hasText: 'Source section' }).locator('strong').waitFor()
    await viewer.getByRole('button', { name: 'Source section', exact: true }).waitFor()
    const saved = await page.evaluate(async () => {
      const guides = await window.kv.get('guides')
      const history = await window.kv.get('guide-versions-guide-ui-source')
      return { guide: guides.find(guide => guide.id === 'guide-ui-source'), history }
    })
    const content = saved.guide.sections[0].steps[0].richContent
    assert.equal(content.version, 1)
    assert.equal(content.text, 'Open linked guide')
    assert.equal(content.document.content[0].type, 'note')
    assert.equal(content.document.content[0].attrs.kind, 'important')
    const marks = content.document.content[0].content[0].content[0].marks
    assert.ok(marks.some(mark => mark.type === 'bold'))
    assert.ok(marks.some(mark => mark.type === 'underline'))
    assert.ok(marks.some(mark => mark.type === 'textStyle' && mark.attrs.color === '#b91c1c' && mark.attrs.fontSize === '16px'))
    assert.ok(marks.some(mark => mark.type === 'guideLink' && mark.attrs.stepId === 'step-ui-target'))
    assert.deepEqual(saved.history[0].snapshot.sections[0].steps[0].richContent, content)
    const heading = saved.guide.sections[0].headingRichContent
    assert.equal(heading.text, 'Source section')
    const headingMarks = heading.document.content[0].content[0].marks
    assert.ok(headingMarks.some(mark => mark.type === 'bold'))
    assert.ok(headingMarks.some(mark => mark.type === 'textStyle' && mark.attrs.color === '#1d4ed8' && mark.attrs.fontSize === '18px'))
    assert.ok(headingMarks.some(mark => mark.type === 'guideLink' && mark.attrs.guideId === 'guide-ui-target'))
    assert.deepEqual(saved.history[0].snapshot.sections[0].headingRichContent, heading)

    await viewer.getByRole('button', { name: 'Open linked guide', exact: true }).click()
    await page.getByRole('button', { name: '\u00c5bn guide', exact: true }).click()
    viewer = page.getByRole('dialog', { name: 'Linked guide target', exact: true })
    await viewer.waitFor()
    await viewer.locator('[data-guide-step-id="step-ui-target"]').waitFor()
    await viewer.getByText('Denne guide henvises til fra', { exact: true }).waitFor()
    await viewer.getByRole('button', { name: 'Editor verification', exact: true }).waitFor()
    await viewer.getByRole('button', { name: 'Tilbage til forrige guide', exact: true }).click()
    viewer = page.getByRole('dialog', { name: 'Editor verification', exact: true })
    await viewer.waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await viewer.getByRole('button', { name: 'Open linked guide', exact: true }).click()
    await page.getByRole('button', { name: '\u00c5bn guide', exact: true }).waitFor()
    const bounds = await page.locator('[data-radix-popper-content-wrapper]').last().boundingBox()
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391, 'Mobile link preview must fit its viewport')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page must not overflow horizontally')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Editor verification', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator('#verify-long-guide').click()
    const longEditor = page.getByRole('textbox', { name: 'Trintekst', exact: true })
    await longEditor.nth(104).waitFor({ timeout: 20000 })
    await longEditor.first().click()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Trintekst'
      && document.activeElement?.getAttribute('contenteditable') === 'true')
    const editStarted = Date.now()
    await page.keyboard.press('End')
    await page.keyboard.type(' checked')
    await page.waitForFunction(() => document.querySelector('[role="textbox"][contenteditable]')?.textContent?.includes('checked'))
    const editElapsed = Date.now() - editStarted
    assert.ok(editElapsed < 3000, `Editing a 105-step guide took ${editElapsed}ms`)
    const editorBounds = await page.getByRole('dialog').first().boundingBox()
    assert.ok(editorBounds && editorBounds.x >= -1 && editorBounds.x + editorBounds.width <= 391, 'Mobile editor dialog must fit its viewport')
    assert.deepEqual(errors, [])
    console.log(`PASS: step and section-heading formatting/links; real local save/version snapshot; rich viewer; stable anchors; notes; preview/navigation/backlinks/back; mobile preview/editor fit; 105-step edit ${editElapsed}ms; no browser errors; no shared-data writes.`)
  } finally {
    await browser.close()
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })