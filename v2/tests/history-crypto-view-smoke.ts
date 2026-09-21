// Saved synthetic checkpoint regression. No backend, credentials or financial record writes.
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { syntheticCheckpointDetail } from './fixtures/history-contract'

const server = await createServer({ server: { host: '127.0.0.1', port: 4352, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const old = structuredClone(syntheticCheckpointDetail)
  const current = structuredClone(syntheticCheckpointDetail)
  current.checkpoint.currencies = [{ ...current.checkpoint.currencies[0], pricedSecurities: '1000',
    includedSecurityValue: '800', nonCompanyValue: '50', unassignedValue: '150', coveragePercent: '80', allocationState: 'partial' }]
  const originals = JSON.stringify([old, current])
  let crypto = false
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    requests.push(`${route.request().method()} ${url.pathname}`)
    if (url.pathname.includes('/history/checkpoints/')) return route.fulfill({ json: crypto ? current : old })
    if (url.pathname === '/api/status') return route.fulfill({ json: { phase: 'disconnected', snapshot: null } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } })
  })
  mkdirSync('test-results/history-crypto', { recursive: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (crypto of [false, true]) {
      await page.goto('http://127.0.0.1:4352/#/history?checkpoint=synthetic-checkpoint-1')
      await page.reload()
      const summary = page.getByRole('region', { name: 'Saved checkpoint coverage' })
      const card = page.getByRole('region', { name: 'EUR saved allocation' })
      const bar = card.getByRole('img')
      await expect(summary).toBeVisible()
      await expect(bar.locator(':scope > span')).toHaveCount(crypto ? 2 : 1)
      if (crypto) {
        await expect(bar).toHaveAccessibleName('EUR saved priced assets: 1,000.00 EUR; included securities 800.00 EUR (80.00%); non-company crypto 50.00 EUR; unassigned 150.00 EUR. Excludes unvalued positions and cash.')
        await expect(bar.locator(':scope > span').nth(0)).toHaveAttribute('style', /width: 80%/)
        await expect(bar.locator(':scope > span').nth(1)).toHaveAttribute('style', /width: 5%/)
        await expect(summary).toContainText('Non-company crypto is included in priced assets, separately from included-security allocation.')
        await expect(card).toContainText('Unassigned 150.00 EUR · Non-company 50.00 EUR')
      } else {
        await expect(card.getByRole('heading')).toHaveText('EUR · Priced-securities allocation')
        await expect(bar).toHaveAccessibleName(/EUR priced-securities allocation: 100.00%/)
        await expect(summary).not.toContainText('Non-company crypto is included')
      }
      await expect(summary).toContainText('The priced denominator excludes cash and unvalued positions.')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: `test-results/history-crypto/${crypto ? 'crypto' : 'legacy'}-${width}.png`, fullPage: true })
    }
  }
  expect(errors).toEqual([])
  expect(requests.every(request => request.startsWith('GET '))).toBe(true)
  expect(requests.some(request => /refresh|login|continue|financial/.test(request))).toBe(false)
  expect(JSON.stringify([old, current])).toBe(originals)
  writeFileSync('test-results/history-crypto/result.json', JSON.stringify({ passed: true, widths: [390, 320], cases: ['legacy', 'non-company'], errors, requests }, null, 2))
  console.log('PASS: saved old/new checkpoint segments, amounts, scope labels, 390/320px, no live financial reads or writes.')
} finally { await browser.close(); await server.close() }
