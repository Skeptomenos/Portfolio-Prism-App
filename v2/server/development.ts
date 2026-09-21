import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validIsin } from './composition'
import type { Composition, CompositionAttempt } from './composition'
import type { DataSource } from './explorer'
import type { Position, Snapshot } from './model'
import type { FundValuation, IllustrativeValues } from './illustrative-values'
import type { InspectionObservation, InspectionRow } from './composition-inspection'

type JsonRecord = Record<string, unknown>

export type ProgressState = 'ready' | 'open' | 'blocked' | 'unavailable' | 'not-admitted'

export interface ConstituentObservation {
  row: number
  name: string
  isin: string | null
  ticker: string | null
  weightPercent: string | null
  weight?: string | null
  weightUnit?: 'percent' | 'fraction' | null
  sourceScope?: 'economic-allocation' | 'substitute-basket' | 'partial-benchmark' | null
  quantity?: string | null
  sector?: string | null
  securityType: string | null
  currency: string | null
  exchange: string | null
  country: string | null
  availableIdentifiers: string[]
}

export interface FundEvidenceSummary {
  fileName: string | null
  format: string | null
  bytes: number | null
  sha256: string | null
  manifestVerified: boolean
  identityVerified?: boolean
  weightUnit?: 'percent' | 'fraction' | null
  denominator?: string
  sourceUrl: string | null
  compositionDate: string | null
  lastVerifiedAt: string | null
  rowCount: number | null
  equityRowCount: number | null
  identifierRowCount: number | null
  isinRowCount?: number | null
  tickerRowCount?: number | null
  weightRowCount: number | null
  nonEquityRowCount: number | null
  error: string | null
}

export interface InspectionSummary {
  reportedRowCount: number
  benchmarkRowCount: number
  responseSha256: string
  requestSha256: string
  replicationMethod: string | null
  benchmarkName: string | null
  benchmarkTicker: string | null
  swapCounterparties: string | null
  sourceLimits: { id: string; detail: string }[]
}

export interface DevelopmentFund {
  isin: string
  name: string
  provider: string
  source: string
  sourceUrl: string | null
  compositionDate: string | null
  lastVerifiedAt: string | null
  acquisitionState:
    | 'acquired'
    | 'missing'
    | 'underlying-observation'
    | 'rejected'
    | 'unreadable'
    | 'unbound'
  qualificationState: 'open' | 'not-started' | 'failed' | 'ready'
  validated: boolean
  allocationReadiness?: import('./iusa-readiness').AllocationReadiness
  calculationCoverage?: {
    identifiedPercent: string
    remainingPercent: string
    compositionDate: string | null
  }
  usedInCalculation: boolean
  calculationSource: string | null
  evidence: FundEvidenceSummary
  inspection?: InspectionSummary
  blocker: string
  nextAction: string
  identityNote: string
}

export interface DevelopmentFundDetail extends DevelopmentFund {
  valuation?: FundValuation
  illustrative?: IllustrativeValues
  rows: ConstituentObservation[]
  rowPage: {
    total: number
    identifiers: number
    reportedWeights: number
  }
}

export interface DevelopmentStageCheck {
  label: string
  state: ProgressState
  detail: string
}

export interface DevelopmentStage {
  id: string
  title: string
  purpose: string
  state: ProgressState
  summary: string
  checks: DevelopmentStageCheck[]
}

export interface DevelopmentProgress {
  generatedAt: string
  connectivity: {
    localService: 'available'
    broker: string
    savedData: string
    sourceEvidence: string
  }
  portfolio: {
    snapshotAt: string | null
    positionCount: number
    fundCount: number
    funds: { isin: string; name: string }[]
  }
  evidence: {
    configured: boolean
    directory: string | null
    manifestFile: string | null
    manifestRecordedAt: string | null
    manifestFiles: number | null
    manifestMismatches: number | null
    diagnostics: string[]
  }
  counts: {
    portfolioFunds: number
    acquiredFunds: number
    qualifiedFunds: number
    usedFunds: number
    acquiredRows: number
    identifiedRows: number
  }
  stages: DevelopmentStage[]
  funds: DevelopmentFund[]
  sourceFreshness: {
    lastVerifiedAt: string | null
    asOfRange: { earliest: string | null; latest: string | null }
    note: string
  }
}

interface FundDefinition {
  provider: string
  source: string
  sourceUrl: string
  compositionDate: string | null
  lastVerifiedAt: string
  candidates: string[]
  blocker: string
  nextAction: string
  identityNote: string
}

interface ParsedEvidence {
  summary: FundEvidenceSummary
  rows: ConstituentObservation[]
  inspection?: InspectionSummary
  failureState?: 'rejected' | 'unreadable' | 'unbound'
}

