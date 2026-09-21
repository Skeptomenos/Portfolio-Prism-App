import { chromium, expect, type Browser } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { serveExample } from './host'
const demo = await serveExample()
let browser: Browser | undefined
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors: string[] = [], writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(request.method()) })
  await page.goto(demo.url)
  await expect(page.getByRole('heading', { name: 'Saved source contributions' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Portfolio coverage' })).toContainText('1 positions unvalued')
  await expect(page.getByText('Supported value: 601.23456789012345678 EUR', { exact: true })).toBeVisible()
  await expect(page.getByText('Supported value: 398.76543210987654322 EUR', { exact: true })).toBeVisible()
  await expect(page.getByText(/Source date: 2026-09-20/)).toBeVisible()
  await page.getByText('Source evidence', { exact: true }).click()
  await expect(page.getByText(/Source hash:/)).toContainText(demo.store.selectedCompositions()[0].sha256)
  await page.reload(); await expect(page.getByText(/Supported value: 601/)).toBeVisible()
  for (const failure of [{ status: 503, json: {} }, { json: { contractVersion: 'wrong/1' } }]) {
    await page.route('**/api/financial/analysis', route => route.fulfill(failure))
    await page.getByRole('button', { name: 'Reload saved figures' }).click()
    await expect(page.getByRole('alert')).toContainText('Source panel could not load')
    await expect(page.getByText(/Supported value: 601/)).toBeVisible()
    await page.unroute('**/api/financial/analysis')
    await page.getByRole('button', { name: 'Reload saved figures' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
  mkdirSync('test-results/sdk-example', { recursive: true })
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const button = page.getByRole('button', { name: 'Reload saved figures' }); await button.focus(); await page.keyboard.press('Enter')
    await expect(page.getByText(/Supported value: 601/)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/sdk-example/${width}.png`, fullPage: true })
  }
  expect(errors).toEqual([]); expect(writes).toEqual([])
  console.log('PASS: synthetic acquisition → admission → SQLite → reopen → public financial read → registered panel; exact amounts, gaps, provenance, reload, keyboard, narrow layout, failure/version recovery; no API writes.')
} finally { await browser?.close(); await demo.close() }
