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
    activeOperationName: null,
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
  await page.route('**/api/investigations', route => financialFulfill(route, { json: { items: [], counts: { open: 0, excluded: 0, manualSupported: 0 } } }))
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
    status = { ...status, phase: 'syncing', activeOperation: 'portfolio', activeOperationName: 'sync', error: null, lastDiagnostic: { operation: 'sync', stage: 'syncing' } }
    return financialFulfill(route, { status: 202, json: { accepted: true } })
  })
  await page.route('**/api/login', async (route) => {
    logins += 1
    status.phase = 'connecting'
    status.activeOperation = 'portfolio'
    status.activeOperationName = 'login'
    status.lastDiagnostic = { operation: 'login', stage: 'login_request', event: 'started' }
    await new Promise((resolve) => setTimeout(resolve, 100))
    return financialFulfill(route, { status: 202, json: { accepted: true } })
  })
  let cancellations = 0
  let cancelAfterApproval = false
  await page.route('**/api/cancel', async (route) => {
    cancellations += 1
    await new Promise((resolve) => setTimeout(resolve, 120))
    status = {
      ...status,
      phase: 'disconnected',
      connected: false,
      activeOperation: null,
      activeOperationName: null,
      error: cancelAfterApproval ? 'Portfolio import cancelled. Saved holdings remain available.' : null,
      lastPortfolioAttempt: {
        operation: 'login',
        stage: cancelAfterApproval ? 'data_extraction' : 'awaiting-approval',
        event: 'cancelled',
        category: 'cancelled',
        attemptId: 'synthetic-cancel',
        ...(cancelAfterApproval ? { outcome: {
          holdings: { snapshotId: 1, fetchedAt: '2026-09-06T12:00:00Z' },
          valuation: 'partial',
          events: 'failed',
          sources: [],
        } } : {}),
      },
    }
    return financialFulfill(route, { status: 202, json: { accepted: true } })
  })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.getByLabel('Phone number').fill('+49123456789')
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Connect & sync' }).dblclick()
  await expect(page.getByRole('heading', { name: 'Requesting phone approval' })).toBeVisible()
  await expect(page.locator('.connection-heading .status')).toHaveText('Requesting approval')
  status = { ...status, phase: 'awaiting-approval', activeOperationName: 'login', lastDiagnostic: { operation: 'sync', stage: 'syncing', event: 'started' } }
  await expect(page.getByRole('heading', { name: 'Open Trade Republic on your phone' })).toBeVisible()
  await expect(page.locator('.connection-heading .status')).toHaveText('Waiting for approval')
  await expect(page.getByText('Waiting for your approval…')).toBeVisible()
  await expect(page.getByText(/Approve the login request in the app.*automatically\./)).toBeVisible()
  await expect(page.getByLabel('Connect Trade Republic')).toHaveCount(0)
  await expect(page.getByLabel('PIN', { exact: true })).toHaveCount(0)
  status = { ...status, lastDiagnostic: null, activeOperationName: undefined }
  await expect(page.getByRole('heading', { name: 'Open Trade Republic on your phone' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel approval' })).toBeVisible()
  await expect(page.locator('.auth-progress h2')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.screenshot({ path: `${output}/approval-pending-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Cancel approval' })).toBeFocused()
  await page.screenshot({ path: `${output}/approval-pending-mobile.png`, fullPage: true })
  expect(logins).toBe(1)
  await page.setViewportSize({ width: 1280, height: 1000 })
  status = { ...status, phase: 'syncing', connected: true, activeOperationName: 'login' }
  await expect(
    page.getByRole('heading', { name: 'Approval received. Importing your portfolio' })
  ).toBeVisible()
  await expect(page.getByText('Saving holdings and refreshing quotes and cash…')).toBeVisible()
  status = {
    ...status,
    phase: 'connected',
    activeOperation: null,
    activeOperationName: null,
    lastSuccessfulSyncAt: '2026-09-06T12:01:00Z',
    lastPortfolioAttempt: {
      operation: 'login',
      event: 'partial',
      outcome: {
        holdings: { snapshotId: 1, fetchedAt: '2026-09-06T12:00:00Z' },
        valuation: 'success',
        events: 'partial',
        sources: [],
      },
    },
    lastDiagnostic: { at: 'synthetic-import-complete', operation: 'login' },
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
  await expect(page.getByRole('heading', { name: 'Phone approval succeeded. The import has partial results.' })).toBeVisible()
  await expect(page.locator('.connection-heading .status')).toHaveText('Import partial')
  await expect(page.getByLabel('Connect Trade Republic')).toHaveCount(0)
  status = {
    ...status,
    lastPortfolioAttempt: {
      ...status.lastPortfolioAttempt,
      event: 'succeeded',
      outcome: { ...status.lastPortfolioAttempt.outcome, events: 'success' },
    },
  }
  await expect(page.getByRole('heading', { name: 'Login and import complete' })).toBeVisible()
  await expect(page.locator('.connection-heading .status')).toHaveText('Login complete')
  await expect(page.getByRole('button', { name: 'Sync portfolio' })).toBeEnabled()
  status = {
    ...status,
    phase: 'syncing',
    activeOperation: 'portfolio',
    activeOperationName: 'sync',
    lastDiagnostic: { operation: 'login', stage: 'login_request', event: 'started' },
  }
  await page.reload()
  await expect(page.locator('.connection-heading .status')).toHaveText('Connected')
  await expect(page.getByRole('heading', { name: 'Approval received. Importing your portfolio' })).toHaveCount(0)
  await expect(page.getByLabel('Connect Trade Republic')).toHaveCount(0)
  status = { ...status, phase: 'connected', activeOperation: null, activeOperationName: null }
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
    activeOperationName: null,
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
    activeOperationName: 'extraction',
    error: null,
  }
  await expect(
    page.getByText('Advanced data extraction is running; it is not a portfolio sync.')
  ).toBeVisible()
  await expect(
    page.getByText('Importing positions and refreshing saved quotes and cash…')
  ).not.toBeVisible()
  // A phone approval can be cancelled. The result keeps the credentials form available for retry.
  status = {
    ...status,
    phase: 'disconnected',
    connected: false,
    activeOperation: null,
    activeOperationName: null,
    lastPortfolioAttempt: null,
    lastDiagnostic: null,
    error: null,
  }
  await page.goto(`${process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4310'}#/data`)
  await expect(page.getByLabel('Connect Trade Republic')).toBeVisible()
  await page.getByLabel('Phone number').fill('+49123456789')
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Connect & sync' }).click()
  await expect(page.getByRole('heading', { name: 'Requesting phone approval' })).toBeVisible()
  status = { ...status, phase: 'awaiting-approval', activeOperationName: 'login', lastDiagnostic: { operation: 'login', stage: 'awaiting-approval', event: 'started' } }
  await expect(page.getByRole('heading', { name: 'Open Trade Republic on your phone' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel approval' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Cancelling the login request' })).toBeVisible()
  await expect(page.getByText('Cancelling the request…')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Login approval cancelled' })).toBeVisible()
  await expect(page.getByLabel('Connect Trade Republic')).toBeVisible()
  expect(cancellations).toBe(1)
  // Cancellation during the post-approval import must preserve and describe saved outcomes.
  cancelAfterApproval = true
  await page.getByLabel('Phone number').fill('+49123456789')
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByRole('button', { name: 'Connect & sync' }).click()
  await expect(page.getByRole('heading', { name: 'Requesting phone approval' })).toBeVisible()
  status = { ...status, phase: 'syncing', connected: true, activeOperation: 'portfolio', activeOperationName: 'login' }
  await expect(page.getByRole('heading', { name: 'Approval received. Importing your portfolio' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel login' }).click()
  await expect(page.getByRole('heading', { name: 'Portfolio import cancelled' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Phone approval succeeded. Holdings were saved. Valuation refresh partial; transaction refresh failed. The import was cancelled. Use Reconnect & sync below to re-establish the connection and retry the portfolio import.')
  await expect(page.getByRole('button', { name: 'Reconnect & sync' })).toBeEnabled()
  expect(cancellations).toBe(2)
  cancelAfterApproval = false
  // Synthetic timeout and authentication failures have distinct guidance and preserve retry.
  status = {
    ...status,
    phase: 'disconnected',
    connected: false,
    activeOperation: null,
    activeOperationName: null,
    lastPortfolioAttempt: {
      operation: 'login',
      stage: 'awaiting-approval',
      event: 'failed',
      category: 'timeout',
      timeoutOrigin: 'operation',
      attemptId: 'synthetic-timeout',
    },
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The login request timed out' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('No approval was confirmed before the request timed out')
  await expect(page.getByLabel('Connect Trade Republic')).toBeVisible()
  // A timeout during the post-approval import keeps its partial outcome visible.
  status = {
    ...status,
    phase: 'disconnected',
    connected: false,
    error: 'The portfolio import timed out. Saved holdings remain available.',
    lastPortfolioAttempt: {
      operation: 'login',
      stage: 'data_extraction',
      event: 'failed',
      category: 'timeout',
      timeoutOrigin: 'operation',
      attemptId: 'synthetic-import-timeout',
      outcome: {
        holdings: { snapshotId: 1, fetchedAt: status.snapshot.fetchedAt },
        valuation: 'partial',
        events: 'failed',
        sources: [],
      },
    },
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Portfolio import timed out' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Phone approval succeeded. Holdings were saved. Valuation refresh partial; transaction refresh failed. Use Reconnect & sync below to re-establish the connection and retry the portfolio import.')
  await expect(page.getByRole('button', { name: 'Reconnect & sync' })).toBeEnabled()
  status = {
    ...status,
    phase: 'disconnected',
    connected: false,
    error: 'Session expired. Reconnect to Trade Republic.',
    lastPortfolioAttempt: {
      operation: 'login',
      event: 'failed',
      category: 'authentication',
      attemptId: 'synthetic-auth-failure',
    },
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Could not complete the login' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('did not accept the login')
  await expect(page.getByLabel('Connect Trade Republic')).toBeVisible()
  expect(errors).toEqual([])
  console.log(
    'Browser checks passed: desktop/mobile approval, diagnostic-independent login progress, keyboard focus/cancel, authenticating/importing/completed states, partial outcome, pre/post-approval cancellation and timeout recovery, retry/reconnect, extraction distinction and no extra sync after login. Synthetic only; no live broker authentication.'
  )
} finally {
  await browser.close()
}