const DEFINITIONS: Record<string, FundDefinition> = {
  IE0031442068: {
    provider: 'iShares',
    source: 'iShares official holdings response',
    sourceUrl:
      'https://www.ishares.com/uk/individual/en/products/251900/ishares-sp-500-ucits-etf-inc-fund?locale=en_GB',
    compositionDate: '2026-09-09',
    lastVerifiedAt: '2026-09-11',
    candidates: ['IE0031442068-holdings-20260909-cli-repeat.json'],
    blocker:
      'Issuer denominator, futures interpretation, reuse terms and sustained updates remain open.',
    nextAction:
      'Establish a compatible total-fund basis and permitted repeatable retention before admission.',
    identityNote:
      'Exact product and share-class evidence is retained; security rows are not company identities.',
  },
  IE00B4L5Y983: {
    provider: 'iShares',
    source: 'iShares official holdings response',
    sourceUrl:
      'https://www.ishares.com/uk/individual/en/products/251882/ishares-core-msci-world-ucits-etf-acc-fund',
    compositionDate: '2026-09-10',
    lastVerifiedAt: '2026-09-11',
    candidates: ['IE00B4L5Y983-holdings-20260910-cli-repeat.json'],
    blocker:
      'Issuer denominator, signed FX/futures semantics, reuse terms and sustained updates remain open.',
    nextAction:
      'Qualify the reported weight basis and non-equity rows against authoritative source evidence.',
    identityNote:
      'The 1,321 retained rows preserve FX and futures; an ISIN does not prove company identity.',
  },
  IE00B53SZB19: {
    provider: 'iShares',
    source: 'iShares official holdings response',
    sourceUrl:
      'https://www.ishares.com/uk/individual/en/products/253741/ishares-nasdaq-100-ucits-etf-acc-fund',
    compositionDate: '2026-09-10',
    lastVerifiedAt: '2026-09-11',
    candidates: ['IE00B53SZB19-holdings-20260910-cli-repeat.json'],
    blocker:
      'Underlying-fund denominator, money-market/futures semantics and reuse terms remain open.',
    nextAction:
      'Resolve the common underlying portfolio basis before any monetary contribution is admitted.',
    identityNote: 'Exact CNDX rows are retained as security allocation evidence only.',
  },
  IE00BYVQ9F29: {
    provider: 'iShares',
    source: 'iShares official holdings response · held-class allocation estimate',
    sourceUrl:
      'https://www.ishares.com/uk/individual/en/products/304353/ishares-nasdaq-100-ucits-etf',
    compositionDate: '2026-09-10',
    lastVerifiedAt: '2026-09-11',
    candidates: ['IE00BYVQ9F29-holdings-20260910-cli-repeat.json'],
    blocker:
      'The equity allocation estimate is admitted, but class-specific hedge economics, non-equity economics, exact NAV reconciliation and reuse permission remain open.',
    nextAction: 'Keep the estimate visibly partial; obtain a dated class hedge/NAV bridge if full held-class reconciliation is required.',
    identityNote:
      'NQSE is EUR-hedged. Official whole-published-holdings equity weights support the labelled estimate; USD source-row currencies are not relabeled or converted.',
  },
  DE000A0F5UF5: {
    provider: 'iShares',
    source: 'iShares legacy holdings JSON with dated CSV corroboration',
    sourceUrl:
      'https://www.ishares.com/de/privatanleger/de/produkte/251896/ishares-nasdaq100-ucits-etf-de-fund?siteEntryPassthrough=true&switchLocale=y',
    compositionDate: '2026-09-10',
    lastVerifiedAt: '2026-09-11',
    candidates: ['DE000A0F5UF5-holdings-discovery-repeat-20260911.json'],
    blocker:
      'Issuer denominator, legacy JSON identity/date binding, reuse terms and sustained updates remain open.',
    nextAction:
      'Bind the legacy response to exact dated product evidence and qualify its weight semantics.',
    identityNote:
      'The JSON is cross-checked with a dated CSV; non-equity and missing-ID rows stay visible.',
  },
  IE00B3WJKG14: {
    provider: 'iShares',
    source: 'iShares legacy holdings JSON with dated CSV corroboration',
    sourceUrl:
      'https://www.ishares.com/uk/individual/en/products/280510/ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-fund',
    compositionDate: '2026-09-10',
    lastVerifiedAt: '2026-09-11',
    candidates: ['IE00B3WJKG14-holdings-discovery-repeat-20260911.json'],
    blocker:
      'Issuer denominator, cash/futures semantics, reuse terms and sustained updates remain open.',
    nextAction: 'Qualify the legacy route against exact-date source evidence before admission.',
    identityNote:
      'Exact security identifiers are available for the equity rows; no company merge is inferred.',
  },
  FR0010361683: {
    provider: 'Amundi',
    source: 'Amundi direct composition API (inspection only)',
    sourceUrl: 'https://www.amundietf.de/mapi/ProductAPI/getProductsData',
    compositionDate: null,
    lastVerifiedAt: '',
    candidates: [],
    blocker:
      'The dated substitute basket is retained for inspection only. Indirect unfunded-swap economics, benchmark allocation and source-use permission remain unresolved.',
    nextAction:
      'Obtain complete dated economic constituents, or a full benchmark with an evidenced swap allocation ratio and residual treatment. Basket weights and partial benchmark rows alone cannot support monetary exposure.',
    identityNote:
      'The source identifies an indirect unfunded swap. Basket rows and INDEX_TOP10 rows are displayed with their scope and are not company exposure.',
  },
}

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

function textValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === '-') return null
  if (typeof value === 'string' && (!value.trim() || ['—', 'N/A'].includes(value.trim())))
    return null
  if (typeof value === 'object') {
    const object = asRecord(value)
    return textValue(object.raw ?? object.display)
  }
  return String(value)
}

function dateToken(value: unknown): string | null {
  const text = textValue(value)
  if (!text) return null
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function inspectionRow(raw: InspectionRow): ConstituentObservation {
  const identifiers = availableIdentifiers({
    isin: raw.isin,
    ticker: raw.ticker,
    exchange: null,
    country: raw.country,
  })
  return {
    row: raw.sourceRow,
    name: raw.name ?? 'Unnamed source row',
    isin: raw.isin,
    ticker: raw.ticker,
    weightPercent: null,
    weight: raw.weight,
    weightUnit: raw.weightUnit,
    sourceScope: raw.scope,
    quantity: raw.quantity,
    securityType: raw.assetClass,
    currency: raw.currency,
    exchange: null,
    country: raw.country,
    sector: raw.sector,
    availableIdentifiers: identifiers,
  }
}

function parseInspection(observation: InspectionObservation): ParsedEvidence {
  const rows = observation.rows.map(inspectionRow)
  const benchmarkRows = observation.benchmarkRows.map(inspectionRow)
  const allRows = [...rows, ...benchmarkRows]
  const identifiers = rows.filter(row => row.availableIdentifiers.length > 0).length
  const equityRows = rows.filter(row => isEquity(row.securityType))
  return {
    summary: {
      fileName: null,
      format: 'Amundi direct JSON inspection',
      bytes: observation.responseBytes,
      sha256: observation.responseSha256,
      manifestVerified: true,
      identityVerified: true,
      weightUnit: 'fraction',
      denominator: 'Signed source fractions for the substitute basket; no benchmark or swap allocation admitted.',
      sourceUrl: observation.sourceUrl,
      compositionDate: observation.asOf,
      lastVerifiedAt: observation.retrievedAt,
      rowCount: observation.totalReportedRows,
      equityRowCount: equityRows.length,
      identifierRowCount: identifiers,
      isinRowCount: rows.filter(row => row.availableIdentifiers.includes('ISIN')).length,
      tickerRowCount: rows.filter(row => row.availableIdentifiers.includes('Ticker')).length,
      weightRowCount: rows.filter(row => row.weight !== null && row.weight !== undefined).length,
      nonEquityRowCount: rows.filter(row => !isEquity(row.securityType)).length,
      error: null,
    },
    rows: allRows,
    inspection: {
      reportedRowCount: observation.totalReportedRows,
      benchmarkRowCount: observation.benchmarkRows.length,
      responseSha256: observation.responseSha256,
      requestSha256: observation.requestSha256,
      replicationMethod: observation.replicationMethod,
      benchmarkName: observation.benchmarkName,
      benchmarkTicker: observation.benchmarkTicker,
      swapCounterparties: observation.swapCounterparties,
      sourceLimits: observation.sourceLimits,
    },
  }
}

function isEquity(value: string | null): boolean {
  return !!value && /equity|aktien/i.test(value)
}

function availableIdentifiers(row: {
  isin: string | null
  ticker: string | null
  exchange: string | null
  country: string | null
}): string[] {
  return [row.isin && validIsin(row.isin) ? 'ISIN' : null, row.ticker ? 'Ticker' : null].filter(
    (value): value is string => value !== null
  )
}

function parseColumnar(value: JsonRecord, definition: FundDefinition): ParsedEvidence {
  const all = asRecord(
    asRecord(asRecord(value.componentsByNameMap).holdings).containersByNameMap
  ).all
  const points = asRecord(asRecord(all).dataPointsByNameMap)
  const field = (name: string): JsonRecord => asRecord(points[name])
  const rows = (name: string): unknown[] => asArray(field(name).value)
  const names = rows('issueName')
  const isins = rows('isin')
  const tickers = rows('ticker')
  const weights = rows('holdingPercent')
  const types = rows('assetClass')
  const currencies = rows('marketCurrencyCode')
  const exchanges = rows('exchange')
  const countries = rows('countryOfRisk')
  const length = Math.max(
    names.length,
    isins.length,
    tickers.length,
    weights.length,
    types.length,
    currencies.length,
    exchanges.length,
    countries.length
  )
  if (!length) throw new Error('No holdings rows found in columnar evidence')
  const parsed: ConstituentObservation[] = Array.from({ length }, (_, index) => {
    const row = {
      isin: textValue(isins[index]),
      ticker: textValue(tickers[index]),
      exchange: textValue(exchanges[index]),
      country: textValue(countries[index]),
    }
    return {
      row: index + 1,
      name: textValue(names[index]) ?? 'Unnamed source row',
      isin: row.isin,
      ticker: row.ticker,
      weightPercent: textValue(weights[index]),
      securityType: textValue(types[index]),
      currency: textValue(currencies[index]),
      exchange: row.exchange,
      country: row.country,
      availableIdentifiers: availableIdentifiers(row),
    }
  })
  const asOf = dateToken(field('asOfDate').value)
  const sourceDate = asOf ?? definition.compositionDate
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
  return {
    summary: {
      fileName: null,
      format: 'iShares columnar JSON',
      bytes,
      sha256: null,
      manifestVerified: false,
      sourceUrl: definition.sourceUrl,
      compositionDate: sourceDate,
      lastVerifiedAt: definition.lastVerifiedAt,
      rowCount: parsed.length,
      equityRowCount: parsed.filter((row) => isEquity(row.securityType)).length,
      identifierRowCount: parsed.filter((row) => row.availableIdentifiers.length > 0).length,
      weightRowCount: parsed.filter((row) => row.weightPercent !== null).length,
      nonEquityRowCount: parsed.filter((row) => !isEquity(row.securityType)).length,
      error: null,
    },
    rows: parsed,
  }
}

function parseLegacy(value: JsonRecord, definition: FundDefinition): ParsedEvidence {
  const data = asArray(value.aaData)
  if (!data.length) throw new Error('No holdings rows found in legacy evidence')
  const cell = (row: unknown[], index: number): string | null => textValue(row[index])
  const rows = data.map((rawRow, index) => {
    const row = asArray(rawRow)
    const parsed = {
      isin: cell(row, 8),
      ticker: cell(row, 0),
      exchange: cell(row, 11),
      country: cell(row, 10),
    }
    return {
      row: index + 1,
      name: cell(row, 1) ?? parsed.ticker ?? 'Unnamed source row',
      isin: parsed.isin,
      ticker: parsed.ticker,
      weightPercent: cell(row, 5),
      securityType: cell(row, 3),
      currency: cell(row, 12),
      exchange: parsed.exchange,
      country: parsed.country,
      availableIdentifiers: availableIdentifiers(parsed),
    }
  })
  return {
    summary: {
      fileName: null,
      format: 'iShares legacy JSON with dated CSV corroboration',
      bytes: Buffer.byteLength(JSON.stringify(value), 'utf8'),
      sha256: null,
      manifestVerified: false,
      sourceUrl: definition.sourceUrl,
      compositionDate: definition.compositionDate,
      lastVerifiedAt: definition.lastVerifiedAt,
      rowCount: rows.length,
      equityRowCount: rows.filter((row) => isEquity(row.securityType)).length,
      identifierRowCount: rows.filter((row) => row.availableIdentifiers.length > 0).length,
      weightRowCount: rows.filter((row) => row.weightPercent !== null).length,
      nonEquityRowCount: rows.filter((row) => !isEquity(row.securityType)).length,
      error: null,
    },
    rows,
  }
}

function readManifest(evidenceDir: string | null) {
  if (!evidenceDir) return null
  const manifestNames = [
    'manifest-2026-09-11.json',
    'manifest-2026-09-11-expansion.json',
    'manifest-2026-09-11-semantics.json',
  ]
  const files = new Map<string, string>()
  const names: string[] = []
  let recorded: string | null = null
  let mismatches = 0
  const conflicts = new Set<string>()
  const diagnostics: string[] = []
  for (const name of manifestNames) {
    const manifestFile = join(evidenceDir, name)
    if (!existsSync(manifestFile)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as JsonRecord
      names.push(name)
      recorded ??= textValue(manifest.recorded)
      for (const entry of asArray(manifest.files).map((item) => asRecord(item))) {
        if (typeof entry.file !== 'string' || typeof entry.sha256 !== 'string') continue
        const previous = files.get(entry.file)
        if (previous && previous !== entry.sha256) {
          mismatches += 1
          conflicts.add(entry.file)
          diagnostics.push(`Conflicting manifest receipts: ${entry.file}`)
        }
        files.set(entry.file, String(entry.sha256))
      }
    } catch {
      mismatches += 1
      diagnostics.push(`Unreadable manifest: ${name}`)
    }
  }
  if (!names.length) return null
  return {
    file: names.join(' + '),
    recorded,
    files,
    fileCount: files.size,
    mismatches,
    conflicts,
    diagnostics,
  }
}

function readEvidence(
  evidenceDir: string | null,
  isin: string,
  definition: FundDefinition,
  manifest: ReturnType<typeof readManifest>
): ParsedEvidence | null {
  if (!evidenceDir || !definition.candidates.length) return null
  for (const candidate of definition.candidates) {
    const file = join(evidenceDir, candidate)
    if (!existsSync(file)) continue
    let failureState: ParsedEvidence['failureState'] = 'unreadable'
    try {
      const bytes = readFileSync(file)
      if (bytes.byteLength > 25_000_000)
        throw new Error('Evidence file exceeds the local read limit')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const expected = manifest?.files.get(candidate)
      failureState = 'unbound'
      if (!expected)
        throw new Error('Missing manifest receipt; verify original bytes before inspection.')
      failureState = 'rejected'
      if (manifest?.conflicts.has(candidate))
        throw new Error(
          'Conflicting manifest receipts; reconcile original receipts before inspection.'
        )
      if (manifest?.diagnostics.some((message) => message.startsWith('Unreadable manifest')))
        throw new Error('A manifest cannot be read; resolve its diagnostics before inspection.')
      if (expected !== sha256)
        throw new Error('Manifest hash mismatch; restore or re-verify the original evidence.')
      failureState = 'unreadable'
      const parsedValue = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as JsonRecord
      const expectedProduct = /\/(?:products|produkte)\/(\d+)/.exec(definition.sourceUrl)?.[1]
      failureState = 'rejected'
      if (parsedValue.productId !== undefined && String(parsedValue.productId) !== expectedProduct)
        throw new Error(
          `Fund identity mismatch for ${isin}; the payload declares a different issuer product.`
        )
      if (parsedValue.productId === undefined) {
        failureState = 'unbound'
        const receiptName = `${candidate}.receipt.json`
        const receiptHash = manifest?.files.get(receiptName)
        if (!receiptHash || !existsSync(join(evidenceDir, receiptName)))
          throw new Error('Missing verified companion receipt; exact fund identity is unbound.')
        failureState = 'rejected'
        const receiptBytes = readFileSync(join(evidenceDir, receiptName))
        if (
          manifest?.conflicts.has(receiptName) ||
          createHash('sha256').update(receiptBytes).digest('hex') !== receiptHash
        )
          throw new Error('Companion receipt integrity failed; exact fund identity is unbound.')
        failureState = 'unreadable'
        const receipt = asRecord(JSON.parse(receiptBytes.toString('utf8')))
        failureState = 'rejected'
        const url = new URL(String(receipt.url))
        const product = /\/(?:products|produkte)\/(\d+)\//.exec(url.pathname)?.[1]
        if (
          url.protocol !== 'https:' ||
          !['www.ishares.com', 'www.blackrock.com'].includes(url.hostname) ||
          product !== expectedProduct ||
          receipt.sha256 !== sha256 ||
          receipt.status !== 200 ||
          receipt.bytes !== bytes.byteLength
        )
          throw new Error(`Companion receipt does not bind these bytes to ${isin}.`)
      }
      failureState = 'unreadable'
      const parsed = parsedValue.aaData
        ? parseLegacy(parsedValue, definition)
        : parseColumnar(parsedValue, definition)
      parsed.summary.fileName = candidate
      parsed.summary.bytes = bytes.byteLength
      parsed.summary.sha256 = sha256
      parsed.summary.manifestVerified = expected !== undefined && expected === sha256
      parsed.summary.identityVerified = true
      parsed.summary.isinRowCount = parsed.rows.filter((row) =>
        row.availableIdentifiers.includes('ISIN')
      ).length
      parsed.summary.tickerRowCount = parsed.rows.filter((row) =>
        row.availableIdentifiers.includes('Ticker')
      ).length
      parsed.summary.weightUnit = 'percent'
      parsed.summary.denominator =
        'Issuer-reported allocation; compatible total-fund denominator remains unqualified.'
      return parsed
    } catch (error) {
      return {
        summary: {
          fileName: candidate,
          format: null,
          bytes: null,
          sha256: null,
          manifestVerified: false,
          sourceUrl: definition.sourceUrl,
          compositionDate: null,
          lastVerifiedAt: null,
          rowCount: null,
          equityRowCount: null,
          identifierRowCount: null,
          weightRowCount: null,
          nonEquityRowCount: null,
          error:
            failureState === 'unreadable'
              ? 'Evidence is unreadable or malformed; inspect the original artifact and retry.'
              : error instanceof Error
                ? error.message
                : 'Could not verify evidence',
        },
        rows: [],
        failureState,
      }
    }
  }
  return null
}

function manifestInfo(manifest: ReturnType<typeof readManifest>, evidenceDir: string | null) {
  return {
    configured: evidenceDir !== null,
    directory: evidenceDir ? 'configured' : null,
    manifestFile: manifest?.file ?? null,
    manifestRecordedAt: manifest?.recorded ?? null,
    manifestFiles: manifest?.fileCount ?? null,
    manifestMismatches: manifest?.mismatches ?? null,
    diagnostics: manifest?.diagnostics ?? (evidenceDir ? ['No readable manifests found.'] : []),
  }
}

function sourceFreshness(funds: DevelopmentFund[]): DevelopmentProgress['sourceFreshness'] {
  const dates = funds
    .map((fund) => fund.compositionDate)
    .filter((date): date is string => Boolean(date))
    .sort()
  return {
    lastVerifiedAt:
      funds
        .map((fund) => fund.lastVerifiedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    asOfRange: { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null },
    note: 'Source verification date, composition date and local retrieval time are separate facts.',
  }
}

function stageData(
  snapshot: Snapshot | null,
  funds: DevelopmentFund[],
  evidenceConfigured: boolean,
  composition: Composition | null
): DevelopmentStage[] {
  const portfolioFunds = funds.length
  const acquiredFunds = funds.filter(isInspectable).length
  const qualifiedFunds = funds.filter((fund) => fund.validated).length
  const usedFunds = funds.filter((fund) => fund.usedInCalculation).length
  const acquiredRows = funds.reduce((sum, fund) => sum + (fund.evidence.rowCount ?? 0), 0)
  const identifiedRows = funds.reduce(
    (sum, fund) => sum + (fund.evidence.identifierRowCount ?? 0),
    0
  )
  return [
    {
      id: 'import',
      title: 'Import and reconcile the portfolio',
      purpose:
        'Positions, quantities and identifiers must be saved before exposure can be trusted.',
      state: snapshot ? 'open' : 'unavailable',
      summary: snapshot
        ? `${snapshot.positions.length} saved positions, including ${portfolioFunds} portfolio ETFs.`
        : 'No saved portfolio snapshot is available.',
      checks: [
        {
          label: 'Saved broker snapshot',
          state: snapshot ? 'ready' : 'unavailable',
          detail: snapshot
            ? `Saved at ${snapshot.fetchedAt}.`
            : 'Connect the broker to create a snapshot.',
        },
        {
          label: 'Phase-one reconciliation',
          state: 'open',
          detail:
            'Still open: repeat imports, sold positions, empty-vs-failed reads and broker valuation reconciliation.',
        },
      ],
    },
    {
      id: 'acquisition',
      title: 'Acquire a full, dated composition for every ETF',
      purpose:
        'Each exact fund needs its own retained source. Provider-level claims do not fill another fund.',
      state: acquiredFunds > 0 ? 'open' : 'blocked',
      summary: `${acquiredFunds}/${portfolioFunds} portfolio ETF routes have retained source observations; ${portfolioFunds - acquiredFunds} remain without saved source rows.`,
      checks: [
        {
          label: 'Private evidence route',
          state: evidenceConfigured ? 'ready' : 'unavailable',
          detail: evidenceConfigured
            ? `${acquiredRows.toLocaleString()} retained rows are available for inspection.`
            : 'Configure PRISM_V2_EVIDENCE_DIR to inspect private retained artifacts.',
        },
        {
          label: 'Exact-fund coverage',
          state: acquiredFunds === portfolioFunds && portfolioFunds > 0 ? 'ready' : 'open',
          detail: `${portfolioFunds - acquiredFunds} held fund(s) still need an acquired full composition.`,
        },
      ],
    },
    {
      id: 'qualification',
      title: 'Qualify each composition',
      purpose:
        'Completeness, weight meaning, denominator, cash, derivatives, hedging and synthetic semantics stay explicit.',
      state: qualifiedFunds === portfolioFunds && portfolioFunds > 0 ? 'ready' : 'open',
      summary: `${qualifiedFunds}/${portfolioFunds} admitted to the full economic-source contract.`,
      checks: [
        {
          label: 'Row and identifier accounting',
          state: acquiredRows > 0 ? 'ready' : 'open',
          detail: `${identifiedRows.toLocaleString()} retained rows expose at least one identifier; missing identifiers remain visible.`,
        },
        {
          label: 'Weight basis and non-equity semantics',
          state: 'open',
          detail:
            'No acquired fund has closed the compatible total-fund basis, reuse and repeat-update gates.',
        },
      ],
    },
    {
      id: 'identity',
      title: 'Resolve securities to companies',
      purpose:
        'ISINs, names and tickers identify source rows; they do not prove a canonical company relationship.',
      state: 'open',
      summary:
        'Partially implemented: Alphabet Class A and Class C, and HEICO common and Class A have verified dated issuer relationships and monetary grouping. Other securities remain exact-ISIN subtotals; a general company resolver is still open.',
      checks: [
        {
          label: 'Available identifiers',
          state: identifiedRows > 0 ? 'ready' : 'open',
          detail: `${identifiedRows.toLocaleString()} saved rows can be inspected without claiming company resolution.`,
        },
        {
          label: 'Company relationship evidence',
          state: 'open',
          detail:
            'Versioned records bind Alphabet US02079K3059/US02079K1079 using exchange and SEC evidence, and HEICO US4228061093/US4228062083 using dated GLEIF mappings and class evidence. HEICO LEI registration was lapsed; this is not a current issuer-status claim. Next: verify primary issuer/share-class evidence for other relationships before grouping. No name-only or ticker-only match is admitted.',
        },
      ],
    },
    {
      id: 'calculation',
      title: 'Calculate and aggregate compatible exposure',
      purpose:
        'Direct holdings and admitted ETF contributions require compatible valuation and currency bases.',
      state: usedFunds > 0 ? 'open' : 'blocked',
      summary: composition
        ? 'The saved justETF top-ten pilot is the only composition currently used; private acquired files are inspection-only.'
        : 'No composition is currently admitted to the calculation view.',
      checks: [
        {
          label: 'Current calculation input',
          state: usedFunds > 0 ? 'ready' : 'open',
          detail:
            usedFunds > 0
              ? 'IUSA uses the saved partial top-ten pilot, not the acquired full-row artifact.'
              : 'No admitted fund contribution is available.',
        },
        {
          label: 'Currency and denominator basis',
          state: 'open',
          detail:
            'Currency buckets stay separate; unknown exposure is not normalized or converted to zero.',
        },
      ],
    },
    {
      id: 'verify',
      title: 'Verify and maintain the result',
      purpose:
        'Reconciliation, unresolved coverage, source freshness and repeatable updates must remain visible.',
      state: 'open',
      summary:
        'A useful saved result exists, but the release gates for freshness, reconciliation and corrections remain open.',
      checks: [
        {
          label: 'Source freshness',
          state: funds.some((fund) => fund.lastVerifiedAt) ? 'ready' : 'open',
          detail:
            'Last verified dates are shown separately from composition and local retrieval dates.',
        },
        {
          label: 'Release reconciliation',
          state: 'open',
          detail:
            'Phase-one reconciliation and repeatable portfolio-wide updates are not complete.',
        },
      ],
    },
  ]
}

function fundSummary(
  position: Position,
  evidence: ParsedEvidence | null,
  definition: FundDefinition,
  usedInCalculation: boolean
): DevelopmentFund {
  const sourceSummary: FundEvidenceSummary = evidence
    ? { ...evidence.summary }
    : {
        fileName: null,
        format: null,
        bytes: null,
        sha256: null,
        manifestVerified: false,
        sourceUrl: definition.sourceUrl,
        compositionDate: null,
        lastVerifiedAt: null,
        rowCount: null,
        equityRowCount: null,
        identifierRowCount: null,
        weightRowCount: null,
        nonEquityRowCount: null,
        error: null,
      }
  return {
    isin: position.isin,
    name: position.name,
    provider: definition.provider,
    source: definition.source,
    sourceUrl: definition.sourceUrl,
    compositionDate: sourceSummary.compositionDate,
    lastVerifiedAt: sourceSummary.lastVerifiedAt,
    acquisitionState:
      evidence?.failureState ??
      (evidence ? 'acquired' : 'missing'),
    qualificationState: 'not-started',
    validated: false,
    usedInCalculation,
    calculationSource: usedInCalculation ? 'Saved justETF top-ten pilot' : null,
    evidence: sourceSummary,
    ...(evidence?.inspection ? { inspection: evidence.inspection } : {}),
    blocker: definition.blocker,
    nextAction: definition.nextAction,
    identityNote: definition.identityNote,
  }
}

function isInspectable(fund: DevelopmentFund): boolean {
  return fund.acquisitionState === 'acquired' || fund.acquisitionState === 'underlying-observation'
}

export function developmentCounts(
  funds: readonly DevelopmentFund[]
): DevelopmentProgress['counts'] {
  return {
    portfolioFunds: funds.length,
    acquiredFunds: funds.filter(isInspectable).length,
    qualifiedFunds: funds.filter((fund) => fund.validated).length,
    usedFunds: funds.filter((fund) => fund.usedInCalculation).length,
    acquiredRows: funds.reduce((sum, fund) => sum + (fund.evidence.rowCount ?? 0), 0),
    identifiedRows: funds.reduce((sum, fund) => sum + (fund.evidence.identifierRowCount ?? 0), 0),
  }
}

export function developmentProgress(
  snapshot: Snapshot | null,
  sources: DataSource[],
  composition: Composition | null,
  compositionAttempt: CompositionAttempt | null,
  evidenceDirectory: string | null,
  brokerPhase: string,
  now = Date.now(),
  inspections: readonly InspectionObservation[] = []
): DevelopmentProgress {
  const evidenceDir = evidenceDirectory ? resolve(evidenceDirectory) : null
  const manifest = readManifest(evidenceDir)
  const positions = snapshot?.positions ?? []
  const positionsByIsin = new Map(
    positions
      .filter((position) => position.instrumentType.toLowerCase() === 'fund')
      .map((position) => [position.isin, position])
  )
  const inspectionsByIsin = new Map(inspections.map(observation => [observation.fundIsin, observation]))
  const funds = [...positionsByIsin.entries()].map(([isin, position]) => {
    const definition = DEFINITIONS[isin] ?? {
      provider: 'Unknown provider',
      source: 'No source definition recorded',
      sourceUrl: '',
      compositionDate: null,
      lastVerifiedAt: '',
      candidates: [],
      blocker: 'No exact source definition is recorded for this saved fund.',
      nextAction: 'Record exact fund identity and source evidence before acquisition.',
      identityNote: 'Do not infer provider or company identity from the name alone.',
    }
    const evidence = inspectionsByIsin.has(isin)
      ? parseInspection(inspectionsByIsin.get(isin)!)
      : readEvidence(evidenceDir, isin, definition, manifest)
    const usedInCalculation = isin === 'IE0031442068' && composition?.fundIsin === isin
    const fund = fundSummary(position, evidence, definition, usedInCalculation)
    if (usedInCalculation && composition)
      fund.calculationCoverage = {
        identifiedPercent: composition.identifiedPercent,
        remainingPercent: new Decimal(100).sub(composition.identifiedPercent).toFixed(),
        compositionDate: composition.asOf,
      }
    return fund
  })
  const latestVerification =
    funds
      .map((fund) => fund.lastVerifiedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  const source = sources.find((item) => item.id === 'instrumentDetails')
  const savedData = snapshot ? `${positions.length} saved positions` : 'No saved positions'
  const broker =
    brokerPhase === 'connected'
      ? 'Connected'
      : snapshot
        ? `Disconnected · ${savedData}`
        : 'Not connected'
  void source
  void compositionAttempt
  return {
    generatedAt: new Date(now).toISOString(),
    connectivity: {
      localService: 'available',
      broker,
      savedData,
      sourceEvidence: evidenceDir
        ? 'Private evidence directory configured'
        : 'Private evidence directory not configured',
    },
    portfolio: {
      snapshotAt: snapshot?.fetchedAt ?? null,
      positionCount: positions.length,
      fundCount: funds.length,
      funds: funds.map((fund) => ({ isin: fund.isin, name: fund.name })),
    },
    evidence: manifestInfo(manifest, evidenceDir),
    counts: developmentCounts(funds),
    stages: stageData(snapshot, funds, evidenceDir !== null, composition),
    funds,
    sourceFreshness: sourceFreshness(funds),
  }
}

export function developmentFund(
  progress: DevelopmentProgress,
  snapshot: Snapshot | null,
  evidenceDirectory: string | null,
  isin: string,
  inspections: readonly InspectionObservation[] = []
): DevelopmentFundDetail | null {
  const summary = progress.funds.find((fund) => fund.isin === isin)
  const position = snapshot?.positions.find(
    (candidate) => candidate.isin === isin && candidate.instrumentType.toLowerCase() === 'fund'
  )
  const definition = DEFINITIONS[isin]
  if (!summary || !position || !definition) return null
  const manifest = readManifest(evidenceDirectory ? resolve(evidenceDirectory) : null)
  const inspection = inspections.find(observation => observation.fundIsin === isin)
  const parsed = inspection
    ? parseInspection(inspection)
    : readEvidence(
        evidenceDirectory ? resolve(evidenceDirectory) : null,
        isin,
        definition,
        manifest
      )
  const rows = parsed?.rows ?? []
  return {
    ...fundSummary(position, parsed, definition, summary.usedInCalculation),
    calculationCoverage: summary.calculationCoverage,
    rows,
    rowPage: {
      total: rows.length,
      identifiers: rows.filter((row) => row.availableIdentifiers.length > 0).length,
      reportedWeights: rows.filter((row) => row.weightPercent !== null).length,
    },
  }
}

export function knownDevelopmentIsin(value: string): boolean {
  return /^[A-Z0-9]{12}$/.test(value) && value in DEFINITIONS
}

export function developmentDefinitions(): string[] {
  return Object.keys(DEFINITIONS)
}
