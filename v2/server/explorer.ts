import { createHash } from 'node:crypto'
import { readPublicData } from './public-data'
import { selectQuoteListings } from './quote-listings'
import { resourceRegistry, type TRClient } from 'trade-republic-sdk'
import type { DiagnosticDetail } from './diagnostics'
import { classifyTradeRepublicError as classifyError } from './trade-republic-errors'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface DataSource {
  id: string
  title: string
  note: string
  status: 'not-fetched' | 'success' | 'partial' | 'failed' | 'unsupported'
  attemptedAt?: string
  fetchedAt?: string
  payload?: Json
  error?: DiagnosticDetail
  coverage: string
}
export const catalog: DataSource[] = [
  ...Object.keys(resourceRegistry).map((id) => ({
    id,
    title: (
      {
        accountInfo: 'Account profile',
        personalDetails: 'Personal details',
        paymentMethods: 'Payment methods',
        taxResidency: 'Tax residency',
        taxInformation: 'Tax information',
        taxExemptionOrders: 'Tax exemptions',
        allDocuments: 'Document catalog',
      } as Record<string, string>
    )[id],
    note:
      id === 'allDocuments'
        ? 'Document metadata from the broker. PDF contents are not downloaded. Signed URLs and access tokens are excluded.'
        : 'Account information supplied by Trade Republic. Stored privately on this computer.',
    status: 'not-fetched' as const,
    coverage: 'Not fetched',
  })),
  ...[
    [
      'accountPairs',
      'Accounts',
      'Links securities and cash accounts. Account identifiers are broker data.',
    ],
    [
      'portfolios',
      'Full portfolio responses',
      'All fields in each returned securities-account portfolio, including category and product metadata.',
    ],
    [
      'cash',
      'Cash balances',
      'Broker balances and currencies. Keep separate from securities value.',
    ],
    [
      'availableCash',
      'Available cash',
      'Available spending or trading balance can differ from total cash.',
    ],
    [
      'orders',
      'Open orders',
      'Broker order records. Retrieval does not place, change or cancel orders.',
    ],
    [
      'terminatedOrders',
      'Completed and cancelled orders',
      'The broker may limit retained order history.',
    ],
    [
      'savingsPlans',
      'Savings plans',
      'Plans per securities account, including schedule, amount and status.',
    ],
    [
      'portfolioStatus',
      'Portfolio status',
      'Broker flags describing account and investment status.',
    ],
    ['watchlists', 'Watchlists', 'Your broker watchlists. These are not owned positions.'],
    ['namedWatchlists', 'Watchlist contents', 'Details of each watchlist returned by the broker.'],
    [
      'timelineTransactions',
      'Transaction history',
      'Paginated broker events. Dividends, fees and trades may appear here or in event details. Amount units follow the supplied currency and fractionDigits; do not assume every numeric value is euros.',
    ],
    [
      'timelineDetails',
      'Transaction details',
      'Detailed sections for retrieved transaction events, including available fee and document references.',
    ],
    [
      'timelineActionsV2',
      'Pending account actions',
      'Broker-provided actions are displayed as data, never executed.',
    ],
    [
      'customerPermissions',
      'Account permissions',
      'Broker capability flags; no permissions are changed.',
    ],
    [
      'fincrimeBanner',
      'Account notices',
      'Broker compliance notices. Display does not submit or acknowledge them.',
    ],
    [
      'tradingPerkConditionStatus',
      'Trading benefits',
      'Broker benefit eligibility/status, where supported.',
    ],
    [
      'quotes',
      'Market quotes',
      'Bid, ask, last, previous and opening prices where returned. Quote venues come from exact active instrument listings, with at most one same-currency fallback. Quote payloads do not declare currency or prove crypto units.',
    ],
  ].map(([id, title, note]) => ({
    id,
    title,
    note,
    status: 'not-fetched' as const,
    coverage: 'Not fetched',
  })),
  {
    id: 'instrumentDetails',
    title: 'Instrument reference data',
    note: 'Trade Republic public instrument responses: listings, exchange metadata, price factors, issuer/company data, fund and bond metadata where supplied. Read-only protocol documented by pytr; no external provider.',
    status: 'not-fetched',
    coverage: 'Not fetched',
  },
  {
    id: 'stockDetails',
    title: 'Stock fundamentals',
    note: 'Trade Republic public stockDetails responses for stock positions. May be unavailable for some instruments. These are broker-provided fundamentals, not Prism analysis.',
    status: 'not-fetched',
    coverage: 'Not fetched',
  },
]
const secretKey = /password|passwd|pin$|cookie|token|authorization|secret|session|credential/i
// Payloads are private local user data. Only authentication material and URL capabilities are removed.
export function sanitizePayload(value: unknown, depth = 0): Json {
  if (depth > 30) throw new Error('Payload nesting limit')
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    if (/https?:\/\//i.test(value)) return '[URL omitted: may grant access to a private document]'
    return value
  }
  if (Array.isArray(value)) return value.map((v) => sanitizePayload(v, depth + 1))
  if (typeof value !== 'object') throw new Error('Unsupported payload')
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      secretKey.test(k) ? '[credential omitted]' : sanitizePayload(v, depth + 1),
    ])
  )
}
export interface ExplorerTransport {
  read(id: string, args: Record<string, string | boolean>, signal: AbortSignal): Promise<unknown>
}
export function sdkTransport(client: TRClient): ExplorerTransport {
  return {
    async read(id, args, signal) {
      const opts = { signal, timeoutMs: 10_000 }
      switch (id) {
        case 'instrument':
          return readPublicData('instrument', String(args.id), signal)
        case 'stockDetails':
          return readPublicData('stockDetails', String(args.id), signal)
        case 'accountInfo':
          return client.accountInfo.get(opts)
        case 'personalDetails':
          return client.personalDetails.get(opts)
        case 'paymentMethods':
          return client.paymentMethods.get(opts)
        case 'taxResidency':
          return client.taxResidency.get(opts)
        case 'taxInformation':
          return client.taxInformation.get(opts)
        case 'taxExemptionOrders':
          return client.taxExemptionOrders.get(opts)
        case 'allDocuments':
          return client.allDocuments.get(opts)
        case 'accountPairs':
          return client.accountPairs.get({}, opts)
        case 'cash':
          return client.cash.get({}, opts)
        case 'availableCash':
          return client.availableCash.get({}, opts)
        case 'orders':
          return client.orders.get({ terminated: args.terminated === true }, opts)
        case 'portfolioStatus':
          return client.portfolioStatus.get({}, opts)
        case 'customerPermissions':
          return client.customerPermissions.get({}, opts)
        case 'fincrimeBanner':
          return client.fincrimeBanner.get({}, opts)
        case 'timelineActionsV2':
          return client.timelineActionsV2.get({}, opts)
        case 'tradingPerkConditionStatus':
          return client.tradingPerkConditionStatus.get({}, opts)
        case 'watchlists':
          return client.watchlists.get({}, opts)
        case 'namedWatchlist':
          return client.namedWatchlist.get({ watchlistId: String(args.id) }, opts)
        case 'compactPortfolioByType':
          return client.compactPortfolioByType.get({ secAccNo: String(args.id) }, opts)
        case 'savingsPlans':
          return client.savingsPlans.get({ secAccNo: String(args.id) }, opts)
        case 'ticker':
          return client.ticker.get({ id: String(args.id) }, opts)
        case 'timelineTransactions':
          return client.timelineTransactions.get(
            typeof args.after === 'string' ? { after: args.after } : {},
            opts
          )
        case 'timelineDetailV2':
          return client.timelineDetailV2.get({ id: String(args.id) }, opts)
        default:
          throw new Error('Read source not allowed')
      }
    },
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object')
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected array')
  return value
}
export async function extractData(
  transport: ExplorerTransport,
  previous: DataSource[],
  save: (source: DataSource) => void,
  signal: AbortSignal,
  mode: 'refresh' | 'continue' | 'valuation' | 'history-batch' | 'history-recent',
  observe: (
    id: string,
    event: 'started' | 'succeeded' | 'failed',
    duration: number,
    detail: DiagnosticDetail
  ) => void,
  excludedQuoteIsins: readonly string[] = []
) {
  const result = new Map(previous.map((s) => [s.id, s]))
  const fingerprint = (item: unknown) => createHash('sha256').update(JSON.stringify(sanitizePayload(item))).digest('hex')
  const priorHistory = previous.find(s => s.id === 'timelineTransactions')?.payload
  const oldFingerprints = new Map(priorHistory ? array(object(priorHistory).items).map(item => [object(item).id, fingerprint(item)]) : [])
  const recentIds = new Set<unknown>()
  async function capture(
    id: string,
    work: () => Promise<{ payload: unknown; coverage: string; partial?: boolean; unchanged?: boolean }>
  ) {
    signal.throwIfAborted()
    const definition = catalog.find((s) => s.id === id)!
    const old = result.get(id)
    const at = new Date().toISOString(),
      start = performance.now()
    observe(id, 'started', 0, { category: 'none' })
    try {
      const value = await work()
      signal.throwIfAborted()
      const source: DataSource = {
        ...definition,
        status: value.unchanged && old ? old.status : value.partial ? 'partial' : 'success',
        attemptedAt: at,
        fetchedAt: value.unchanged && old ? old.fetchedAt : new Date().toISOString(),
        payload: sanitizePayload(value.payload),
        coverage: value.coverage,
      }
      save(source)
      result.set(id, source)
      observe(id, 'succeeded', Math.round(performance.now() - start), { category: 'none' })
    } catch (error) {
      signal.throwIfAborted()
      const detail = classifyError(error)
      const source: DataSource = {
        ...definition,
        ...old,
        status: 'failed',
        attemptedAt: at,
        error: detail,
      }
      save(source)
      result.set(id, source)
      observe(id, 'failed', Math.round(performance.now() - start), detail)
      if (detail.category === 'authentication') throw error
    }
  }
  // Keep one previously saved observation for a failed item. Fresh successes replace
  // it normally; never invent a new quote timestamp or merge ambiguous duplicates.
  const retainedItem = (sourceId: string, isin: string, field: 'response' | 'quote', venue?: string) => {
    const previous = result.get(sourceId)?.payload
    // A first import (or previously failed source) has no observation to retain.
    // Missing optional history must not discard other instruments' fresh results.
    if (!Array.isArray(previous)) return {}
    const matches = previous.filter(row => row !== null && typeof row === 'object' && !Array.isArray(row) &&
      row.isin === isin && (!venue || row.venue === venue))
    if (matches.length !== 1 || !object(matches[0])[field]) return {}
    const { error: _error, attempts: _attempts, ...evidence } = object(matches[0])
    return { ...evidence, retained: true, attemptedAt: new Date().toISOString() }
  }
  const read = (id: string, args: Record<string, string | boolean> = {}) =>
    transport.read(id, args, signal)
  if (mode === 'refresh' || mode === 'valuation') {
    for (const id of [
      ...Object.keys(resourceRegistry),
      'accountPairs',
      'cash',
      'availableCash',
      'portfolioStatus',
      'customerPermissions',
      'fincrimeBanner',
      'timelineActionsV2',
      'tradingPerkConditionStatus',
      'watchlists',
    ])
      if (mode === 'refresh' || ['accountPairs', 'cash', 'availableCash'].includes(id))
        await capture(id, async () => ({
          payload: await read(id),
          coverage: 'One complete endpoint response; broker retention and field coverage may vary',
        }))
    for (const terminated of mode === 'refresh' ? [false, true] : [])
      await capture(terminated ? 'terminatedOrders' : 'orders', async () => ({
        payload: await read('orders', { terminated }),
        coverage: 'One broker response; not a guarantee of all historical orders',
      }))
    for (const [id, topic] of [
      ['portfolios', 'compactPortfolioByType'],
      ['savingsPlans', 'savingsPlans'],
    ])
      if (mode === 'refresh' || id === 'portfolios')
        await capture(id, async () => {
          const accounts = array(object(result.get('accountPairs')?.payload).accounts)
          if (result.get('accountPairs')?.status !== 'success' || !accounts.length)
            throw new Error('Account discovery unavailable')
          const payload = []
          for (const a of accounts) {
            const id = object(a).securitiesAccountNumber
            if (typeof id !== 'string') throw new Error('Account id missing')
            payload.push({ account: id, response: await read(topic, { id }) })
          }
          return { payload, coverage: 'All accounts in this account-discovery response' }
        })
    if (mode === 'refresh')
      await capture('namedWatchlists', async () => {
        if (result.get('watchlists')?.status !== 'success')
          throw new Error('Watchlists unavailable')
        const lists = array(object(result.get('watchlists')?.payload).watchlists),
          payload = []
        for (const item of lists) {
          const id = object(item).id
          if (typeof id !== 'string') throw new Error('Missing list id')
          payload.push(await read('namedWatchlist', { id }))
        }
        return { payload, coverage: 'All watchlists returned in the parent response' }
      })
    for (const [sourceId, topic] of [
      ['instrumentDetails', 'instrument'],
      ['stockDetails', 'stockDetails'],
    ])
      if (mode === 'refresh' || sourceId === 'instrumentDetails')
        await capture(sourceId, async () => {
          if (result.get('portfolios')?.status !== 'success')
            throw new Error('Portfolios unavailable')
          const isins = new Set<string>()
          for (const p of array(result.get('portfolios')?.payload))
            for (const c of array(object(object(p).response).categories))
              for (const row of array(object(c).positions)) {
                const position = object(row)
                if (
                  typeof position.isin === 'string' &&
                  (topic === 'instrument' || position.instrumentType === 'stock')
                )
                  isins.add(position.isin)
              }
          const payload = []
          for (const isin of isins) {
            signal.throwIfAborted()
            if (excludedQuoteIsins.includes(isin)) {
              payload.push({ ...retainedItem(sourceId, isin, 'response'), isin, investigation: 'excluded' })
              continue
            }
            const started = performance.now()
            try {
              payload.push({ isin, response: await read(topic, { id: isin }) })
            } catch (error) {
              signal.throwIfAborted()
              if (classifyError(error).category === 'authentication') throw error
              const detail = { ...classifyError(error), isin }
              observe(sourceId, 'failed', Math.round(performance.now() - started), detail)
              payload.push({ ...retainedItem(sourceId, isin, 'response'), isin, error: detail })
            }
          }
          return {
            payload,
            partial: payload.some((p) => 'error' in p),
            coverage: 'One broker response per applicable held ISIN; individual failures retained',
          }
        })
    await capture('quotes', async () => {
      if (result.get('portfolios')?.status !== 'success') throw new Error('Portfolios unavailable')
      const isins = new Set<string>()
      for (const p of array(result.get('portfolios')?.payload))
        for (const c of array(object(object(p).response).categories))
          for (const row of array(object(c).positions)) {
            const isin = object(row).isin
            if (typeof isin === 'string') isins.add(isin)
          }
      const payload: Record<string, unknown>[] = []
      const metadata = result.get('instrumentDetails')?.payload
      for (const isin of isins) {
        signal.throwIfAborted()
        if (excludedQuoteIsins.includes(isin)) {
          const retained = retainedItem('quotes', isin, 'quote')
          payload.push({ ...retained, isin, investigation: 'excluded', selectionReason: 'Quote investigation excluded by user; retained evidence keeps its original date' })
          continue
        }
        const matches = Array.isArray(metadata) ? metadata.filter(row => row && typeof row === 'object' && !Array.isArray(row) && row.isin === isin) : []
        const selection = selectQuoteListings(isin, matches.length === 1 ? object(matches[0]).response : undefined)
        const attempts: { venue: string; error: DiagnosticDetail }[] = []
        let accepted = false
        for (const candidate of selection.candidates) {
          const started = performance.now()
          try {
            const quote = await read('ticker', { id: `${isin}.${candidate.venue}` })
            const bid = object(object(quote).bid)
            if (typeof bid.price !== 'string' || typeof bid.time !== 'number' || !Number.isFinite(bid.time))
              throw new Error('Quote fields unavailable')
            payload.push({ isin, venue: candidate.venue, currency: candidate.currency,
              receivedAt: new Date().toISOString(), quote, ...(attempts.length ? { attempts } : {}) })
            accepted = true
            break
          } catch (error) {
            signal.throwIfAborted()
            if (classifyError(error).category === 'authentication') throw error
            const detail = { ...classifyError(error), isin, venue: candidate.venue }
            observe('quotes', 'failed', Math.round(performance.now() - started), detail)
            attempts.push({ venue: candidate.venue, error: detail })
          }
        }
        if (!accepted) payload.push({ ...retainedItem('quotes', isin, 'quote'), isin,
          error: attempts.at(-1)?.error ?? { category: 'validation' },
          selectionReason: selection.reason ?? 'Active listing quote requests failed; retained quote keeps its original venue and date', attempts })
      }
      return {
        payload,
        partial: payload.some((p) => 'error' in p),
        coverage:
          'One quote per held ISIN from verified active listings, at most two same-currency attempts; failures retain original quote venue/date; crypto unit qualification remains separate',
      }
    })
  }
  if (mode === 'valuation') return
  // A host-controlled evidence probe: no unrelated source groups or automatic loop.
  const continuing = mode === 'continue' || mode === 'history-batch'
  const pageLimit = ['history-batch', 'history-recent'].includes(mode) ? 1 : 10
  const detailLimit = ['history-batch', 'history-recent'].includes(mode) ? 20 : 50
  await capture('timelineTransactions', async () => {
    const old = result.get('timelineTransactions')?.payload
    const existing = old ? object(old) : null
    const items = existing ? [...array(existing.items)] : []
    let after = mode === 'history-recent' ? existing?.recentCursor : continuing ? existing?.nextCursor : undefined
    let overlap = false
    const priorIds = new Set(items.map((item) => object(item).id))
    if (continuing && existing && !after)
      return { payload: existing, unchanged: true, coverage: 'Reached the end of history exposed by the broker' }
    let pages = 0
    const seen = new Set<string>(typeof after === 'string' ? [after] : [])
    do {
      const page = object(
        await read('timelineTransactions', typeof after === 'string' ? { after } : {})
      )
      const newItems = array(page.items)
      const overlaps = ['refresh', 'history-recent'].includes(mode) && newItems.some((item) => priorIds.has(object(item).id))
      if (mode === 'history-recent') for (const item of newItems) recentIds.add(object(item).id)
      items.push(...newItems)
      pages++
      after = object(page.cursors).after
      if (after !== undefined && after !== null && (typeof after !== 'string' || after.length === 0)) throw new Error('Invalid history cursor')
      if (overlaps) {
        overlap = true
        if (mode === 'refresh') after = existing?.nextCursor
        break
      }
      if (typeof after === 'string') {
        if (seen.has(after)) throw new Error('Repeated history cursor')
        seen.add(after)
      }
    } while (after && pages < pageLimit)
    const unique = new Map(
      items.map((item) => {
        const row = object(item)
        if (typeof row.id !== 'string') throw new Error('Missing event id')
        return [row.id, item]
      })
    )
    const nextCursor = mode === 'history-recent' && existing ? existing.nextCursor : after ?? null
    const recentCursor = mode === 'history-recent' ? (existing && !overlap ? after ?? null : null) : existing?.recentCursor
    return {
      payload: { items: [...unique.values()], nextCursor, ...(recentCursor !== undefined ? { recentCursor } : {}) },
      partial: !!nextCursor || !!recentCursor,
      coverage: after
        ? 'Partial history: another page exists. Use Continue history.'
        : 'Reached the end of history exposed by the broker',
    }
  })
  await capture('timelineDetails', async () => {
    const history = object(result.get('timelineTransactions')?.payload)
    const prior = result.get('timelineDetails')?.payload
    const previousDetails = new Map(prior ? array(object(prior).items).map(d => [object(d).id, object(d)]) : [])
    const currentFingerprints = new Map(array(history.items).map(item => [object(item).id, fingerprint(item)]))
    const refreshIds = new Set([...recentIds].slice(0,detailLimit))
    const details = prior
      ? array(object(prior).items).map((d): Record<string, unknown> => ({ ...object(d), timelineFingerprint: object(d).timelineFingerprint ?? oldFingerprints.get(object(d).id) })).filter(d =>
          !refreshIds.has(d.id) && d.timelineFingerprint === currentFingerprints.get(d.id) && !d.error)
      : []
    const done = new Set(details.map((d) => object(d).id))
    const missing = array(history.items).filter((item) => !done.has(object(item).id)).sort((a,b) => Number(recentIds.has(object(b).id))-Number(recentIds.has(object(a).id)))
    // Four independent read subscriptions bound load without serializing the entire history.
    const batch = missing.slice(0, detailLimit)
    for (let offset = 0; offset < batch.length; offset += 4) {
      signal.throwIfAborted()
      const outcomes = await Promise.allSettled(
        batch.slice(offset, offset + 4).map(async (item) => {
          const id = object(item).id
          if (typeof id !== 'string') throw new Error('Missing detail id')
          try {
            return { id, timelineFingerprint: fingerprint(item), response: await read('timelineDetailV2', { id }) }
          } catch (error) {
            signal.throwIfAborted()
            if (classifyError(error).category === 'authentication') throw error
            const retained = previousDetails.get(id)
            const priorFingerprint = retained?.timelineFingerprint ?? oldFingerprints.get(id)
            return { ...(priorFingerprint === fingerprint(item) && retained?.response ? { response: retained.response, retained: true } : {}), id, timelineFingerprint: fingerprint(item), error: classifyError(error) }
          }
        })
      )
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') throw outcome.reason
        details.push(outcome.value)
      }
    }
    return {
      unchanged: batch.length === 0 && !!prior,
      payload: { items: details, remaining: Math.max(0, missing.length - detailLimit) },
      partial: missing.length > detailLimit || details.some((d) => !!object(d).error),
      coverage:
        missing.length > detailLimit
          ? 'Partial event details: use Continue history.'
          : 'Attempted details for loaded events; per-event failures remain visible. Older history may still exist.',
    }
  })
}
