// Real saved-data acceptance: isolated copied-data origin only, GET operations only.
import { chromium, expect as baseExpect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFinancialClient } from '../web/views/financial-client'
import { contributionMix } from '../web/views/contribution-mix'
import { coverageMoney } from '../web/CoverageSummary'
const origin = process.env.PRISM_V2_URL
if (!origin) throw Error('Set PRISM_V2_URL to a copied-data preview')
const url = new URL(origin)
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || ['4336', '4344'].includes(url.port)) throw Error('Use isolated copied-data origin')
const client = createFinancialClient((path, options) => fetch(origin + path, options))
const signal = new AbortController().signal
const input = await client.analysis(signal), mix = contributionMix(input.data), overview = await client.overview(signal)
const evidence = mkdtempSync(join(tmpdir(), 'prism-financial-browser-'))
const expect = baseExpect.configure({ timeout: 15000 })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
  const errors: string[] = [], writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.method()) })
  for (const path of ['portfolio', 'breakdown', 'development', 'contribution-mix']) {
    await page.goto(`${origin}#/${path}`)
    const summary = page.getByRole('region', { name: 'Portfolio coverage' })
    await expect(summary).toContainText(`${input.data.coverage.unvalued} positions unvalued`)
    for (const total of input.data.coverage.totals) await expect(summary).toContainText(coverageMoney(total.unresolvedValue, total.currency))
    expect((await summary.boundingBox())!.y).toBeLessThan(1000)
  }
  await expect(page.getByRole('heading', { name: 'Where included exposure comes from' })).toBeVisible()
  for (const row of mix) {
    await expect(page.locator('.contribution-mix-currencies')).toContainText(coverageMoney(row.direct, row.currency))
    await expect(page.locator('.contribution-mix-currencies')).toContainText(coverageMoney(row.etf, row.currency))
  }
  await page.getByText('Method and exact input', { exact: true }).click()
  await expect(page.getByText(/Input content ID:/)).toBeVisible()
  await expect(page.getByText(/not a historical checkpoint or performance return/)).toBeVisible()
  await page.screenshot({ path: join(evidence, 'mix-desktop.png'), fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole('button', { name: /Navigation menu/ })).toBeVisible()
    await page.getByRole('button', { name: /Navigation menu/ }).focus()
    await page.keyboard.press('Enter'); await expect(page.getByRole('link', { name: 'History', exact: true })).toBeVisible()
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: /Navigation menu/ })).toBeFocused()
    for (const row of mix) {
      const card = page.getByRole('article', { name: `${row.currency} contribution mix` })
      for (const value of [row.direct, row.etf]) {
        const amount = card.getByText(coverageMoney(value, row.currency), { exact: true })
        await expect(amount).toBeVisible()
        const bounds = (await amount.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(evidence, `mix-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1280, height: 1000 })
  const fund = input.data.coverage.funds.find(item => item.used)!
  await page.goto(`${origin}#/fund/${fund.isin}`)
  await expect(page.getByRole('heading', { name: 'ETF detail', exact: true })).toBeVisible()
  await expect(page.locator('.fund-detail')).toBeVisible()
  await page.reload(); await expect(page.locator('.fund-detail')).toBeVisible()
  const security = input.data.exposure.rows.find(row => row.contributions.some(item => item.kind === 'direct') && row.contributions.some(item => item.kind === 'etf'))!
  await page.goto(`${origin}#/security/${security.isin}`)
  await expect(page.locator('.company-exposure')).toContainText(security.name)
  await expect(page.locator('.company-exposure')).toContainText('Direct shares')
  await page.goBack(); await expect(page.getByRole('heading', { name: 'ETF detail', exact: true })).toBeVisible()
  await page.goto(`${origin}#/amundi-inspection`)
  await expect(page.getByRole('heading', { name: 'Amundi saved source inspection' })).toBeVisible()
  const inspection = await client.fund('FR0010361683', signal)
  await expect(page.locator('.route-content')).toContainText(inspection.compositionDate!)
  await expect(page.locator('.route-content')).toContainText(String(inspection.inspection!.reportedRowCount))
  // Poll failure/version mismatch must retain the last good analytics values and dates.
  await page.goto(`${origin}#/contribution-mix`)
  await expect(page.locator('.contribution-mix-currencies')).toBeVisible()
  for (const mode of ['failure', 'version', 'malformed']) {
    await page.route('**/api/financial/analysis', route => route.fulfill(mode === 'failure' ? { status: 503, json: {} } : {
      json: mode === 'version' ? { contractVersion: 'other/1' } : { contractVersion: 'portfolio-financial/1', data: {} },
    }))
    await expect(page.getByRole('alert').filter({ hasText: 'Contribution analysis is unavailable' })).toBeVisible({ timeout: 10000 })
    for (const row of mix) await expect(page.locator('.contribution-mix-currencies')).toContainText(coverageMoney(row.etf, row.currency))
    await page.unroute('**/api/financial/analysis')
    await expect(page.getByRole('alert').filter({ hasText: 'Contribution analysis is unavailable' })).toHaveCount(0, { timeout: 10000 })
  }
  // Test-only module interception; no production failure toggles or synthetic fallback.
  for (const state of ['disabled', 'failed', 'incompatible']) {
    await page.route('**/web/views/bundled.tsx*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: await response.text() + `\nbrowserViews.route('contribution-mix').state = '${state}';\n` })
    })
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: `This view is ${state}` })).toBeVisible()
    await page.getByRole('link', { name: 'Portfolio', exact: true }).click()
    await expect(page.locator('.holdings')).toContainText(overview.rows[0].name)
    await page.getByRole('link', { name: 'Wiki', exact: true }).click(); await expect(page.locator('iframe')).toBeVisible()
    await page.unroute('**/web/views/bundled.tsx*')
    await page.goto(`${origin}#/contribution-mix`)
  }
  expect(errors).toEqual([]); expect(writes).toEqual([])
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ passed: true, positions: overview.rows.length, currencies: mix.length,
    sourceRows: inspection.inspection?.reportedRowCount, writes: writes.length, pageErrors: errors.length }))
  console.log('PASS: financial views, exact contribution mix, evidence/detail navigation, reload/Back, keyboard, 390/320px, last-good failures and isolated view lifecycle. Evidence: ' + evidence)
} finally { await browser.close() }
