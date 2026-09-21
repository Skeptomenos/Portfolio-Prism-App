import { financialFulfill } from './fixtures/financial-wire.mjs'
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
    connected: false,
    activeOperation: null,
    automaticRefresh: { enabled: false, intervalMinutes: 15, sessionRestoreEnabled: true },
    lastSuccessfulSyncAt: null,
    phase: 'disconnected',
    error: null,
    sessionWarning: null,
    lastAttemptAt: null,
    snapshot: null,
  }
  await page.route('**/api/status', (route) => financialFulfill(route, { json: status }))
  // Keep this connection harness isolated from the host service's other reads.
  await page.route('**/api/financial/coverage', route => financialFulfill(route, { json: null }))
  await page.route('**/api/compositions/status', route => financialFulfill(route, { json: { active: false, attempts: {}, warning: null } }))
  await page.route('**/api/data', (r) => financialFulfill(r, { json: { sources: [] } }))
  await page.route('**/api/financial/exposure', (r) =>
    financialFulfill(r, {
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
  await page.route('**/api/financial/overview', (r) =>
    financialFulfill(r, {
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
  await page.goto(`${process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4310'}#portfolio`)
  await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Connect & sync', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Data & connections' })).toBeVisible()
  await expect(page.getByLabel('Phone number')).toBeFocused()
  await expect(
    page.getByText('Automatic refresh is disabled for this preview.', { exact: false })
  ).toBeVisible()
  await expect(page.locator('.advanced-data')).not.toHaveAttribute('open', '')
  await expect(page.getByRole('button', { name: 'Connect & sync' })).toBeEnabled()
  await expect
    .poll(() =>
      page
        .locator('.route-content')
        .first()
        .evaluate((node) => getComputedStyle(node).opacity)
    )
    .toBe('1')
  await page.screenshot({ path: `${output}/disconnected-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: `${output}/disconnected-mobile.png`, fullPage: true })
  let logins = 0,
    syncs = 0
  await page.route('**/api/sync', (route) => {
    syncs += 1
    status = { ...status, phase: 'syncing', activeOperation: 'portfolio', error: null }
    return financialFulfill(route, { status: 202, json: { accepted: true } })
  })
  await page.route('**/api/login', async (route) => {
    logins += 1
    status.phase = 'awaiting-approval'
    status.activeOperation = 'portfolio'
    await new Promise((resolve) => setTimeout(resolve, 100))
    return financialFulfill(route, { status: 202, json: { accepted: true } })
  })
  await page.getByLabel('Phone number').fill('+49123456789')
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Connect & sync' }).dblclick()
  await expect(
    page.getByText(
      'Approve in the Trade Republic phone app. Import starts automatically after approval.'
    )
  ).toBeVisible()
  await expect(page.getByLabel('PIN', { exact: true })).toHaveValue('')
  expect(logins).toBe(1)
  status = { ...status, phase: 'syncing', connected: true }
  await expect(
    page.getByText('Importing positions and refreshing saved quotes and cash…')
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync portfolio' })).toBeDisabled()
  status = {
    ...status,
    phase: 'connected',
    activeOperation: null,
    lastSuccessfulSyncAt: '2026-09-06T12:01:00Z',
    lastPortfolioAttempt: {
      event: 'succeeded',
      outcome: {
        holdings: { snapshotId: 1, fetchedAt: '2026-09-06T12:00:00Z' },
        valuation: 'success',
        sources: [],
      },
    },
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
  await expect(page.getByText('Portfolio updated.', { exact: true })).toBeVisible()
  expect(syncs).toBe(0) // Login's automatic import must not trigger a second client sync.
  await page.goto(`${process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4310'}#/portfolio`)
  await expect(page.getByRole('cell', { name: 'Synthetic Apple position' })).toBeVisible()
  // On reload the API can report a saved partial outcome without an in-memory error.
  status = {
    ...status,
    error: null,
    lastPortfolioAttempt: null,
    outcome: {
      holdings: { snapshotId: 1, fetchedAt: status.snapshot.fetchedAt },
      valuation: 'cancelled',
      sources: [{ id: 'cash', status: 'success' }],
    },
  }
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: /Holdings saved/ })).toContainText(
    'Valuation refresh cancelled'
  )
  await expect(page.getByRole('cell', { name: 'Synthetic Apple position' })).toBeVisible()
  await expect(page.locator('.route-content').first()).toHaveCSS('opacity', '1')
  await page.screenshot({ path: `${output}/cancelled-import-synthetic.png`, fullPage: true })
  const saved = structuredClone(status.snapshot)
  const successAt = status.lastSuccessfulSyncAt
  status = {
    ...status,
    error: 'Sync failed. Your last saved holdings are unchanged.',
    lastPortfolioAttempt: {
      event: 'failed',
      category: 'network',
      outcome: { holdings: null, valuation: 'not-requested', sources: [] },
    },
  }
  await expect(page.getByRole('alert')).toContainText('last saved holdings are unchanged')
  await expect(page.getByRole('button', { name: 'Retry sync' })).toBeEnabled()
  await page.getByRole('button', { name: 'Retry sync' }).dblclick()
  expect(syncs).toBe(1)
  await expect(
    page.getByText('Importing positions and refreshing saved quotes and cash…')
  ).toBeVisible()
  status = {
    ...status,
    phase: 'disconnected',
    connected: false,
    activeOperation: null,
    error: 'Session expired. Reconnect to Trade Republic.',
    lastPortfolioAttempt: { event: 'failed', category: 'authentication' },
  }
  await expect(page.getByRole('link', { name: 'Reconnect & sync' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Synthetic Apple position' })).toBeVisible()
  expect(status.snapshot).toEqual(saved)
  expect(status.lastSuccessfulSyncAt).toBe(successAt)
  await page.getByRole('link', { name: 'Reconnect & sync' }).click()
  await expect(page.getByLabel('Phone number')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Reconnect & sync' })).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText('Session expired')
  status = {
    ...status,
    connected: true,
    phase: 'syncing',
    activeOperation: 'extraction',
    error: null,
  }
  await expect(
    page.getByText('Advanced data extraction is running; it is not a portfolio sync.')
  ).toBeVisible()
  await expect(
    page.getByText('Importing positions and refreshing saved quotes and cash…')
  ).not.toBeVisible()
  expect(errors).toEqual([])
  console.log(
    'Browser checks passed: discovery/focus, offline policy, approval/import/success, saved partial outcome, retry/reconnect, extraction distinction, duplicate guards and no extra sync after login. Synthetic only; no live broker authentication.'
  )
} finally {
  await browser.close()
}
