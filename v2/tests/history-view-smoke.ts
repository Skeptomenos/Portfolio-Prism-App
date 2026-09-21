// Isolated synthetic browser acceptance. No backend, database, credentials or fallback data.
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { Decimal } from 'decimal.js'
import { mkdirSync } from 'node:fs'
import { financialFixture } from './fixtures/financial'
import { financialRead } from '../server/financial-read-model'
import { syntheticHistoryPage, syntheticRunDetail, syntheticCheckpointDetail } from './fixtures/history-contract'

const server = await createServer({ server: { host: '127.0.0.1', port: 4348, strictPort: true } })
await server.listen()
const fixture = financialFixture()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let mode = 'normal'
  let status = 'partial'
  const detail = structuredClone(syntheticCheckpointDetail)
  detail.checkpoint.currencies = [...detail.checkpoint.currencies, { ...detail.checkpoint.currencies[0], currency: 'USD', cashState: 'unknown', cashValue: null }]
  const Precise = Decimal.clone({ precision: 300 })
  const longDetail = structuredClone(detail)
  const included = '991.8078001632' + '0'.repeat(230) + '1'
  longDetail.checkpoint.currencies = [{ ...detail.checkpoint.currencies[0], includedSecurityValue: included,
    unassignedValue: new Precise(1000).minus(included).toFixed(), coveragePercent: new Precise(included).div(10).toFixed(),
    cashValue: '1234567.891234567890123456789', allocationState: 'partial' }]
  longDetail.positions = [{ ...detail.positions[0], value: included, unitPrice: new Precise(included).div(10).toFixed() }, detail.positions[1]]
  const requests: string[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); requests.push(url.pathname)
    if (url.pathname.startsWith('/api/history/')) {
      if (mode === 'failure') return route.fulfill({ status: 500, json: { error: 'Unavailable' } })
      if (mode === 'missing') return route.fulfill({ status: 404, json: { error: 'Not found' } })
      if (mode === 'version') return route.fulfill({ json: { ...syntheticHistoryPage, contractVersion: 'other/1' } })
      if (mode === 'malformed') return route.fulfill({ json: { ...syntheticHistoryPage, items: 'invalid' } })
      if (mode === 'loading') return // Kept pending until route teardown; demonstrates real loading state.
      if (url.pathname.includes('/checkpoints/')) return route.fulfill({ json: mode === 'long' ? longDetail : detail })
      if (url.pathname.endsWith('/synthetic-failed-run')) return route.fulfill({ json: { contractVersion: syntheticHistoryPage.contractVersion, run: syntheticHistoryPage.items[0], checkpoints: [] } })
      if (url.pathname.endsWith('/synthetic-run-1')) return route.fulfill({ json: { ...syntheticRunDetail, run: { ...syntheticRunDetail.run, status }, checkpoints: [syntheticRunDetail.checkpoints[0], { ...syntheticRunDetail.checkpoints[0], id: 'second-checkpoint', reason: 'holdings' }] } })
      return route.fulfill({ json: { ...syntheticHistoryPage, items: mode === 'empty' ? [] : syntheticHistoryPage.items, nextCursor: url.searchParams.has('cursor') ? null : 'synthetic-page-2' } })
    }
    if (url.pathname === '/api/financial/fund/FR0010361683') {
      const envelope = financialRead(fixture.service, 'fund', 'FR0010361683')!
      const fund = fixture.service.developmentFund('FR0010361683')!
      return route.fulfill({ json: { ...envelope, data: { ...fund, inspection: { ...fund.inspection, sourceLimits: [{ id: 'partial', detail: 'Benchmark is partial.' }] },
        rows: [{ ...fund.rows[0], name: 'Synthetic basket', weight: '-0.02', weightUnit: 'fraction', sourceScope: 'substitute-basket' }],
      } } })
    }
    if (url.pathname === '/api/status') return route.fulfill({ json: { phase: 'disconnected', snapshot: null } })
    return route.fulfill({ json: {} })
  })
  const origin = 'http://127.0.0.1:4348'
  await page.goto(`${origin}#/history`)
  await expect(page.getByRole('heading', { name: 'Saved operations' })).toBeVisible()
  await page.getByRole('link', { name: /2026-01-02.*broker-sync/ }).click()
  await expect(page.getByRole('heading', { name: 'Operation · partial' })).toBeVisible()
  await expect(page.locator('.history-list li')).toHaveCount(2)
  await page.getByRole('link', { name: /2026-01-02.*valuation/ }).click()
  const summary = page.getByRole('region', { name: 'Saved checkpoint coverage' })
  await expect(summary).toContainText('100.00% · allocated')
  await expect(summary).toContainText('1 priced · 1 unvalued')
  await expect(summary).toContainText('Valuation partial')
  await expect(summary).toContainText('Separate cash: Unknown · unknown')
  await expect(page.getByText('Synthetic unvalued holding')).toBeVisible()
  await expect(page.getByText(/Replay unavailable/)).toBeVisible()
  await page.getByText(/holdings · synthetic-broker/).click()
  await expect(page.getByText('synthetic-holdings-observation', { exact: true })).toBeVisible()
  await page.reload()
  await expect(summary).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Operation · partial' })).toBeVisible()
  await page.goForward()
  await expect(summary).toBeVisible()
  mkdirSync('test-results', { recursive: true })
  await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/history-desktop.png', fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(summary.getByText('1 priced · 1 unvalued · 0 zero positions')).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: `test-results/history-${width}.png`, fullPage: true })
  }
  mode = 'long'
  await page.reload()
  const currencyCard = page.getByRole('region', { name: 'EUR saved allocation' })
  await expect(currencyCard.getByText('99.18% · partial', { exact: true })).toBeInViewport({ ratio: 1 })
  await expect(currencyCard.getByRole('img')).toHaveAccessibleName('EUR priced-securities allocation: 99.18%; unassigned 8.19 EUR. Excludes unvalued positions and cash.')
  await expect(currencyCard.getByText('Included 991.81 EUR / priced 1,000.00 EUR', { exact: true })).toBeInViewport({ ratio: 1 })
  await expect(currencyCard.getByText('Separate cash: 1,234,567.89 EUR', { exact: true })).toBeVisible()
  await expect(currencyCard.locator('.history-exact-values')).not.toHaveAttribute('open', '')
  const exactSummary = currencyCard.getByText('Exact saved values · EUR', { exact: true })
  await exactSummary.focus(); await page.keyboard.press('Enter')
  await expect(currencyCard.locator('.history-exact-values')).toContainText(included)
  await expect(currencyCard.locator('.history-exact-values')).toContainText(longDetail.checkpoint.currencies[0].coveragePercent!)
  await page.keyboard.press('Enter')
  await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/history-long-decimal-320.png', fullPage: true })
  const firstPosition = page.locator('.history-position').first()
  await expect(firstPosition.locator('dd').nth(1)).toHaveText('991.81 EUR')
  await firstPosition.getByText('Exact saved position values', { exact: true }).click()
  await expect(firstPosition.locator('.history-exact-values')).toContainText(included)
  mode = 'normal'
  await page.getByRole('button', { name: /Navigation menu/ }).focus()
  await page.keyboard.press('Enter')
  const amundiLink = page.getByRole('link', { name: 'Amundi source', exact: true })
  await amundiLink.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Amundi saved source inspection' })).toBeVisible()
  await expect(page.getByText('Reported weight: -0.02 fraction')).toBeVisible()
  await expect(page.getByText('Benchmark is partial.', { exact: true })).toBeVisible()
  await expect(page.locator('a[href*="/security/"]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/amundi-panel-320.png', fullPage: true })
  await page.goto(`${origin}#/wiki`)
  await expect(page.getByRole('heading', { name: 'Wiki', exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`${origin}#/history?run=synthetic-failed-run`)
  await expect(page.getByText(/No checkpoint was published/)).toBeVisible()
  for (status of ['running', 'interrupted', 'cancelled', 'partial', 'succeeded']) {
    await page.goto(`${origin}#/history?run=synthetic-run-1`)
    await page.reload()
    await expect(page.getByRole('heading', { name: `Operation · ${status}` })).toBeVisible()
  }
  for (mode of ['empty', 'failure', 'missing', 'version', 'malformed']) {
    await page.goto(`${origin}#/history`); await page.reload()
    if (mode === 'empty') await expect(page.getByText(/No saved history yet/)).toBeVisible()
    else { await expect(page.getByRole('alert').filter({ hasText: 'History unavailable' })).toBeVisible(); await expect(page.getByText(/No saved history yet/)).toHaveCount(0) }
  }
  mode = 'normal'
  await page.getByRole('button', { name: 'Reload saved history' }).click()
  await page.getByRole('link', { name: 'Older operations →' }).click()
  await expect(page).toHaveURL(/cursor=synthetic-page-2/)
  await expect(page.getByRole('link', { name: 'Older operations →' })).toHaveCount(0)
  mode = 'loading'
  await page.getByRole('button', { name: 'Reload saved history' }).click()
  await expect(page.getByRole('status')).toHaveText('Loading saved history…')
  // Exercise host failure states in an isolated module interception only.
  await page.unroute('**/api/**')
  for (const lifecycle of ['disabled', 'failed']) {
    await page.route('**/web/views/bundled.tsx', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()) + `\nbrowserViews.route('history').state = '${lifecycle}';\n` })
    })
    await page.goto(`${origin}#/history`); await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: `This view is ${lifecycle}` })).toBeVisible()
    await page.getByRole('link', { name: 'Wiki', exact: true }).click()
    await expect(page.locator('iframe')).toBeVisible()
    await page.unroute('**/web/views/bundled.tsx')
  }
  expect(errors).toEqual([])
  expect(requests.filter(path => /refresh|login|continue/.test(path))).toEqual([])
  console.log('PASS: synthetic history navigation, saved coverage, decimals, source/replay gaps, statuses, errors, pagination, keyboard, 390/320px and registered Wiki/Amundi.')
} finally { await browser.close(); await server.close(); await fixture.service.close() }
