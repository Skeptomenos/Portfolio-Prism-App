import { chromium, expect } from '@playwright/test'
// @ts-expect-error Synthetic fixture helper is JavaScript-only.
import { financialFulfill } from './fixtures/financial-wire.mjs'

const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4353'
const scope = { connectionId: 'synthetic', account: 'account', isin: 'US0378331005' }
const item = { scope, name: 'Sequenced security', state: 'open', reason: 'Needs review', value: null, currency: 'EUR', manualStatus: 'No active manual price', manualEvidence: null, evidence: [], manualAllowed: false, allowedCurrencies: [], quantityObservedAt: '2026-09-20T10:00:00Z', decisionAt: null, brokerValue: null, brokerReason: 'No broker quote' }
let current: any = { items: [item], counts: { open: 1, excluded: 0, manualSupported: 0 } }
let coverageManual = 0
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  let coverageGets = 0
  let coverageRace = false
  let coverageHeld = false
  let releaseCoverage!: () => void
  const coverageOld = new Promise<void>(resolve => { releaseCoverage = resolve })
  let coverageDelayedStarted!: () => void
  const coverageStarted = new Promise<void>(resolve => { coverageDelayedStarted = resolve })
  let coverageDelayedFinished!: () => void
  const coverageFinished = new Promise<void>(resolve => { coverageDelayedFinished = resolve })
  await page.route('**/api/financial/**', route => {
    if (!route.request().url().endsWith('/coverage')) return financialFulfill(route, { json: null })
    coverageGets += 1
    const snapshot = { totals: [], pricedCount: 0, unvalued: 0, zeroCount: 0, positionCount: 1, companyGrouping: 'partial', reconciliation: 'pending', holdingsAt: null, quoteDates: { earliest: null, latest: null }, compositionDates: { earliest: null, latest: null }, staleQuotes: 0, staleCompositions: 0, refreshFailed: false, warning: null, counts: { held: 0, saved: 0, checked: 0, used: 0, underlyingOnly: 0 }, funds: [], gaps: [], manualValuations: coverageManual }
    if (coverageRace && !coverageHeld) {
      coverageHeld = true
      coverageDelayedStarted()
      return coverageOld.then(() => { coverageDelayedFinished(); return financialFulfill(route, { json: snapshot }) })
    }
    return financialFulfill(route, { json: snapshot })
  })
  await page.route('**/api/status', route => route.fulfill({ json: { phase: 'disconnected', snapshot: null, error: null, lastDiagnostic: null, lastAttemptAt: null, sessionWarning: null } }))
  await page.route('**/api/compositions/status', route => route.fulfill({ json: { active: false, automatic: false, currentFundIsin: null, attempts: {}, warning: null } }))
  let gets = 0
  let posts = 0
  let firstStart!: () => void, firstRelease!: () => void, firstFinish!: () => void
  const firstStarted = new Promise<void>(resolve => { firstStart = resolve })
  const firstFinished = new Promise<void>(resolve => { firstFinish = resolve })
  const firstOld = new Promise<void>(resolve => { firstRelease = resolve })
  let secondStart!: () => void, secondRelease!: () => void, secondFinish!: () => void
  const secondStarted = new Promise<void>(resolve => { secondStart = resolve })
  const secondFinished = new Promise<void>(resolve => { secondFinish = resolve })
  const secondOld = new Promise<void>(resolve => { secondRelease = resolve })
  await page.route('**/api/investigations', async route => {
    if (route.request().method() === 'GET') {
      gets += 1
      const snapshot = structuredClone(current)
      if (gets === 2) {
        firstStart()
        await firstOld
        const response = await route.fulfill({ json: snapshot })
        firstFinish()
        return response
      } else if (gets === 3) {
        secondStart()
        await secondOld
        const response = await route.fulfill({ json: snapshot })
        secondFinish()
        return response
      }
      return route.fulfill({ json: snapshot })
    }
    posts += 1
    if (posts === 1) return route.fulfill({ status: 400, json: { error: 'Only a compatible source-backed price can be saved.' } })
    current = { ...current, items: [{ ...item, state: 'excluded', reason: 'Newer response' }], counts: { open: 0, excluded: 1, manualSupported: 0 } }
    return route.fulfill({ json: current })
  })
  await page.goto(`${origin}#/portfolio`)
  const panel = page.getByRole('region', { name: 'Investigations' })
  const card = panel.locator('article').filter({ hasText: 'Sequenced security' })
  await card.getByText('Manual evidence and actions').click()
  await card.getByLabel('Decision reason').fill('Rejected write')
  await card.getByRole('button', { name: 'Exclude from investigation' }).click()
  await expect(panel.getByRole('alert')).toContainText('Only a compatible source-backed price can be saved.')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prism-investigations-changed')))
  await firstStarted
  firstRelease()
  await firstFinished
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(panel.getByRole('alert')).toContainText('Only a compatible source-backed price can be saved.')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prism-investigations-changed')))
  await secondStarted
  // GET3 captured the old state before the successful POST; the POST triggers GET4 with the newer state.
  await card.getByLabel('Decision reason').fill('Successful write')
  await card.getByRole('button', { name: 'Exclude from investigation' }).click()
  await panel.getByRole('button', { name: 'Excluded', exact: true }).click()
  await expect(panel).toContainText('Newer response')
  secondRelease()
  await secondFinished
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(panel).toContainText('Newer response')
  const coverage = page.getByRole('region', { name: 'Portfolio coverage' })
  coverageManual = 0
  coverageRace = true
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prism-investigations-changed')))
  await coverageStarted
  coverageManual = 1
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prism-investigations-changed')))
  await expect(coverage).toContainText('1 positions use user-provided manual price fallback')
  releaseCoverage()
  await coverageFinished
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(coverage).toContainText('1 positions use user-provided manual price fallback')
  console.log('PASS: mutation error survives successful polling and stale delayed reads cannot restore older investigation state')
} finally { await browser.close() }
