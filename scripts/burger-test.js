const { chromium } = require('playwright-core')
const url = 'http://127.0.0.1:5173/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-menu-closed.png' })
  await page.click('#mobile_menu_btn')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-menu-open.png' })
  const isVisible = await page.isVisible('#mobile_menu')
  const ariaExpanded = await page.getAttribute('#mobile_menu_btn', 'aria-expanded')
  console.log('Menu visible after click:', isVisible)
  console.log('aria-expanded:', ariaExpanded)
  await browser.close()
})()
