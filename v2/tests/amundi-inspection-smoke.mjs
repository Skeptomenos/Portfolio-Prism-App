import { chromium, expect } from '@playwright/test'
import { Decimal } from 'decimal.js'

const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4320'
const isin = 'FR0010361683'
const overviewResponse = await fetch(`${origin}/api/development`)
if (!overviewResponse.ok) throw new Error(`Development API returned ${overviewResponse.status}`)
const overview = await overviewResponse.json()
const fund = overview.funds.find((candidate) => candidate.isin === isin)
expect(fund).toBeTruthy()
const basketCount = fund.inspection?.reportedRowCount
const benchmarkCount = fund.inspection?.benchmarkRowCount
expect(Number.isSafeInteger(basketCount) && basketCount > 0).toBe(true)
expect(Number.isSafeInteger(benchmarkCount) && benchmarkCount > 0).toBe(true)
expect(fund.evidence.rowCount).toBe(basketCount)
expect(fund.evidence.weightUnit).toBe('fraction')
expect(fund.compositionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
expect(fund.usedInCalculation).toBe(false)

const detailResponse = await fetch(`${origin}/api/development/etf/${isin}`)
if (!detailResponse.ok) throw new Error(`Amundi detail API returned ${detailResponse.status}`)
const detail = await detailResponse.json()
expect(detail.rows.filter((row) => row.sourceScope === 'substitute-basket')).toHaveLength(basketCount)
expect(detail.rows.filter((row) => row.sourceScope === 'partial-benchmark')).toHaveLength(benchmarkCount)
expect(detail.illustrative).toBeUndefined()
const portfolio = await (await fetch(`${origin}/api/overview`)).json()
const positions = portfolio.rows.filter(row => row.isin === isin)
expect(positions.length).toBeGreaterThan(0)
expect(positions.every(row => row.valuationStatus === 'priced')).toBe(true)
const savedValue = positions.reduce((sum, row) => sum.add(row.value), new Decimal(0))
expect(detail.valuation.positionValue).toBe(savedValue.toFixed())
expect(detail.valuation.accountCount).toBe(positions.length)
expect(detail.valuation.quoteDates).toEqual([...new Set(positions.map(row => row.quoteAt))].sort())

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${origin}#/fund/${isin}`)
  await expect(page.locator('#fund-detail-title')).toHaveText(fund.name)
  await expect(page.getByText(`${savedValue.toFixed(2)} ${detail.valuation.currency}`, { exact: true })).toBeVisible()
  await expect(page.getByText('Combined value unavailable', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Inspection only/).first()).toBeVisible()
  await expect(page.getByText(`${basketCount} substitute-basket rows`, { exact: false })).toBeVisible()
  await expect(page.getByText(`${benchmarkCount} partial benchmark rows`, { exact: false })).toBeVisible()
  await expect(page.getByText('Partial INDEX_TOP10 benchmark').first()).toBeVisible()
  await expect(page.locator('a[href*="/security/"]')).toHaveCount(0)
  await expect(page.getByText('Illustrative value using reported weight', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Saved ETF value ×|Preview arithmetic uses/)).toHaveCount(0)
  await expect(page.locator('.fund-next-step')).toContainText('Basket weights and partial benchmark rows alone cannot support monetary exposure')
  await expect(page.locator('.fund-next-step')).not.toContainText('then connect compatible rows')
  await page.getByText('Technical source details', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Checking basket weights or partial benchmark rows alone cannot establish monetary exposure/)).toBeVisible()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByText(/Inspection only/).first()).toBeVisible()
    await expect(page.getByText(`${savedValue.toFixed(2)} ${detail.valuation.currency}`, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: 'test-results/amundi-inspection-review.png', fullPage: true })
  expect(errors).toEqual([])
  console.log('Amundi inspection UI passed: direct source scope, fraction weights, gaps and no economic links.')
} finally {
  await browser.close()
}
