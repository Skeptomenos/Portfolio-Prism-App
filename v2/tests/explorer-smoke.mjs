import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
  })
  const errors = []
  page.on('pageerror', () => errors.push('pageerror'))
  const status = {
    phase: 'connected',
    error: null,
    sessionWarning: null,
    lastDiagnostic: { at: 'synthetic' },
    snapshot: {
      fetchedAt: '2026-09-06T12:00:00Z',
      positions: [
        {
          account: 'test',
          name: 'Zeta fund',
          isin: 'US0378331005',
          quantity: '2',
          instrumentType: 'fund',
          averageBuyIn: '100',
        },
        {
          account: 'test',
          name: 'Alpha stock',
          isin: 'US88160R1014',
          quantity: '10',
          instrumentType: 'stock',
          averageBuyIn: '20',
        },
      ],
    },
  }
  await page.route('**/api/overview', (r) =>
    r.fulfill({
      json: {
        rows: status.snapshot.positions.map((p) => ({
          ...p,
          currency: 'EUR',
          value: p.name === 'Zeta fund' ? '400' : '200',
          price: '20',
          weight: '50',
          quoteAt: '2026-09-06T12:00:00Z',
          venue: 'LSX',
          quality: 'Synthetic quote',
        })),
        totals: [],
        pricedCount: 2,
        zeroCount: 0,
        missingCount: 0,
        holdingsAt: status.snapshot.fetchedAt,
        quoteRetrievedAt: status.snapshot.fetchedAt,
      },
    })
  )
  await page.route('**/api/status', (r) => r.fulfill({ json: status }))
  await page.route('**/api/data', (r) =>
    r.fulfill({
      json: {
        sources: [
          {
            id: 'cash',
            title: 'Cash balances',
            note: 'Trade Republic cash in supplied currencies.',
            status: 'success',
            coverage: 'Complete response',
            payload: [{ currencyId: 'EUR', amount: 123.45 }],
            fetchedAt: '2026-09-06T12:00:00Z',
          },
          {
            id: 'taxInformation',
            title: 'Tax information',
            status: 'failed',
            note: 'Broker tax data.',
            coverage: 'Previous response',
            error: { category: 'http', httpStatus: 503 },
            payload: { synthetic: 42 },
          },
        ],
      },
    })
  )
  let extraction = false
  await page.route('**/api/extract', (r) => {
    extraction = true
    return r.fulfill({ status: 202, json: { accepted: true } })
  })
  await page.route('**/api/exposure', (r) =>
    r.fulfill({
      json: {
        rows: [],
        coverage: [],
        gaps: [],
        composition: null,
        missingValuations: 0,
        pilotOwned: false,
      },
    })
  )
  await page.goto(process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4310')
  await expect(page.getByRole('heading', { name: 'Explore what your broker knows' })).toBeVisible()
  await expect(page.locator('table').first().locator('tbody tr').first()).toContainText('Zeta fund')
  await page.getByRole('button', { name: /^Quantity/ }).click()
  await expect(page.locator('table').first().locator('tbody tr').first()).toContainText('Zeta fund')
  await page.getByRole('button', { name: /^Quantity/ }).click()
  await expect(page.locator('table').first().locator('tbody tr').first()).toContainText(
    'Alpha stock'
  )
  await expect(page.getByRole('columnheader', { name: /Estimated value/ })).toBeVisible()
  await page.getByRole('button', { name: 'Extract broker data' }).click()
  expect(extraction).toBe(true)
  await page
    .locator('.source-card')
    .filter({ hasText: 'Cash balances' })
    .locator('summary')
    .first()
    .click()
  await page
    .locator('.source-card')
    .filter({ hasText: 'Cash balances' })
    .locator('.data-field summary')
    .first()
    .click()
  await expect(page.getByText('123.45', { exact: true })).toBeVisible()
  await page.getByLabel('Find a data source').fill('tax')
  await expect(page.locator('.source-card')).toHaveCount(1)
  await page.locator('.source-card > summary').click()
  await expect(page.getByText(/Previous response retained/)).toBeVisible()
  await page.getByLabel('Find a data source').fill('')
  mkdirSync('v2/test-results', { recursive: true })
  await page.screenshot({ path: 'v2/test-results/explorer-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: 'v2/test-results/explorer-mobile.png', fullPage: true })
  await page.route('**/api/overview', (r) =>
    r.fulfill({
      json: {
        rows: [
          {
            ...status.snapshot.positions[0],
            name: 'Changed quantity',
            quantity: '20',
            value: null,
            currency: 'EUR',
            price: '100',
            weight: null,
            quoteAt: status.snapshot.fetchedAt,
            quality: 'Quantity/quote basis unverified',
            venue: 'LSX',
          },
          {
            ...status.snapshot.positions[1],
            name: 'Negative synthetic fund',
            quantity: '-9',
            value: null,
            currency: 'EUR',
            price: null,
            weight: null,
            quoteAt: null,
            quality: 'Negative quantity · unsupported in long-only exposure',
            venue: 'LSX',
          },
          {
            ...status.snapshot.positions[1],
            account: 'zero',
            name: 'Zero synthetic position',
            quantity: '0',
            value: '0',
            currency: 'EUR',
            price: null,
            weight: null,
            quoteAt: null,
            quality: 'Zero quantity · no economic contribution',
            venue: 'LSX',
          },
        ],
        totals: [],
        pricedCount: 0,
        zeroCount: 1,
        missingCount: 2,
        holdingsAt: status.snapshot.fetchedAt,
        quoteRetrievedAt: status.snapshot.fetchedAt,
      },
    })
  )
  await page.reload()
  await expect(page.getByText('0/2 nonzero positions valued')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Changed quantity' })).toContainText(
    'Quantity/quote basis unverified'
  )
  await expect(page.getByRole('row').filter({ hasText: 'Negative synthetic fund' })).toContainText(
    'unsupported in long-only exposure'
  )
  await expect(page.getByRole('row').filter({ hasText: 'Zero synthetic position' })).toContainText(
    '0.00 EUR'
  )
  await expect(page.locator('main > section').first()).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'v2/test-results/valuation-gaps-synthetic.png', fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Explorer UI passed: source fields, failure/stale notes, provenance, numeric sorting, extraction action, filtering, mobile overflow, no page errors. Synthetic data only.'
  )
} finally {
  await browser.close()
}
