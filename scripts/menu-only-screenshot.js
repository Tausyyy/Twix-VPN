const { chromium } = require('playwright-core')
const url = 'http://127.0.0.1:5173/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 300 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.click('#mobile_menu_btn')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-menu-header.png' })
  // force redraw
  await page.evaluate(() => {
    const m = document.getElementById('mobile_menu')
    m.style.display = 'none'
    m.offsetHeight
    m.style.display = 'flex'
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'C:/Users/Diffusal/Desktop/mobile-menu-header2.png' })
  await browser.close()
})()
