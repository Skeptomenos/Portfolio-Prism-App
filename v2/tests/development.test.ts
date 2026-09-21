import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { developmentProgress } from '../server/development'
import type { Snapshot } from '../server/model'

const snapshot: Snapshot = {
  fetchedAt: '2026-09-12T12:00:00Z',
  positions: [
    {
      account: 'main',
      isin: 'IE0031442068',
      name: 'iShares S&P 500 UCITS ETF',
      quantity: '2',
      instrumentType: 'fund',
      averageBuyIn: '100',
    },
    {
      account: 'main',
      isin: 'FR0010361683',
      name: 'Amundi ETF',
      quantity: '3',
      instrumentType: 'fund',
      averageBuyIn: '50',
    },
  ],
}

function writeColumnarEvidence(directory: string): string {
  const fileName = 'IE0031442068-holdings-20260909-cli-repeat.json'
  const value = {
    productId: 251900,
    componentsByNameMap: {
      holdings: {
        containersByNameMap: {
          all: {
            dataPointsByNameMap: {
              asOfDate: { value: '20260909' },
              issueName: { value: ['Example Corp', 'Example Cash'] },
              isin: { value: ['US0378331005', '-'] },
              ticker: { value: ['EXM', 'CASH'] },
              holdingPercent: { value: ['5.25', '0.10'] },
              assetClass: { value: ['Equity', 'Cash'] },
              marketCurrencyCode: { value: ['USD', 'USD'] },
              exchange: { value: ['XNAS', '-'] },
              countryOfRisk: { value: ['US', '-'] },
            },
          },
        },
      },
    },
  }
  const bytes = Buffer.from(JSON.stringify(value))
  writeFileSync(join(directory, fileName), bytes)
  writeFileSync(
    join(directory, 'manifest-2026-09-11-expansion.json'),
    JSON.stringify({
      recorded: '2026-09-11T12:00:00Z',
      files: [
        {
          file: fileName,
          bytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    })
  )
  return fileName
}

describe('development evidence register', () => {
  const progressAt = (directory: string) =>
    developmentProgress(snapshot, [], null, null, directory, 'disconnected')
  function replaceEvidence(directory: string, name: string, body: string) {
    writeFileSync(join(directory, name), body)
    writeFileSync(
      join(directory, 'manifest-2026-09-11-expansion.json'),
      JSON.stringify({
        recorded: '2026-09-11',
        files: [{ file: name, sha256: createHash('sha256').update(body).digest('hex') }],
      })
    )
  }
  it.each([
    ['hash mismatch', 'rejected'],
    ['malformed JSON', 'unreadable'],
    ['wrong product', 'rejected'],
    ['missing manifest', 'unbound'],
    ['conflicting manifest', 'rejected'],
    ['missing product', 'unbound'],
  ])('does not count %s as acquired evidence', (problem, state) => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-rejected-'))
    try {
      const name = writeColumnarEvidence(directory)
      const payload = JSON.parse(readFileSync(join(directory, name), 'utf8'))
      if (problem === 'hash mismatch') writeFileSync(join(directory, name), '{}')
      if (problem === 'malformed JSON') replaceEvidence(directory, name, '{broken')
      if (problem === 'wrong product')
        replaceEvidence(directory, name, JSON.stringify({ ...payload, productId: 'WRONG_FUND' }))
      if (problem === 'missing product') {
        delete payload.productId
        replaceEvidence(directory, name, JSON.stringify(payload))
      }
      if (problem === 'missing manifest')
        rmSync(join(directory, 'manifest-2026-09-11-expansion.json'))
      if (problem === 'conflicting manifest')
        writeFileSync(
          join(directory, 'manifest-2026-09-11.json'),
          JSON.stringify({ files: [{ file: name, sha256: 'conflict' }] })
        )
      const progress = progressAt(directory)
      expect(progress.counts.acquiredFunds).toBe(0)
      expect(progress.funds[0].acquisitionState).toBe(state)
      expect(progress.funds[0].evidence.error).toBeTruthy()
      expect(progress.funds[0].evidence.rowCount).toBeNull()
      expect(progress.funds[0].compositionDate).toBeNull()
      if (problem === 'conflicting manifest')
        expect(progress.evidence.diagnostics[0]).toContain('Conflicting')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not count country/exchange-only rows and keeps verification outside composition range', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-identifiers-'))
    try {
      const name = writeColumnarEvidence(directory)
      const payload = JSON.parse(readFileSync(join(directory, name), 'utf8'))
      const points =
        payload.componentsByNameMap.holdings.containersByNameMap.all.dataPointsByNameMap
      points.isin.value = ['-', 'invalid']
      points.ticker.value = ['-', '-']
      points.exchange.value = ['XNAS', 'XLON']
      points.countryOfRisk.value = ['US', 'UK']
      replaceEvidence(directory, name, JSON.stringify(payload))
      const progress = progressAt(directory)
      expect(progress.counts.identifiedRows).toBe(0)
      expect(progress.sourceFreshness.asOfRange).toEqual({
        earliest: '2026-09-09',
        latest: '2026-09-09',
      })
      expect(progress.sourceFreshness.lastVerifiedAt).toBe('2026-09-11')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('binds BOM-prefixed legacy rows only through a verified companion receipt', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-legacy-'))
    const name = 'DE000A0F5UF5-holdings-discovery-repeat-20260911.json'
    try {
      const body =
        '\uFEFF' +
        JSON.stringify({
          aaData: [
            [
              'AAPL',
              'Apple',
              'IT',
              'Equity',
              0,
              { raw: '1.23456789' },
              0,
              0,
              'US0378331005',
              0,
              'US',
              'NASDAQ',
              'USD',
            ],
          ],
        })
      const sha = createHash('sha256').update(body).digest('hex')
      const receipt = JSON.stringify({
        url: 'https://www.ishares.com/de/produkte/251896/fund/holdings.ajax',
        sha256: sha,
        status: 200,
        bytes: Buffer.byteLength(body),
      })
      writeFileSync(join(directory, name), body)
      writeFileSync(join(directory, name + '.receipt.json'), receipt)
      writeFileSync(
        join(directory, 'manifest-2026-09-11-expansion.json'),
        JSON.stringify({
          files: [
            { file: name, sha256: sha },
            {
              file: name + '.receipt.json',
              sha256: createHash('sha256').update(receipt).digest('hex'),
            },
          ],
        })
      )
      const saved = { ...snapshot, positions: [{ ...snapshot.positions[0], isin: 'DE000A0F5UF5' }] }
      const read = () => developmentProgress(saved, [], null, null, directory, 'disconnected')
      expect(read().funds[0]).toMatchObject({
        acquisitionState: 'acquired',
        evidence: { identityVerified: true, rowCount: 1 },
      })
      writeFileSync(join(directory, name + '.receipt.json'), receipt.replace('251896', '999999'))
      expect(read().funds[0].acquisitionState).toBe('rejected')
      expect(read().counts.acquiredFunds).toBe(0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('separates acquired rows from qualification and calculation admission', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-development-'))
    try {
      const fileName = writeColumnarEvidence(directory)
      const progress = developmentProgress(
        snapshot,
        [],
        null,
        null,
        directory,
        'disconnected',
        Date.parse('2026-09-12T13:00:00Z')
      )
      const acquired = progress.funds.find((fund) => fund.isin === 'IE0031442068')
      const missing = progress.funds.find((fund) => fund.isin === 'FR0010361683')
      expect(progress.evidence.manifestFiles).toBe(1)
      expect(progress.counts).toMatchObject({
        portfolioFunds: 2,
        acquiredFunds: 1,
        qualifiedFunds: 0,
        usedFunds: 0,
        acquiredRows: 2,
        identifiedRows: 2,
      })
      expect(acquired).toMatchObject({
        acquisitionState: 'acquired',
        validated: false,
        usedInCalculation: false,
        evidence: {
          fileName,
          rowCount: 2,
          equityRowCount: 1,
          identifierRowCount: 2,
          weightRowCount: 2,
          manifestVerified: true,
          compositionDate: '2026-09-09',
        },
      })
      expect(missing).toMatchObject({
        acquisitionState: 'missing',
        validated: false,
        usedInCalculation: false,
        evidence: { rowCount: null },
      })
      expect(progress.stages.find((stage) => stage.id === 'qualification')?.state).toBe('open')
      expect(progress.stages.find((stage) => stage.id === 'identity')).toMatchObject({ state: 'open', summary: expect.stringContaining('Alphabet Class A and Class C') })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
