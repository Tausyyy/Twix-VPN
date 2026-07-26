const { chromium } = require('playwright-core')

const url = 'http://127.0.0.1:5173/src.index.html'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const overflows = await page.evaluate(() => {
    const all = document.querySelectorAll('*')
    const result = []
    all.forEach(el => {
      const rect = el.getBoundingClientRect()
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        result.push({
          tag: el.tagName,
          id: el.id,
          class: el.className,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          viewport: window.innerWidth
        })
      }
    })
    return result
  })

  console.log(JSON.stringify(overflows, null, 2))
  await browser.close()
})()
