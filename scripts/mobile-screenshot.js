const { chromium } = require('playwright-core')

const url = 'http://127.0.0.1:5173/src.index.html'
const devices = [
  { name: 'iPhone SE', viewport: { width: 375, height: 667 } },
  { name: 'iPhone 14 Pro Max', viewport: { width: 430, height: 932 } },
  { name: 'Pixel 7', viewport: { width: 412, height: 915 } },
]

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  for (const d of devices) {
    await page.setViewportSize(d.viewport)
    await page.waitForTimeout(800)
    await page.screenshot({ path: `C:/Users/Diffusal/Desktop/mobile-${d.name.replace(/\s+/g, '-')}.png`, fullPage: true })
    console.log('Saved:', d.name)
  }

  // check horizontal overflow
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  console.log('Horizontal overflow on last device:', hasOverflow)

  await browser.close()
})()
