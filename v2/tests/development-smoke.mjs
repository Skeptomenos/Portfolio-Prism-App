import { chromium, expect } from '@playwright/test'

const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4312'
const expected = {
  IE0031442068: 509,
  IE00B4L5Y983: 1321,
  IE00B53SZB19: 109,
  IE00BYVQ9F29: 109,
  DE000A0F5UF5: 107,
  IE00B3WJKG14: 79,
  FR0010361683: null,
}

const response = await fetch(`${origin}/api/development`)
if (!response.ok) throw new Error(`Development API returned ${response.status}`)
const data = await response.json()
expect(data.portfolio.fundCount).toBe(7)
expect(data.counts.acquiredFunds).toBe(6)
expect(data.counts.qualifiedFunds).toBe(0)
expect(data.counts.usedFunds).toBe(1)
for (const [isin, rowCount] of Object.entries(expected)) {
  const fund = data.funds.find((candidate) => candidate.isin === isin)
  expect(fund, `missing fund ${isin}`).toBeTruthy()
  expect(fund.evidence.rowCount).toBe(rowCount)
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${origin}#development`)
  await expect(page.getByRole('heading', { name: 'Development' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ETF evidence register' })).toBeVisible()
  await expect(page.getByText('6 of 7', { exact: true })).toBeVisible()
  await expect(page.getByText('0 of 7', { exact: true })).toBeVisible()
  await expect(page.getByText('2,234', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await page.keyboard.press('Enter')
  expect(new URL(page.url()).hash).toBe('#development')
  await expect(page.locator('#main-content')).toBeFocused()
  const fundRow = page.locator('tr').filter({ hasText: 'IE0031442068' })
  await expect(fundRow).toContainText('509 rows')
  await fundRow.getByRole('link', { name: 'Inspect evidence' }).click()
  await expect(page.getByRole('heading', { name: 'ETF detail', exact: true })).toBeFocused()
  await expect(page.locator('#fund-detail-title')).toHaveText(
    data.funds.find((fund) => fund.isin === 'IE0031442068').name
  )
  await expect(page.locator('.table-meta').filter({ hasText: '509 of 509 rows' })).toBeVisible()
  await page.getByLabel('Filter retained rows').fill('META')
  await page.getByRole('link', { name: 'META PLATFORMS CLASS A', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Security detail', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'The business', exact: true }).click()
  await expect(page.getByText(/Company fundamentals are unavailable/)).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Filter retained rows')).toHaveValue('META')
  await page.getByRole('link', { name: 'META PLATFORMS CLASS A', exact: true }).click()
  await expect(page.getByRole('button', { name: 'The business', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.goBack()
  await page.getByLabel('Find a security or ISIN').fill('Meta')
  await expect(page.locator('.company-card tbody tr')).toHaveCount(1)
  await page.getByRole('link', { name: 'Follow into combined security exposure' }).click()
  await expect(page.getByRole('button', { name: 'Your investment', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('.selected-contribution')).toHaveCount(1)
  await expect(page.locator('.company-card tbody tr')).toHaveCount(2)
  await page.goBack()
  await expect(page.getByLabel('Find a security or ISIN')).toHaveValue('Meta')
  await page.getByRole('link', { name: 'Breakdown', exact: true }).click()
  await page.goBack()
  await expect(page.getByLabel('Filter retained rows')).toHaveValue('META')
  await expect(page.getByText(/1 of 509 rows/)).toBeVisible()
  await page.getByLabel('Filter retained rows').fill('')
  await page.getByLabel('Sort source rows').selectOption('name')
  await page.getByRole('button', { name: 'Next rows' }).click()
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await page.goBack()
  await expect(page.getByLabel('Sort source rows')).toHaveValue('name')
  await expect(page.getByText(/page 2 of 11/)).toBeVisible()
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.getByRole('button', { name: /Navigation menu/ }).click()
  for (const name of ['Portfolio', 'Breakdown', 'Explore', 'Development', 'Data & connections']) {
    const box = await page
      .locator('#navigation-links')
      .getByRole('link', { name, exact: true })
      .boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  }
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.holdings tbody tr').first()).toBeVisible()
  expect((await page.locator('.holdings tbody tr').first().boundingBox()).y).toBeLessThan(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(errors).toEqual([])
  console.log(
    'Development UI passed: real held-fund counts, row inspection, responsive layout, no page errors.'
  )
} finally {
  await browser.close()
}
