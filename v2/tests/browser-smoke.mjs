import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../test-results/', import.meta.url))
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  let status = {
    phase: 'disconnected',
    error: null,
    sessionWarning: null,
    lastAttemptAt: null,
    snapshot: null,
  }
  await page.route('**/api/status', (route) => route.fulfill({ json: status }))
  await page.route('**/api/data', (r) => r.fulfill({ json: { sources: [] } }))
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
  await page.route('**/api/overview', (r) =>
    r.fulfill({
      json: {
        rows: (status.snapshot?.positions ?? []).map((p) => ({
          ...p,
          value: null,
          currency: null,
          price: null,
          weight: null,
          quoteAt: null,
          quality: 'Synthetic unvalued',
          venue: null,
        })),
        totals: [],
        pricedCount: 0,
        zeroCount: 0,
        missingCount: status.snapshot?.positions.length ?? 0,
        holdingsAt: status.snapshot?.fetchedAt ?? null,
        quoteRetrievedAt: null,
      },
    })
  )
  await page.goto(process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4310')
  await expect(page.getByRole('heading', { name: 'Start with what you own.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect securely' })).toBeEnabled()
  await expect
    .poll(() =>
      page
        .locator('main > section')
        .first()
        .evaluate((node) => getComputedStyle(node).opacity)
    )
    .toBe('1')
  await page.screenshot({ path: `${output}/disconnected-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: `${output}/disconnected-mobile.png`, fullPage: true })
  await page.route('**/api/login', (route) => {
    status.phase = 'awaiting-approval'
    return route.fulfill({ status: 202, json: { accepted: true } })
  })
  await page.getByLabel('Phone number').fill('+49123456789')
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Connect securely' }).click()
  await expect(
    page.getByText(
      'Approve this login in your Trade Republic app. This page will update automatically.'
    )
  ).toBeVisible()
  await expect(page.getByLabel('PIN', { exact: true })).toHaveValue('')
  status = {
    ...status,
    phase: 'connected',
    lastDiagnostic: { at: 'synthetic-import-complete' },
    snapshot: {
      fetchedAt: '2026-09-06T12:00:00Z',
      positions: [
        {
          account: 'synthetic',
          isin: 'US0378331005',
          name: 'Synthetic Apple position',
          quantity: '1.5',
          instrumentType: 'stock',
          averageBuyIn: '100',
        },
      ],
    },
  }
  await expect(page.getByRole('cell', { name: 'Synthetic Apple position' })).toBeVisible()
  // On reload the API can report a saved partial outcome without an in-memory error.
  status = {
    ...status,
    error: null,
    outcome: {
      holdings: { snapshotId: 1, fetchedAt: status.snapshot.fetchedAt },
      valuation: 'cancelled',
      sources: [{ id: 'cash', status: 'success' }],
    },
  }
  await page.reload()
  await expect(
    page.getByRole('alert').filter({ hasText: /Last saved holdings import/ })
  ).toContainText('Valuation refresh cancelled')
  await expect(page.getByRole('cell', { name: 'Synthetic Apple position' })).toBeVisible()
  await expect(page.locator('main > section').first()).toHaveCSS('opacity', '1')
  await page.screenshot({ path: `${output}/cancelled-import-synthetic.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Browser checks passed: startup, desktop/mobile layout, simulated approval and holdings, PIN cleared, no page errors. Live broker authentication not exercised.'
  )
} finally {
  await browser.close()
}
