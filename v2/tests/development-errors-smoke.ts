// Isolated synthetic evidence server. No broker access or private source writes.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import { SnapshotStore } from '../server/store'
import { PortfolioService } from '../server/service'
import { api, allowedRequest } from '../server/http'

const directory = mkdtempSync(join(tmpdir(), 'prism-synthetic-evidence-'))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const columnar = (productId: number | string) =>
  JSON.stringify({
    productId,
    componentsByNameMap: {
      holdings: {
        containersByNameMap: {
          all: {
            dataPointsByNameMap: {
              issueName: { value: ['Context-only source row'] },
              isin: { value: ['-'] },
              ticker: { value: ['-'] },
              exchange: { value: ['NASDAQ'] },
              countryOfRisk: { value: ['US'] },
              marketCurrencyCode: { value: ['USD'] },
              holdingPercent: { value: ['1.23456'], label: 'Weight (%)' },
              assetClass: { value: ['Equity'] },
              asOfDate: { value: '20260910' },
            },
          },
        },
      },
    },
  })
const cases = [
  {
    isin: 'IE0031442068',
    name: 'Synthetic corrupt evidence',
    file: 'IE0031442068-holdings-20260909-cli-repeat.json',
    body: columnar(251900),
    state: 'rejected',
  },
  {
    isin: 'IE00B4L5Y983',
    name: 'Synthetic wrong identity',
    file: 'IE00B4L5Y983-holdings-20260910-cli-repeat.json',
    body: columnar('WRONG_FUND'),
    state: 'rejected',
  },
  {
    isin: 'IE00B53SZB19',
    name: 'Synthetic contextual attributes',
    file: 'IE00B53SZB19-holdings-20260910-cli-repeat.json',
    body: columnar(253741),
    state: 'acquired',
  },
  {
    isin: 'IE00BYVQ9F29',
    name: 'Synthetic missing receipt',
    file: 'IE00BYVQ9F29-holdings-20260910-cli-repeat.json',
    body: columnar(304353),
    state: 'unbound',
  },
  {
    isin: 'DE000A0F5UF5',
    name: 'Synthetic unreadable evidence',
    file: 'DE000A0F5UF5-holdings-discovery-repeat-20260911.json',
    body: '{broken JSON',
    state: 'unreadable',
  },
]
for (const item of cases) writeFileSync(join(directory, item.file), item.body)
writeFileSync(
  join(directory, 'manifest-2026-09-11-expansion.json'),
  JSON.stringify({
    recorded: '2026-09-11',
    files: cases
      .filter((item) => item.state !== 'unbound')
      .map((item) => ({
        file: item.file,
        sha256: item.isin === 'IE0031442068' ? hash('other bytes') : hash(item.body),
      })),
  })
)
const store = new SnapshotStore(':memory:')
store.save({
  fetchedAt: '2026-09-12T12:00:00Z',
  positions: cases.map((item) => ({
    isin: item.isin,
    name: item.name,
    quantity: '1',
    averageBuyIn: '1',
    account: 'synthetic',
    instrumentType: 'fund',
  })),
})
const service = new PortfolioService(
  {
    authenticate: async () => {},
    restore: async () => false,
    fetch: async () => {
      throw new Error('Broker is disabled in synthetic fixture')
    },
    logout() {},
    close() {},
    warning: () => null,
  },
  store,
  directory
)
let origin = ''
const server = createServer((req, res) => {
  if (!allowedRequest(req, origin)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (req.url?.startsWith('/api/')) void api(req, res, service, origin)
  else vite.middlewares(req, res)
})
const vite = await createViteServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: { server } },
  appType: 'spa',
})
const serve = process.argv.includes('--serve')
await new Promise<void>((resolve) => server.listen(serve ? 4314 : 0, '127.0.0.1', resolve))
origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
async function close() {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await service.close()
  await vite.close()
  rmSync(directory, { recursive: true, force: true })
}
if (serve) {
  console.log(`Synthetic evidence review only: ${origin}/#development`)
  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())
} else {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const data = await (await fetch(`${origin}/api/development`)).json()
    expect(data.counts.acquiredFunds).toBe(1)
    expect(data.counts.identifiedRows).toBe(0)
    await page.goto(`${origin}/#development`)
    await expect(page.getByText('1 of 5', { exact: true })).toBeVisible()
    for (const item of cases) {
      const row = page.getByRole('row').filter({ hasText: item.isin })
      expect(
        data.funds.find((fund: { isin: string }) => fund.isin === item.isin).acquisitionState
      ).toBe(item.state)
      await row.getByRole('link', { name: 'Inspect evidence' }).click()
      await expect(page.locator('#fund-detail-title')).toHaveText(item.name)
      if (item.state !== 'acquired') {
        await expect(page.locator('.fund-detail').getByRole('alert')).toBeVisible()
        await expect(page.locator('.progress-detail-table tbody tr')).toHaveCount(0)
      } else {
        await page.getByText('Technical source details', { exact: true }).click()
        await expect(page.locator('.source-facts').getByText(/0 of 1 rows/)).toBeVisible()
        await expect(page.getByRole('cell', { name: 'NASDAQ US · USD' })).toBeVisible()
        await expect(page.getByRole('cell', { name: '1.23456%' })).toBeVisible()
      }
      await page.getByRole('link', { name: 'Back to investigation' }).click()
      await expect(page.getByRole('heading', { name: 'Development', exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
    console.log(
      'Synthetic evidence UI passed: corrupt hash, wrong fund, missing receipt, malformed JSON, context-only identifiers; real API, no private files.'
    )
  } finally {
    await browser.close()
    await close()
  }
}
