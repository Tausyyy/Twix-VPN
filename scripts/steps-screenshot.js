const { chromium } = require('playwright-core')
const url = 'http://127.0.0.1:5176/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const el = await page.locator('#connection')
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-steps.png' })
  await browser.close()
})()
