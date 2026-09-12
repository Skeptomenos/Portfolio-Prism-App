import { readPublicData } from './public-data'
import { resourceRegistry, type TRClient } from 'trade-republic-sdk'
import { classifyError, type DiagnosticDetail } from './diagnostics'

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
      'Bid, ask, last, previous and opening prices where returned. LSX is a candidate venue from the SDK example, not verified as the correct venue for every instrument. Quote payloads do not declare currency.',
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
  mode: 'refresh' | 'continue' | 'valuation',
  observe: (
    id: string,
    event: 'started' | 'succeeded' | 'failed',
    duration: number,
    detail: DiagnosticDetail
  ) => void
) {
  const result = new Map(previous.map((s) => [s.id, s]))
  async function capture(
    id: string,
    work: () => Promise<{ payload: unknown; coverage: string; partial?: boolean }>
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
        status: value.partial ? 'partial' : 'success',
        attemptedAt: at,
        fetchedAt: new Date().toISOString(),
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
            try {
              payload.push({ isin, response: await read(topic, { id: isin }) })
            } catch (error) {
              signal.throwIfAborted()
              if (classifyError(error).category === 'authentication') throw error
              payload.push({ isin, error: classifyError(error) })
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
      const payload = []
      for (const isin of isins) {
        signal.throwIfAborted()
        try {
          payload.push({
            isin,
            venue: 'LSX',
            currency: null,
            receivedAt: new Date().toISOString(),
            quote: await read('ticker', { id: `${isin}.LSX` }),
          })
        } catch (error) {
          signal.throwIfAborted()
          if (classifyError(error).category === 'authentication') throw error
          payload.push({ isin, venue: 'LSX', error: classifyError(error) })
        }
      }
      return {
        payload,
        partial: payload.some((p) => 'error' in p),
        coverage:
          'One candidate LSX quote per held ISIN; per-instrument failures are retained; venue and currency require confirmation',
      }
    })
  }
  if (mode === 'valuation') return
  await capture('timelineTransactions', async () => {
    const old = result.get('timelineTransactions')?.payload
    const existing = old ? object(old) : null
    const items = existing ? [...array(existing.items)] : []
    let after = mode === 'continue' ? existing?.nextCursor : undefined
    const priorIds = new Set(items.map((item) => object(item).id))
    if (mode === 'continue' && existing && !after)
      return { payload: existing, coverage: 'Reached the end of history exposed by the broker' }
    let pages = 0
    const seen = new Set<string>()
    do {
      const page = object(
        await read('timelineTransactions', typeof after === 'string' ? { after } : {})
      )
      const newItems = array(page.items)
      const overlaps = mode === 'refresh' && newItems.some((item) => priorIds.has(object(item).id))
      items.push(...newItems)
      pages++
      after = object(page.cursors).after
      if (overlaps) {
        after = existing?.nextCursor
        break
      }
      if (typeof after === 'string') {
        if (seen.has(after)) throw new Error('Repeated history cursor')
        seen.add(after)
      }
    } while (after && pages < 10)
    const unique = new Map(
      items.map((item) => {
        const row = object(item)
        if (typeof row.id !== 'string') throw new Error('Missing event id')
        return [row.id, item]
      })
    )
    return {
      payload: { items: [...unique.values()], nextCursor: after ?? null },
      partial: !!after,
      coverage: after
        ? 'Partial history: another page exists. Use Continue history.'
        : 'Reached the end of history exposed by the broker',
    }
  })
  await capture('timelineDetails', async () => {
    const history = object(result.get('timelineTransactions')?.payload)
    const prior = result.get('timelineDetails')?.payload
    const details = prior
      ? array(object(prior).items).filter((d) => mode === 'continue' || !object(d).error)
      : []
    const done = new Set(details.map((d) => object(d).id))
    const missing = array(history.items).filter((item) => !done.has(object(item).id))
    // Four independent read subscriptions bound load without serializing the entire history.
    const batch = missing.slice(0, 50)
    for (let offset = 0; offset < batch.length; offset += 4) {
      signal.throwIfAborted()
      const outcomes = await Promise.allSettled(
        batch.slice(offset, offset + 4).map(async (item) => {
          const id = object(item).id
          if (typeof id !== 'string') throw new Error('Missing detail id')
          try {
            return { id, response: await read('timelineDetailV2', { id }) }
          } catch (error) {
            signal.throwIfAborted()
            if (classifyError(error).category === 'authentication') throw error
            return { id, error: classifyError(error) }
          }
        })
      )
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') throw outcome.reason
        details.push(outcome.value)
      }
    }
    return {
      payload: { items: details, remaining: Math.max(0, missing.length - 50) },
      partial: missing.length > 50 || details.some((d) => !!object(d).error),
      coverage:
        missing.length > 50
          ? 'Partial event details: use Continue history.'
          : 'Attempted details for loaded events; per-event failures remain visible. Older history may still exist.',
    }
  })
}
