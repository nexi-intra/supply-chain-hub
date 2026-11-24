// Renders the paper grain (the SVG feTurbulence tile the board-game CSS used inline) to PNG tiles, one per
// device pixel ratio, so the browser decodes a bitmap once instead of re-running the noise filter on every
// raster (raster and compositing run on the CPU on our laptops). Chromium renders the SVG itself, so the
// tiles are the same pixels the inline SVG produced at that ratio.
//   node scripts/render-grain.cjs   (needs Microsoft Edge; writes src/assets/multiplayer/grain-<n>x.png)
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')

const GRAIN_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .35 0 0 0 0 .25 0 0 0 0 .14 0 0 0 .07 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>"
const RATIOS = [1, 1.25, 1.5, 2]
const OUT = path.join(__dirname, '..', 'src', 'assets', 'multiplayer')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge' })
  try {
    for (const ratio of RATIOS) {
      const context = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: ratio })
      const page = await context.newPage()
      await page.setContent(`<html><body style="margin:0;background:transparent"><div id="g" style="width:160px;height:160px;background:url(&quot;${GRAIN_SVG}&quot;)"></div></body></html>`)
      const file = path.join(OUT, `grain-${ratio}x.png`)
      await page.locator('#g').screenshot({ path: file, omitBackground: true })
      console.log(`${path.relative(process.cwd(), file)} ${fs.statSync(file).size} bytes`)
      await context.close()
    }
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
