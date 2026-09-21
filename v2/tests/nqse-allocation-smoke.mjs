import { chromium, expect } from '@playwright/test'
import { Decimal } from 'decimal.js'

// Read-only browser acceptance for the NQSE allocation estimate. Use an offline copied DB.
const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4330'
const auditPath = process.argv[2]
const json = async (path) => {
  const response = await fetch(origin + path)
  expect(response.ok).toBe(true)
  return response.json()
}
const audit = auditPath ? await import(`node:fs/promises`).then(({ readFile }) => readFile(auditPath, 'utf8')).then(JSON.parse) : null
const development = await json('/api/development')
const exposure = await json('/api/exposure')
const coverage = await json('/api/coverage')
const nqseDetail = await json('/api/development/etf/IE00BYVQ9F29')
const nqse = development.funds.find((fund) => fund.isin === 'IE00BYVQ9F29')
const source = exposure.compositions.find((composition) => composition.fundIsin === nqse.isin)
const nvidia = exposure.rows.find((row) => row.isin === 'US67066G1040' && row.currency === 'EUR')
const nvidiaNqse = nvidia.contributions.find((contribution) => contribution.positionIsin === nqse.isin)
const coverageFund = coverage.funds.find((fund) => fund.isin === nqse.isin)
const nvidiaHolding = nqseDetail.rows.find((row) => row.isin === nvidia.isin)

const amundiAcquired = development.funds.find((fund) => fund.isin === 'FR0010361683')?.acquisitionState === 'acquired'
expect(development.counts).toMatchObject({ portfolioFunds: 7, acquiredFunds: amundiAcquired ? 7 : 6, qualifiedFunds: 6, usedFunds: 6 })
expect(nqse).toMatchObject({ acquisitionState: 'acquired', qualificationState: 'ready', validated: true, usedInCalculation: true, compositionDate: '2026-09-17' })
expect(source).toMatchObject({ asOf: '2026-09-17', measure: 'issuer-reported-allocation-estimate', sourceUrl: 'https://www.ishares.com/uk/individual/en/products/304353/ishares-nasdaq-100-ucits-etf' })
expect(nvidiaNqse).toMatchObject({ weightPercent: '8.42919', value: '147.9343315058641032', source: { fundIsin: nqse.isin, asOf: '2026-09-17', measure: 'issuer-reported-allocation-estimate' } })
expect(nvidiaHolding).toBeTruthy()
const qualifier = 'Underlying-weight estimate; class hedge adjustment unknown, not included in the numerical remainder.'
expect(coverageFund.reason).toContain(qualifier)
expect(coverageFund.evidenceAction).toContain('same-date attributable-underlying / class-NAV ratio')
expect(nvidiaNqse.source.estimateLimitation.qualifier).toBe(qualifier)
expect(coverageFund).toMatchObject({ state: 'included', used: true, compositionDate: '2026-09-17', rowCount: 108, values: [{ currency: 'EUR', priced: '1755.024284728', included: '1743.8216137137242304', unassigned: '11.2026710142757696' }] })
if (audit) {
  expect(exposure.coverage).toEqual(audit.afterCoverage)
  expect(nvidia.knownTotal).toBe(audit.nvidiaEUR.after)
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const errors = [], mutations = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (request.method() !== 'GET') mutations.push(request.url()) })

  await page.goto(`${origin}/#/development`)
  await expect(page.getByRole('heading', { name: 'Development', exact: true })).toBeVisible()
  const developmentRow = page.locator('.etf-matrix tbody tr').filter({ hasText: nqse.name })
  await expect(developmentRow).toContainText('Included')
  await expect(developmentRow).toContainText('Used')
  await developmentRow.getByRole('link', { name: nqse.name, exact: true }).click()
  await expect(page.locator('#fund-detail-title')).toHaveText(nqse.name)
  await expect(page.getByText('Selected issuer allocation estimates', { exact: true })).toBeVisible()
  await expect(page.locator('.fund-detail .illustrative-note')).toContainText('not NAV or full economic reconciliation')
  await expect(page.locator('.fund-detail .illustrative-note').getByText(qualifier, { exact: false })).toBeVisible()
  await page.getByLabel('Filter retained rows').fill('NVIDIA')
  const nvidiaRow = page.locator('.progress-detail-table tbody tr').filter({ hasText: nvidiaHolding.name })
  await expect(nvidiaRow).toContainText('Included')
  await expect(nvidiaRow).toContainText('147.93 EUR')
  await nvidiaRow.getByRole('link', { name: nvidiaHolding.name, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Security detail', exact: true })).toBeFocused()
  await expect(page.locator('.company-card > summary')).toContainText(`${new Decimal(nvidia.knownTotal).toFixed(2)} EUR`)
  await expect(page.locator('.company-card')).toContainText(nqse.isin)
  await expect(page.locator('.company-card')).toContainText('8.42919%')
  await expect(page.locator('.company-card td[data-label="Known value"]').getByText(qualifier, { exact: true })).toBeVisible()

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${origin}/#/breakdown`)
  await page.getByLabel('Find a security or ISIN').fill('NVIDIA')
  await expect(page.locator('.company-card > summary')).toContainText(`${new Decimal(nvidia.knownTotal).toFixed(2)} EUR`)
  await page.getByText(/^Portfolio-wide coverage gaps/).click()
  await page.locator('.company-card > summary').click()
  await expect(page.locator('.company-card td[data-label="Known value"]').getByText(qualifier, { exact: true })).toBeVisible()
  await expect(page.getByText(/not exposure to the selected security/)).toBeVisible()
  expect(errors).toEqual([])
  expect(mutations).toEqual([])
  console.log('NQSE allocation browser acceptance passed: selected source, exact contribution provenance, residual/source/date visibility, Breakdown, responsive layout, no mutations or page errors.')
} finally {
  await browser.close()
}
