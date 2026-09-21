import { financialFulfill } from './fixtures/financial-wire.mjs'
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { Decimal } from 'decimal.js'
const origin = process.env.PRISM_V2_URL ?? 'http://127.0.0.1:4311'
const real = process.env.PRISM_V2_REAL === '1'
const browser = await chromium.launch({ headless: true })
mkdirSync('v2/test-results', { recursive: true, mode: 0o700 })
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const initial = real
    ? await (await fetch(`${origin}/api/exposure`)).json()
    : {
        pilotOwned: true,
        refreshing: false,
        composition: {
          fundIsin: 'IE0031442068',
          fundName: 'Synthetic pilot fund',
          sourceUrl: 'https://www.justetf.com/en/etf-profile.html?isin=IE0031442068',
          termsUrl: 'https://www.justetf.com/documents/justETF_general_terms_and_conditions.pdf',
        },
      }
  expect(initial.composition?.fundIsin).toBe('IE0031442068')
  let failPoll = false
  let response = initial
  if (!real)
    await page.route('**/api/financial/exposure', (route) =>
      failPoll ? financialFulfill(route, { status: 503, json: {} }) : financialFulfill(route, { json: response })
    )
  if (!real) {
    await page.route('**/api/financial/coverage', route => financialFulfill(route, { json: null }))
    // Do not record private broker data in synthetic screenshots.
    response = {
      ...initial,
      holdingsAt: '2026-09-07T12:00:00Z',
      gaps: [
        {
          name: 'Other ETF',
          isin: 'IE00B4L5Y983',
          currency: 'EUR',
          value: '900',
          reason: 'No supported company composition or identity',
        },
      ],
      missingValuations: 1,
      composition: {
        ...initial.composition,
        sha256: 'synthetic',
        asOf: '2026-07-01',
        retrievedAt: '2026-09-07T12:00:00Z',
        disclosedPercent: '10',
        identifiedPercent: '10',
        missingPercent: '90',
        rows: [],
      },
      coverage: [
        {
          currency: 'EUR',
          pricedSecurities: '2000',
          knownCompanyValue: '1100',
          unresolvedValue: '900',
          knownPercent: '55',
        },
      ],
      rows: [
        {
          name: 'Example Company',
          isin: 'US67066G1040',
          currency: 'EUR',
          knownTotal: '110',
          direct: '100',
          indirect: '10',
          percentOfPriced: '5.5',
          contributions: [
            {
              kind: 'direct',
              positionIsin: 'US67066G1040',
              account: 'test',
              positionValue: '100',
              value: '100',
              weightPercent: '100',
              quoteAt: '2026-09-07T11:00:00Z',
              quality: 'Synthetic quote',
            },
            {
              kind: 'etf',
              positionIsin: 'IE0031442068',
              account: 'test',
              positionValue: '1000',
              value: '10',
              weightPercent: '1',
              quoteAt: '2026-09-07T11:00:00Z',
              quality: 'Synthetic quote',
            },
          ],
        },
      ],
      attempt: {
        id: 'synthetic-success',
        status: 'success',
        at: '2026-09-07T12:00:00Z',
        code: null,
      },
      stale: true,
      refreshFailed: false,
    }
    await page.route('**/api/status', (r) =>
      financialFulfill(r, {
        json: {
          phase: 'disconnected',
          snapshot: null,
          error: null,
          lastDiagnostic: null,
          lastAttemptAt: null,
          sessionWarning: null,
        },
      })
    )
    await page.route('**/api/financial/overview', (r) =>
      financialFulfill(r, {
        json: {
          rows: [],
          totals: [],
          pricedCount: 0,
          zeroCount: 0,
          missingCount: 0,
          holdingsAt: null,
          quoteRetrievedAt: null,
        },
      })
    )
    await page.route('**/api/data', (r) => financialFulfill(r, { json: { sources: [] } }))
  }
  await page.goto(`${origin}#breakdown`)
  const section = page.locator('.company-exposure')
  await expect(section.getByRole('heading', { name: 'Known security exposure' })).toBeVisible()
  await expect(section.getByText(/Stale composition/)).toBeVisible()
  const company = response.rows.find(
    (c) =>
      c.contributions.some((r) => r.kind === 'direct' && r.value !== null) &&
      c.contributions.some((r) => r.kind === 'etf' && r.value !== null)
  )
  expect(company).toBeTruthy()
  await section.getByRole('searchbox').fill(company.isin)
  await expect(section.locator('.company-card')).toHaveCount(1)
  const card = section.locator('.company-card')
  await card.locator(':scope > summary').focus()
  await page.keyboard.press('Enter')
  await expect(card).toHaveAttribute('open', '')
  const money = (v) => `${new Decimal(v).toFixed(2)} ${company.currency}`
  await expect(
    card.getByText(
      `Known direct: ${money(company.direct)} · Known indirect: ${money(company.indirect)}`
    )
  ).toBeVisible()
  await expect(card.getByText(/Direct shares/)).toBeVisible()
  await expect(card.locator('a[href*="/fund/IE0031442068"]')).toBeVisible()
  await expect(
    section.getByRole('link', { name: 'Source: justETF top ten holdings' })
  ).toHaveAttribute('href', initial.composition.sourceUrl)
  await section.getByText(/Portfolio-wide coverage gaps \(/).click()
  await expect(
    section.getByText(/No supported company composition or identity/).first()
  ).toBeVisible()
  if (!real) {
    await page.route('**/api/composition/refresh', async (r) => {
      expect(r.request().headers()['x-prism-client']).toBe('1')
      response = {
        ...response,
        refreshFailed: true,
        attempt: {
          at: '2026-09-07T12:01:00Z',
          id: 'failure-reference',
          status: 'failed',
          code: 'http',
        },
      }
      await financialFulfill(r, { status: 202, json: { accepted: true } })
    })
    await section.getByRole('button', { name: 'Refresh ETF composition' }).click()
    await expect(section.getByText(/Last successful composition retained/)).toBeVisible()
    await expect(
      card.getByText(/Known direct: 100.00 EUR · Known indirect: 10.00 EUR/)
    ).toBeVisible()
    failPoll = true
    await expect(section.getByText(/Cannot refresh company exposure/)).toBeVisible()
    failPoll = false
    await expect(section.getByText(/Cannot refresh company exposure/)).toHaveCount(0)
  } else {
    const previousId = initial.attempt?.id
    await section.getByRole('button', { name: 'Refresh ETF composition' }).click()
    await expect
      .poll(
        async () => {
          const current = await (await fetch(`${origin}/api/exposure`)).json()
          return current.attempt?.id !== previousId && !current.refreshing
            ? current.attempt?.status
            : 'waiting'
        },
        { timeout: 25000 }
      )
      .toBe('success')
    await expect(
      card.getByText(
        `Known direct: ${money(company.direct)} · Known indirect: ${money(company.indirect)}`
      )
    ).toBeVisible()
  }
  await section.screenshot({
    path: `v2/test-results/exposure-${real ? 'private-real' : 'synthetic'}-desktop.png`,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await section.screenshot({
    path: `v2/test-results/exposure-${real ? 'private-real' : 'synthetic'}-mobile.png`,
  })
  if (!real) {
    response = {
      ...response,
      refreshFailed: false,
      composition: {
        ...response.composition,
        scope: 'full-holdings',
        measure: 'issuer-reported-allocation-estimate',
        sourceUrl:
          'https://www.ishares.com/uk/individual/en/products/251900/ishares-sp-500-ucits-etf-inc-fund',
        sourceChecks: [
          {
            id: 'local-use',
            state: 'pending',
            detail: 'Synthetic private-use review is unsettled.',
            evidence: [],
          },
        ],
        sourceAccounting: {
          sourceRows: 12,
          equityRows: 10,
          nonEquityRows: 2,
          unresolvedEquityRows: 0,
          reportedPercent: '100.00005',
          nonEquityPercent: '0.2',
          byAssetClass: [
            { assetClass: 'Equity', rows: 10, weightPercent: '99.80005' },
            { assetClass: 'Cash', rows: 1, weightPercent: '0.1' },
            { assetClass: 'Futures', rows: 1, weightPercent: '0.1' },
          ],
        },
      },
    }
    await expect(
      section.getByRole('link', { name: 'Source: issuer full-holdings dataset', exact: true })
    ).toHaveAttribute('href', response.composition.sourceUrl)
    await expect(
      section.getByText('Exact ISIN · issuer allocation estimate', { exact: true })
    ).toBeVisible()
    await expect(
      section.getByText(/not exact accounting-NAV or economic reconciliation/)
    ).toBeVisible()
    await expect(section.locator('.source-local-use')).toContainText(
      'pending: Synthetic private-use review is unsettled.'
    )
    await expect(section.locator('.source-accounting')).toContainText(
      '12 rows · 10 equity · 2 non-equity'
    )
    await section.getByText('Reported asset classes', { exact: true }).click()
    await expect(
      section.getByText('Futures: 1 rows · 0.1% reported weight', { exact: true })
    ).toBeVisible()
    await expect(section.getByRole('button', { name: /Refresh/ })).toHaveCount(0)
    await expect(
      section.getByText(
        /justETF top ten holdings|one partial iShares pilot|Exact ISIN · partial pilot/
      )
    ).toHaveCount(0)
    await expect(
      card.getByText(/Known direct: 100.00 EUR · Known indirect: 10.00 EUR/)
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await section.screenshot({ path: 'v2/test-results/exposure-full-source-synthetic-mobile.png' })
    // Missing operational evidence is unknown, not silently treated as permission.
    response = { ...response, composition: { ...response.composition, sourceChecks: undefined } }
    await expect(section.locator('.source-local-use')).toContainText(
      'not recorded: No local-use finding supplied.'
    )
  }
  expect(errors).toEqual([])
  console.log(
    `Exposure UI passed (${real ? 'real saved portfolio' : 'synthetic failure/recovery'}): contribution arithmetic, source/date, keyboard disclosure, gaps, mobile overflow, no page errors.`
  )
} finally {
  await browser.close()
}
