const { chromium } = require('playwright-core')
const url = 'http://127.0.0.1:5173/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 1200 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const el = document.getElementById('connection')
    if (el) el.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-steps-full.png' })
  await browser.close()
})()
