const { chromium } = require('playwright-core')
const url = 'http://127.0.0.1:5173/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.click('#mobile_menu_btn')
  await page.waitForTimeout(800)
  // скроллим немного вниз чтобы меню было видно
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-menu-open-v2.png' })
  const box = await page.locator('#mobile_menu').boundingBox()
  console.log('Menu bounding box:', box)
  await browser.close()
})()
