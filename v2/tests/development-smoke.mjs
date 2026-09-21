import { chromium, expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 20_000 })
const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4312'
const expected = ['IE0031442068', 'IE00B4L5Y983', 'IE00B53SZB19', 'IE00BYVQ9F29', 'DE000A0F5UF5', 'IE00B3WJKG14', 'FR0010361683']

const response = await fetch(`${origin}/api/development`)
if (!response.ok) throw new Error(`Development API returned ${response.status}`)
const data = await response.json()
expect(data.portfolio.fundCount).toBe(7)
expect(data.counts.acquiredFunds).toBe(7)
expect(data.counts.qualifiedFunds).toBe(6)
expect(data.counts.usedFunds).toBe(6)
for (const isin of expected) {
  const fund = data.funds.find((candidate) => candidate.isin === isin)
  expect(fund, `missing fund ${isin}`).toBeTruthy()
  expect(fund.evidence.rowCount).toBeGreaterThan(0)
  expect(fund.usedInCalculation).toBe(isin !== 'FR0010361683')
}

const iusaRows = data.funds.find(f => f.isin === 'IE0031442068').evidence.rowCount
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
  await expect(page.getByRole('heading', { name: 'Your ETF data' })).toBeVisible()
  await page.getByText('Source evidence and connection status', { exact: true }).click()
  await expect(page.getByText(`${data.counts.acquiredRows.toLocaleString('en-US')} saved source entries`, { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Skip to content' }).focus()
  await page.keyboard.press('Enter')
  expect(new URL(page.url()).hash).toBe('#development')
  await expect(page.locator('#main-content')).toBeFocused()
  await page.locator('.etf-coverage a[href*="/fund/IE0031442068"]').first().click()
  await expect(page.getByRole('heading', { name: 'ETF detail', exact: true })).toBeFocused()
  await expect(page.locator('#fund-detail-title')).toHaveText(
    data.funds.find((fund) => fund.isin === 'IE0031442068').name
  )
  await expect(page.locator('.table-meta').filter({ hasText: `${iusaRows} of ${iusaRows} rows` })).toBeVisible()
  await page.getByLabel('Filter retained rows').fill('META')
  await page.getByRole('link', { name: 'META PLATFORMS CLASS A', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Security detail', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'The business', exact: true }).click()
  await expect(page.getByText(/Company fundamentals are unavailable/)).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Filter retained rows')).toHaveValue('META')
  await page.getByRole('link', { name: 'META PLATFORMS CLASS A', exact: true }).click()
  // Included source-row links explicitly request the investment contribution view.
  await expect(page.getByRole('button', { name: 'Your investment', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.goBack()
  await page.getByLabel('Find a security or ISIN').fill('Meta')
  await expect(page.locator('.company-card tbody tr:not(.uncertainty-row)')).toHaveCount(1)
  await page.getByRole('link', { name: 'Follow into combined security exposure' }).click()
  await expect(page.getByRole('button', { name: 'Your investment', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('.selected-contribution')).toHaveCount(1)
  await expect(page.locator('.company-card tbody tr:not(.uncertainty-row)')).toHaveCount((await (await fetch(`${origin}/api/exposure`)).json()).rows.find(r => r.isin === 'US30303M1027').contributions.length)
  await page.goBack()
  await expect(page.getByLabel('Find a security or ISIN')).toHaveValue('Meta')
  await page.getByRole('link', { name: 'Breakdown', exact: true }).click()
  await page.goBack()
  await expect(page.getByLabel('Filter retained rows')).toHaveValue('META')
  await expect(page.getByText(`1 of ${iusaRows} rows`)).toBeVisible()
  await page.getByLabel('Filter retained rows').fill('')
  await page.getByLabel('Sort source rows').selectOption('name')
  await page.getByRole('button', { name: 'Next rows' }).click()
  await page.getByRole('link', { name: 'Explore', exact: true }).click()
  await page.goBack()
  await expect(page.getByLabel('Sort source rows')).toHaveValue('name')
  await expect(page.getByText(`page 2 of ${Math.ceil(iusaRows / 50)}`)).toBeVisible()
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
  expect((await page.getByRole('region', { name: 'Portfolio coverage' }).boundingBox()).y).toBeLessThan(844)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(errors).toEqual([])
  console.log(
    'Development UI passed: real held-fund counts, row inspection, responsive layout, no page errors.'
  )
} finally {
  await browser.close()
}
