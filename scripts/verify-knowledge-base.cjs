const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright-core')
const { Document, Packer, Paragraph, HeadingLevel } = require('docx')
const { createStore } = require('../electron/store.cjs')
const registry = require('../electron/registry.cjs')

const EMAIL = 'knowledge-manager@example.test'
const PASSWORD = 'Local-verification-only'

function pdfDocument() {
  const content = 'BT /F1 16 Tf 40 760 Td (Rejection Reason) Tj ET\nBT /F1 10 Tf 40 730 Td (2:1 - Cancelled by Cancel Key Pressed) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

async function verify() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-knowledge-'))
  const root = path.join(temporary, 'data')
  const profile = path.join(temporary, 'profile')
  const shots = path.join(temporary, 'screenshots')
  await fs.mkdir(profile, { recursive: true })
  await fs.mkdir(shots)
  registry.createTeam(root, { teamId: 'ops', name: 'Knowledge Verification', folderName: 'OPS' })
  registry.createTeam(root, { teamId: 'ref', name: 'Reference Verification', folderName: 'REF' })
  registry.assignUserToTeam(root, EMAIL, 'ops')
  registry.setCreatorEmail(root, 'creator@example.test')
  const own = createStore(path.join(root, 'OPS'))
  const foreign = createStore(path.join(root, 'REF'))
  own.set('users', { [EMAIL]: { email: EMAIL, fullName: 'Knowledge Manager', password: PASSWORD, status: 'approved', role: 'manager' } })
  own.set(`app-language-user_${EMAIL}`, 'en')
  own.set('guides', [{ id: 'existing-guide', title: 'Existing guide stays separate', version: '1.00', content: 'Existing guide content', sections: [] }])
  foreign.set('knowledge-articles', [{ id: 'external', title: 'External settlement reference', category: 'Processes', version: '1.00', language: 'en', sections: [{ id: 'external-section', heading: 'Settlement', steps: [{ id: 'external-step', text: 'Settlement cut-off is 22:00. EXTERNAL_REFERENCE_ONLY', imageIds: [] }] }], createdAt: Date.now(), updatedAt: Date.now() }])
  const pdfFile = path.join(temporary, 'LocalMode PDF.pdf')
  const wordFile = path.join(temporary, 'LocalMode Word.docx')
  await fs.writeFile(pdfFile, pdfDocument())
  await fs.writeFile(wordFile, await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ text: 'LocalMode Word', heading: HeadingLevel.TITLE }), new Paragraph({ text: 'Terminal result', heading: HeadingLevel.HEADING_1 }), new Paragraph('Rejection source 05 means Host/PSP.')] }] })))
  const environment = { ...process.env, ELECTRON_START_URL: process.env.KNOWLEDGE_VERIFY_URL || 'http://127.0.0.1:5020', TCD_HUB_DATA_DIR: root, TCD_HUB_USER_DATA_DIR: profile }
  delete environment.ELECTRON_RUN_AS_NODE
  const results = []
  const step = name => { results.push(name); console.log(`ok - ${name}`) }
  let application
  let page
  try {
    application = await _electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: ['.'], cwd: path.resolve('.'), env: environment })
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile)
    page = await application.firstWindow()
    await page.setViewportSize({ width: 1440, height: 1000 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.locator('#email').waitFor({ timeout: 90000 })
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('form button[type="submit"]').click()
    await page.getByText('Knowledge Base', { exact: true }).first().waitFor({ timeout: 30000 })
    await page.keyboard.press('Escape')
    await page.getByText('Knowledge Base', { exact: true }).first().click()
    await page.getByRole('button', { name: 'New article', exact: true }).first().waitFor()
    step('Knowledge Base opens with its own article labels')

    async function publish(title) {
      await page.locator('#guide-title').fill(title)
      await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
      await page.locator('#guide-title').waitFor({ state: 'hidden' })
      const reviews = page.getByRole('button', { name: 'Reviews and drafts', exact: true })
      if (await reviews.isVisible()) await reviews.click()
      await page.getByRole('button', { name: 'Claim review', exact: true }).first().click()
      await page.getByRole('button', { name: 'Approve and publish', exact: true }).first().click()
      await page.waitForFunction(async expected => (await window.kv.get('knowledge-articles') || []).some(article => article.title === expected), title)
      await page.getByRole('button', { name: 'Published articles', exact: true }).click()
      return own.get('knowledge-articles', { skipCache: true }).find(article => article.title === title)
    }

    await page.getByRole('button', { name: 'New article', exact: true }).first().click()
    await page.locator('[data-guide-field="step"] [role="textbox"]').first().click()
    await page.locator('[data-guide-field="step"] [contenteditable="true"]').fill('Manual reference: verify the terminal result before continuing.')
    const manual = await publish('Manual Knowledge Reference')
    assert.match(manual.sections[0].steps[0].text, /verify the terminal result/)
    step('manual article is created, reviewed and published through the UI')

    async function importDocument(file, mode, title) {
      await page.getByRole('button', { name: 'Import document', exact: true }).click()
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: mode }).click()
      await (await chooser).setFiles(file)
      await page.locator('#guide-title').waitFor({ timeout: 30000 })
      return publish(title)
    }
    const word = await importDocument(wordFile, 'Convert to editable steps', 'Imported Word Reference')
    assert.match(JSON.stringify(word.sections), /Host\/PSP/)
    step('real .docx import produces editable article content')
    const pdf = await importDocument(pdfFile, /^Import PDF/, 'Imported PDF Reference')
    assert.match(JSON.stringify(pdf.sections), /Cancelled by Cancel Key Pressed/)
    assert.match(pdf.originalPdfUrl, /^kv:\/\/file_/)
    step('real PDF import preserves the original and extracts searchable text')

    const session = await page.evaluate(() => window.electronAuth.current())
    const scope = { token: session.token, language: 'en', includeImages: false }
    assert.ok(scope.token, 'login must supply the assistant token')
    const answer = await page.evaluate(request => window.electronAssistant.ask(request), { ...scope, question: 'what does rejection reason 2:1 mean?' })
    assert.match(answer.text, /Cancelled by Cancel Key Pressed/)
    assert.ok(answer.sources.some(source => source.library === 'knowledge' && source.guideId === pdf.id))
    step('Hubert answers from the imported PDF article with a Knowledge Base source')

    await page.keyboard.press('Control+s')
    await page.getByPlaceholder('Ask Hubert').or(page.getByPlaceholder('Ask Hubert…')).first().fill('what does rejection reason 2:1 mean?')
    await page.getByPlaceholder('Ask Hubert').or(page.getByPlaceholder('Ask Hubert…')).first().press('Enter')
    await page.locator('summary', { hasText: /^Sources/ }).last().click({ timeout: 30000 })
    await page.getByRole('button', { name: /Imported PDF Reference/ }).first().click({ timeout: 30000 })
    const viewer = page.getByRole('dialog').filter({ has: page.getByText('Imported PDF Reference', { exact: true }) }).last()
    await viewer.getByRole('button', { name: 'Original PDF', exact: true }).click()
    await viewer.locator('iframe, embed, object').first().waitFor({ timeout: 30000 })
    await page.screenshot({ path: path.join(shots, '01-hubert-original-pdf.png') })
    await viewer.getByRole('button', { name: 'Text', exact: true }).click()
    await viewer.getByRole('button', { name: /^Danish/ }).click()
    await page.waitForFunction(() => !document.body.innerText.includes('Translating'), undefined, { timeout: 60000 })
    await page.screenshot({ path: path.join(shots, '02-article-translation.png') })
    const translationFailure = await viewer.getByText(/could not.*translat|translation.*failed|unavailable/i).count()
    assert.equal(translationFailure, 0, 'the installed translator must produce a translation')
    step('Hubert source opens its original PDF and the article translation controls work')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')

    const before = await page.evaluate(request => window.electronAssistant.ask(request), { ...scope, question: 'settlement cut-off external reference' })
    assert.ok(!JSON.stringify(before).includes('EXTERNAL_REFERENCE_ONLY'))
    const rows = await page.evaluate(() => window.electronRegistry.readTeamKey('REF', 'knowledge-articles'))
    assert.equal(rows[0].content, '')
    const request = { id: 'verify-access', guideId: 'external', guideTitle: 'External settlement reference', requestingUserEmail: EMAIL, requestingTeamCode: 'OPS', status: 'pending', requestedAt: new Date().toISOString() }
    await page.evaluate(request => window.electronRegistry.submitKnowledgeAccessRequest('REF', request), request)
    const pending = foreign.get('knowledge-access-requests', { skipCache: true })
    assert.equal(pending[0].status, 'pending')
    foreign.update('knowledge-access-requests', { op: 'upsert', items: [{ ...pending[0], status: 'approved', reviewedBy: 'reference-manager@example.test', reviewedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 86400000).toISOString() }] })
    const after = await page.evaluate(request => window.electronAssistant.ask(request), { ...scope, question: 'settlement cut-off external reference' })
    assert.ok(after.sources.some(source => source.library === 'knowledge' && source.guideId === 'external'))
    assert.match(after.text, /22:00/)
    foreign.update('knowledge-access-requests', { op: 'upsert', items: [{ ...pending[0], status: 'rejected', requestedAt: new Date(Date.now() + 1000).toISOString() }] })
    const revoked = await page.evaluate(request => window.electronAssistant.ask(request), { ...scope, question: 'settlement cut-off external reference' })
    assert.ok(!JSON.stringify(revoked).includes('EXTERNAL_REFERENCE_ONLY'))
    step('real access-request IPC, approval and revocation enforce cross-team knowledge visibility')

    assert.equal(own.get('guides', { skipCache: true })[0].id, 'existing-guide')
    assert.equal(own.get('guides', { skipCache: true }).length, 1)
    await page.keyboard.press('Escape')
    await page.getByText('Game Corner', { exact: true }).first().waitFor()
    assert.ok(await page.getByText('Guide Library', { exact: true }).first().isVisible())
    assert.deepEqual(errors, [])
    step('Guide Library storage and Game Corner navigation remain separate; no renderer errors')
    console.log(JSON.stringify({ temporary, results }, null, 2))
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {})
      await fs.writeFile(path.join(temporary, 'failure-ui.txt'), await page.locator('body').innerText().catch(() => ''))
    }
    console.error(`Verification evidence: ${temporary}`)
    throw error
  } finally {
    if (application) await application.close()
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1 })