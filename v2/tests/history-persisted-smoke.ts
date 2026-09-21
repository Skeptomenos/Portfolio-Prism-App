// Read-only browser verification against an explicitly provided copied-data service.
// This script never logs in, refreshes, migrates or writes to the backend.
import { chromium, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHistoryClient } from '../web/views/history-client'
import { coverageMoney, coveragePercent } from '../web/CoverageSummary'

const origin = process.env.PRISM_V2_URL
if (!origin) throw new Error('Set PRISM_V2_URL to the isolated copied-data service.')
const url = new URL(origin)
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port === '4336')
  throw new Error('Use a separate loopback port; port 4336 is the primary live service.')
const client = createHistoryClient((input, options) => fetch(new URL(String(input), origin), options))
const signal = new AbortController().signal
const pageData = await client.runs(null, signal)
const requestedId = process.env.PRISM_HISTORY_CHECKPOINT
const requested = requestedId ? await client.checkpoint(requestedId, signal) : null
const runSummary = requested ? { id: requested.checkpoint.runId } : pageData.items.find(run => run.checkpointCount > 0 && run.latestCheckpoint)
if (!runSummary) throw new Error('Copied fixture has no checkpoint; real-data acceptance remains open.')
const run = await client.run(runSummary.id, signal)
const checkpointId = requestedId ?? run.checkpoints[0]?.id
if (!checkpointId) throw new Error('Copied operation has no committed checkpoint.')
const saved = await client.checkpoint(checkpointId, signal)
const evidence = mkdtempSync(join(tmpdir(), 'prism-history-browser-'))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' })
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.method()) })
  if (requestedId) await page.goto(`${origin}#/history?run=${encodeURIComponent(runSummary.id)}`)
  else {
    await page.goto(`${origin}#/history`)
    await page.locator(`a[href="#/history?run=${encodeURIComponent(runSummary.id)}"]`).click()
  }
  await page.locator(`a[href="#/history?checkpoint=${encodeURIComponent(checkpointId)}"]`).click()
  const summary = page.getByRole('region', { name: 'Saved checkpoint coverage' })
  await expect(summary).toContainText(saved.checkpoint.recordedAt)
  await expect(summary).toContainText(`${saved.checkpoint.pricedPositionCount} priced · ${saved.checkpoint.unvaluedPositionCount} unvalued`)
  for (const currency of saved.checkpoint.currencies) {
    const card = page.getByRole('region', { name: `${currency.currency} saved allocation` })
    await expect(card.getByText(`${coveragePercent(currency.coveragePercent)} · ${currency.allocationState}`, { exact: true })).toBeVisible()
    if (['allocated', 'partial'].includes(currency.allocationState) && currency.coveragePercent !== null)
      await expect(card.getByRole('img')).toHaveAccessibleName(`${currency.currency} priced-securities allocation: ${coveragePercent(currency.coveragePercent)}; unassigned ${coverageMoney(currency.unassignedValue, currency.currency)}. Excludes unvalued positions and cash.`)
    await expect(card.getByText(`Included ${coverageMoney(currency.includedSecurityValue, currency.currency)} / priced ${coverageMoney(currency.pricedSecurities, currency.currency)}`, { exact: true })).toBeVisible()
    await expect(card).toContainText(currency.cashValue === null ? 'Separate cash: Unknown' : `Separate cash: ${coverageMoney(currency.cashValue, currency.currency)}`)
    const exact = card.locator('.history-exact-values')
    await exact.locator('summary').click()
    for (const value of [currency.includedSecurityValue, currency.pricedSecurities, currency.unassignedValue, currency.coveragePercent, currency.cashValue])
      if (value !== null) await expect(exact).toContainText(value)
    await exact.locator('summary').click()
  }
  await expect(page.locator('.history-position')).toHaveCount(saved.positions.length)
  for (let index = 0; index < saved.positions.length; index++) {
    const position = saved.positions[index]
    const row = page.locator('.history-position').nth(index)
    await expect(row).toContainText(position.isin)
    await expect(row.locator('dd').first()).toHaveText(position.quantity)
    await expect(row.locator('dd').nth(1)).toHaveText(position.value === null ? 'Unknown' : coverageMoney(position.value, position.currency ?? '(currency unknown)'))
    const exact = row.locator('.history-exact-values')
    await exact.locator('summary').click()
    for (const value of [position.quantity, position.value, position.unitPrice]) if (value !== null) await expect(exact).toContainText(value)
    await exact.locator('summary').click()
  }
  await expect(page.locator('.history-evidence')).toContainText(`Replay ${saved.replay.state}`)
  if (saved.inputs.length) {
    const source = page.locator('.history-evidence details').first()
    await source.locator('summary').click()
    await expect(source).toContainText(saved.inputs[0].id)
  }
  await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: join(evidence, 'history-desktop.png'), fullPage: true })
  await page.reload(); await expect(summary).toContainText(saved.checkpoint.recordedAt)
  await page.goBack(); await expect(page.getByRole('heading', { name: `Operation · ${run.run.status}` })).toBeVisible()
  await page.goForward(); await expect(summary).toContainText(saved.checkpoint.recordedAt)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(summary.getByText(`${saved.checkpoint.pricedPositionCount} priced · ${saved.checkpoint.unvaluedPositionCount} unvalued · ${saved.checkpoint.zeroPositionCount} zero positions`)).toBeInViewport({ ratio: 1 })
    if (saved.checkpoint.currencies[0]) {
      const currency = saved.checkpoint.currencies[0]
      await expect(summary.getByText(`Included ${coverageMoney(currency.includedSecurityValue, currency.currency)} / priced ${coverageMoney(currency.pricedSecurities, currency.currency)}`, { exact: true })).toBeInViewport({ ratio: 1 })
    }
    await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: join(evidence, `history-${width}.png`), fullPage: true })
    await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: join(evidence, `history-${width}-viewport.png`) })
  }
  // Provider-plus-panel proof uses the accepted saved inspection when present.
  const inspectionResponse = await fetch(`${origin}/api/development/etf/FR0010361683`)
  const inspection = inspectionResponse.ok ? await inspectionResponse.json() : null
  let inspectionChecked = false
  if (inspection?.inspection) {
    await page.goto(`${origin}#/amundi-inspection`)
    await expect(page.getByRole('heading', { name: 'Amundi saved source inspection' })).toBeVisible()
    await expect(page.getByText(`${inspection.inspection.reportedRowCount} substitute-basket rows · ${inspection.inspection.benchmarkRowCount} partial benchmark rows`)).toBeVisible()
    await expect(page.locator('.history-view')).toContainText(`Composition: ${inspection.compositionDate ?? 'Unknown'}`)
    await expect(page.locator('.history-position')).toHaveCount(inspection.rows.length)
    await expect(page.locator('a[href*="/security/"]')).toHaveCount(0)
    await page.getByText('Source reference', { exact: true }).click()
    await expect(page.locator('.history-view')).toContainText(inspection.evidence.sha256)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.route-content')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: join(evidence, 'amundi-source-320.png'), fullPage: true })
    inspectionChecked = true
  } else if (process.env.PRISM_REQUIRE_AMUNDI === '1') throw new Error('Accepted Amundi inspection missing from copied fixture.')
  expect(await client.checkpoint(checkpointId, signal)).toEqual(saved)
  expect(writes).toEqual([]); expect(errors).toEqual([])
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ kind: 'real-persisted-read-only', origin, passed: true, runId: runSummary.id, checkpointId,
    inspectionChecked, positionCount: saved.positions.length, currencyCount: saved.checkpoint.currencies.length, replay: saved.replay.state,
    limits: ['Does not perform sync or restart; combined H1 acceptance remains separate.'] }, null, 2), { mode: 0o600 })
  console.log(`PASS: persisted history values, quantities, cash, sources, URL/back/reload and 390/320px. Private evidence: ${evidence}`)
} finally { await browser.close() }
