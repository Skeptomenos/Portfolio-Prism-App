import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
// @ts-expect-error Synthetic fixture helper is intentionally JavaScript-only.
import { financialFulfill } from './fixtures/financial-wire.mjs'

const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4353'
const parsed = new URL(origin)
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '4353') throw Error('Use the isolated synthetic investigation origin on port 4353')
mkdirSync('v2/test-results', { recursive: true, mode: 0o700 })

const scope = (account: string, isin: string) => ({ connectionId: 'synthetic-connection', account, isin })
const noFinance = { scope: scope('cash-account', 'US0378331005'), name: 'No finance evidence', state: 'open' as const, reason: 'No compatible broker listing', value: null, currency: 'EUR', manualStatus: 'No active manual price', manualEvidence: null, evidence: [], manualAllowed: false, allowedCurrencies: [], quantityObservedAt: '2026-09-20T10:00:00Z', decisionAt: null, brokerValue: null, brokerReason: 'Inactive quantity continuity', }
const manualPrice = { scope: scope('broker-account', 'US5949181045'), name: 'Manual price candidate', state: 'open' as const, reason: 'Quote unavailable', value: null, currency: 'EUR', manualStatus: 'No active manual price', manualEvidence: null, evidence: [], manualAllowed: true, allowedCurrencies: ['EUR'], quantityObservedAt: '2026-09-20T10:00:00Z', decisionAt: null, brokerValue: null, brokerReason: 'No compatible broker quote', }
const inactive = { scope: scope('inactive-account', 'US02079K3059'), name: 'Broker value takes precedence', state: 'open' as const, reason: 'Manual evidence is inactive', value: '42.00', currency: 'EUR', manualStatus: 'Inactive: eligible broker value takes precedence', manualEvidence: null, evidence: [], manualAllowed: true, allowedCurrencies: ['EUR'], quantityObservedAt: '2026-09-20T10:00:00Z', decisionAt: null, brokerValue: '42.00', brokerReason: 'Eligible broker value takes precedence', }
let items: any[] = [noFinance, manualPrice, inactive]
const result = () => ({ items, counts: { open: items.filter(item => item.state === 'open').length, excluded: items.filter(item => item.state === 'excluded').length, manualSupported: items.filter(item => item.manualStatus.startsWith('Manual price fallback selected')).length } })

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/financial/**', route => financialFulfill(route, { json: route.request().url().endsWith('/overview') ? { rows: [], totals: [], pricedCount: 0, zeroCount: 0, missingCount: 0, holdingsAt: null, quoteRetrievedAt: null } : null }))
  await page.route('**/api/status', route => route.fulfill({ json: { phase: 'disconnected', snapshot: null, error: null, lastDiagnostic: null, lastAttemptAt: null, sessionWarning: null } }))
  await page.route('**/api/compositions/status', route => route.fulfill({ json: { active: false, automatic: false, currentFundIsin: null, attempts: {}, warning: null } }))
  await page.route('**/api/investigations', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: result() })
    const body = route.request().postDataJSON()
    expect(route.request().headers()['x-prism-client']).toBe('1')
    const found = items.find(item => JSON.stringify(item.scope) === JSON.stringify(body.scope))!
    if (body.action === 'decide') {
      found.state = body.state
      found.reason = body.reason
      found.decisionAt = '2026-09-21T12:00:00Z'
    } else if (body.action === 'note') {
      const evidence = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scope: found.scope, recordedAt: '2026-09-21T12:01:00Z', kind: 'note' as const, price: null, currency: null, asOf: null, source: body.source, reason: body.reason, unit: null, quantity: null, quantityObservedAt: null, revokes: null }
      found.evidence.push(evidence)
      found.manualStatus = 'Note retained; no active manual price'
    } else if (body.action === 'price') {
      expect(body.price).toBe('123.4500')
      expect(body.currency).toBe('EUR')
      expect(body.unit).toBe('per-security')
      const evidence = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', scope: found.scope, recordedAt: '2026-09-21T12:02:00Z', kind: 'price' as const, price: body.price, currency: body.currency, asOf: body.asOf, source: body.source, reason: body.reason, unit: 'per-security' as const, quantity: '2', quantityObservedAt: found.quantityObservedAt, revokes: null }
      found.evidence.push(evidence)
      found.manualEvidence = evidence
      found.manualStatus = 'Manual price fallback selected'
      found.value = '246.9000'
      found.currency = 'EUR'
    } else if (body.action === 'revoke') {
      found.evidence.push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', scope: found.scope, recordedAt: '2026-09-21T12:03:00Z', kind: 'revoke' as const, price: null, currency: null, asOf: null, source: 'User revocation', reason: body.reason, unit: null, quantity: null, quantityObservedAt: null, revokes: body.evidenceId })
      found.manualEvidence = null
      found.manualStatus = 'Manual price revoked; prior revisions remain saved'
      found.value = null
    }
    return route.fulfill({ json: result() })
  })
  await page.goto(`${origin}#/portfolio`)
  const panel = page.getByRole('region', { name: 'Investigations' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('No finance evidence')
  await expect(panel).toContainText('Inactive: eligible broker value takes precedence')
  await expect(panel).toContainText('quantity observed')

  const noFinanceCard = panel.locator('article').filter({ hasText: 'No finance evidence' })
  await noFinanceCard.getByText('Manual evidence and actions').click()
  await noFinanceCard.getByLabel('Decision reason').fill('Excluded after review')
  await noFinanceCard.getByRole('button', { name: 'Exclude from investigation' }).click()
  await expect(panel.getByRole('button', { name: 'Excluded' })).toBeVisible()
  await panel.getByRole('button', { name: 'Excluded' }).click()
  await expect(panel).toContainText('No finance evidence')
  await noFinanceCard.getByText('Manual evidence and actions').click()
  await noFinanceCard.getByLabel('Decision reason').fill('Reopen for source review')
  await noFinanceCard.getByRole('button', { name: 'Reopen investigation' }).click()

  await panel.getByRole('button', { name: 'Open', exact: true }).click()
  await noFinanceCard.getByText('Manual evidence and actions').click()
  await noFinanceCard.getByLabel('Evidence source').fill('Broker support ticket')
  await noFinanceCard.getByLabel('Decision reason').fill('No finance evidence available')
  await noFinanceCard.getByRole('button', { name: 'Add note' }).click()
  await expect(noFinanceCard).toContainText('Broker support ticket')
  await expect(noFinanceCard).toContainText('Manual price is unavailable')

  const priceCard = panel.locator('article').filter({ hasText: 'Manual price candidate' })
  await priceCard.getByText('Manual evidence and actions').click()
  await priceCard.getByLabel('Price per security').fill('123.4500')
  await priceCard.getByLabel('Currency').fill('EUR')
  await priceCard.getByLabel('As of').fill('2026-09-21T11:30')
  await priceCard.getByLabel('Price source').fill('Broker statement')
  await priceCard.getByLabel('Price reason').fill('Dated broker source')
  await priceCard.getByRole('button', { name: 'Save per-security price' }).click()
  await expect(priceCard).toContainText('123.4500 EUR per security')
  await expect(priceCard).toContainText('246.9000 EUR')
  await priceCard.getByRole('button', { name: 'Revoke price' }).click()
  await expect(priceCard).toContainText('Manual price revoked')

  await panel.getByRole('button', { name: 'Open', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('button', { name: 'Open' })).toBeFocused()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
  console.log('PASS: investigations open/excluded/reopen, scoped note, source-backed decimal price, broker precedence, revoke, keyboard and 390/320px layout on isolated port 4353')
} finally {
  await browser.close()
}
