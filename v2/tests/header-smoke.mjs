import { chromium, expect as baseExpect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Saved-data acceptance only: never refreshes, logs in or submits mutations.
const expect = baseExpect.configure({ timeout: 20_000 })
const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4312'
const phase = process.argv.includes('--before') ? 'before' : 'after'
const output = 'v2/test-results/sticky-header'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [390, 901]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`${origin}/#development`)
    await expect(page.getByRole('heading', { name: 'Your ETF data' })).toBeVisible()
    await page.screenshot({ path: `${output}/${phase}-${width}.png` })
  }
  for (const width of [320, 390, 899, 900, 901, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const [route, title, ready] of [
      ['portfolio', 'Portfolio', '.holdings tbody tr'],
      ['/development', 'Development', '#funds-title'],
      ['/fund/IE0031442068', 'ETF detail', '.progress-detail-table tbody tr'],
    ]) {
      await page.goto(`${origin}/#${route}`)
      await expect(page.locator(ready).first()).toBeVisible()
      const heading = page.getByRole('heading', { name: title, exact: true })
      await expect(heading).toBeFocused()
      const header = page.locator('.sidebar')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      const initial = await header.boundingBox()
      if (width <= 900) {
        expect(initial.height).toBeLessThanOrEqual(64)
        expect((await heading.boundingBox()).y).toBeGreaterThanOrEqual(initial.height)
        await expect(page.getByRole('button', { name: /Navigation menu/ })).toContainText(title)
      }
      await page.evaluate(() => window.scrollTo(0, 1000))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
      await expect.poll(async () => (await header.boundingBox()).y).toBe(0)
      if (width <= 900) {
        const toggle = page.getByRole('button', { name: /Navigation menu/ })
        await toggle.focus()
        await page.keyboard.press('Enter')
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        const links = page.locator('#navigation-links a')
        await expect(links).toHaveText(['Portfolio', 'Breakdown', 'Explore', 'Development', 'Data & connections', 'Contribution mix', 'Transactions', 'History', 'Amundi source', 'Wiki'])
        for (const link of await links.all()) {
          const box = await link.boundingBox()
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(width)
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
        await expect(page.locator('#navigation-links [aria-current="page"]')).toHaveCount(1)
        await page.keyboard.press('Tab')
        await expect(links.first()).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(toggle).toBeFocused()
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await page.screenshot({
          path: `${output}/${phase}-${width}-${title.replaceAll(' ', '-')}-scrolled.png`,
        })
      } else {
        await expect(
          page.getByRole('link', { name: 'Data & connections', exact: true })
        ).toBeInViewport()
      }
      // The skip target must retain its route and place the heading below the pinned header.
      const url = page.url()
      await page.getByRole('link', { name: 'Skip to content' }).focus()
      await page.keyboard.press('Enter')
      expect(page.url()).toBe(url)
      await expect(page.locator('#main-content')).toBeFocused()
      if (width <= 900) expect((await heading.boundingBox()).y).toBeGreaterThanOrEqual(64)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const toggle = page.getByRole('button', { name: /Navigation menu/ })
  await toggle.click()
  await page.screenshot({ path: `${output}/${phase}-390-menu-open.png` })
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toContainText('Explore')
  await toggle.click()
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Explore', exact: true })).toBeFocused()
  await toggle.click()
  await page.keyboard.press('Tab')
  for (let i = 0; i < await page.locator('#navigation-links a').count(); i++) await page.keyboard.press('Tab')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  const panel = await page.locator('#navigation-links').boundingBox()
  await page.mouse.click(panel.x - 4, panel.y + 10)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await page.setViewportSize({ width: 901, height: 400 })
  await expect(toggle).toBeHidden()
  await expect(page.getByRole('link', { name: 'Data & connections', exact: true })).toBeInViewport()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(errors).toEqual([])
  console.log(
    'Header UI passed: single sticky row, all routes, 320/390/899/900/901/1280px, keyboard dismissal, focus/skip offsets and desktop navigation.'
  )
} finally {
  await browser.close()
}
