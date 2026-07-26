const { chromium } = require('playwright-core')
const url = 'http://127.0.0.1:5173/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.click('#mobile_menu_btn')
  await page.waitForTimeout(500)
  const styles = await page.evaluate(() => {
    const el = document.getElementById('mobile_menu')
    const computed = getComputedStyle(el)
    return {
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      position: computed.position,
      top: computed.top,
      left: computed.left,
      width: computed.width,
      zIndex: computed.zIndex,
      transform: computed.transform
    }
  })
  console.log(JSON.stringify(styles, null, 2))
  await browser.close()
})()
