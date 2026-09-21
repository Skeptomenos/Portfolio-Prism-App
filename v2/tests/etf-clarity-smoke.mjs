import { financialEnvelope } from './fixtures/financial-wire.mjs'
import { chromium, expect as baseExpect } from '@playwright/test'
import { Decimal } from 'decimal.js'

// Read-only acceptance against the private saved-data fixture. No refresh/login calls.
const expect = baseExpect.configure({ timeout: 20_000 })
const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4312'
const json = async (path) => {
  const response = await fetch(origin + path)
  expect(response.ok).toBe(true)
  return response.json()
}
const before = await json('/api/exposure')
const progress = await json('/api/development')
const world = await json('/api/development/etf/IE00B4L5Y983')
const nvda = world.rows.find((row) => row.isin === 'US67066G1040')
const preview = world.illustrative.rows.find((row) => row.row === nvda.row)
const D = Decimal.clone({ precision: 256 })
expect(preview.value).toBe(
  new D(world.illustrative.positionValue).mul(nvda.weightPercent).div(100).toFixed()
)
for (const row of world.rows.filter((row) => !/^(equity|aktien)$/i.test(row.securityType ?? ''))) {
  expect(world.illustrative.rows.find((item) => item.row === row.row).value).toBeNull()
}
const hedged = await json('/api/development/etf/IE00BYVQ9F29')
expect(hedged.illustrative.kind).toBe('selected-allocation')
expect(hedged.illustrative.rows.some(row => row.state === 'included' && row.value !== null)).toBe(true)
const missing = await json('/api/development/etf/FR0010361683')
expect(missing.rows.length).toBeGreaterThan(0)
expect(missing.illustrative).toBeUndefined()
expect(missing.inspection).toBeTruthy()

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${origin}/#/development`)
  await expect(page.getByText('6/7 qualified for their stated allocation measure', { exact: false })).toBeVisible()
  await page.locator(`.etf-coverage a[href*="/fund/${world.isin}"]`).first().click()
  await expect(page.locator('.technical-source')).not.toHaveAttribute('open', '')
  const row = page.locator('.progress-detail-table tbody tr').filter({ hasText: nvda.name })
  await expect(row).toContainText(
    `${new D(preview.value).toFixed(2)} ${world.illustrative.currency}`
  )
  await expect(row).toContainText('Included')
  const scale = await row.locator('.weight-bar > span').getAttribute('style')
  await page.getByLabel('Filter retained rows').fill('NVIDIA')
  await expect(row.locator('.weight-bar > span')).toHaveAttribute('style', scale)
  await page.screenshot({ path: 'v2/test-results/etf-clarity/world-nvidia.png', fullPage: true })
  await row.getByRole('link', { name: nvda.name, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Security detail', exact: true })).toBeFocused()
  await page.goBack()
  await expect(page.getByLabel('Filter retained rows')).toHaveValue('NVIDIA')
  await page.getByRole('link', { name: 'Breakdown', exact: true }).click()
  await page.getByLabel('Find a security or ISIN').fill('NVIDIA')
  await page.getByText(/^Portfolio-wide coverage gaps/).click()
  await expect(page.getByText(/not exposure to the selected security/)).toBeVisible()
  await expect(
    page.getByText(/Amundi|economic/).first()
  ).toBeVisible()
  await page.getByRole('link', { name: world.name, exact: true }).click()
  await expect(page.locator('#fund-detail-title')).toHaveText(world.name)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByText('Technical source details', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.technical-source')).toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await page.screenshot({
      path: `v2/test-results/etf-clarity/world-${width}.png`,
      fullPage: true,
    })
  }
  expect(errors).toEqual([])
  const after = await json('/api/exposure')
  expect(after.rows).toEqual(before.rows)
  expect(after.coverage).toEqual(before.coverage)
  expect((await json('/api/development')).counts).toEqual(progress.counts)
  // Synthetic future coverage states use the canonical coverage endpoint.
  const future = await json('/api/coverage')
  future.counts.checked = 1
  future.counts.used = 2
  Object.assign(future.funds.find(fund => fund.isin === world.isin), {
    state: 'integration-pending', checked: true, used: false,
    nextAction: 'Integrate reviewed allocation',
  })
  Object.assign(future.funds.find(fund => fund.isin === hedged.isin), {
    state: 'checks-failed', checked: false, used: false,
    nextAction: 'Synthetic hedge compatibility check failed',
  })
  await page.route('**/api/financial/coverage', route => route.fulfill({ json: financialEnvelope('coverage', future) }))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${origin}/#/development`)
  await expect(page.locator('.etf-stage-counts li').nth(1)).toContainText('1/7')
  await expect(page.locator('.etf-coverage tr').filter({ hasText: world.name })).toContainText('Ready · not integrated')
  await expect(page.locator('.etf-coverage tr').filter({ hasText: hedged.name })).toContainText('Synthetic hedge compatibility check failed')
  console.log(
    'ETF clarity passed: saved-data World/NVIDIA/Breakdown journey, exact conditional arithmetic, fixed-scale bars, exclusions, history, keyboard, mobile, unchanged exposure and readiness.'
  )
} finally {
  await browser.close()
}
