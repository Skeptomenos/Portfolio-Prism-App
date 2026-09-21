/** A bounded selection of Trade Republic quote venues for one instrument. */
export interface QuoteListingCandidate {
  venue: string
  currency: string
}

export type QuoteListingReason =
  | 'instrument-identity-mismatch'
  | 'listing-metadata-missing'
  | 'duplicate-venue'
  | 'conflicting-active-currencies'
  | 'all-listings-inactive: obtain an active listing for the exact instrument'

export type QuoteListingSelection =
  | { candidates: readonly QuoteListingCandidate[]; reason: null }
  | { candidates: readonly []; reason: QuoteListingReason }

const venuePattern = /^[A-Z][A-Z0-9._-]{1,15}$/
const currencyPattern = /^[A-Z]{3}$/

type RawTradeRepublicListing = { slug?: unknown; currencyId?: unknown; active?: unknown }

/**
 * Select at most two active, same-currency quote listings from an untrusted
 * Trade Republic instrument response. No venue or symbol is inferred from the ISIN.
 */
export function selectQuoteListings(exactIsin: string, raw: unknown): QuoteListingSelection {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(exactIsin) || !raw || typeof raw !== 'object')
    return { candidates: [], reason: 'instrument-identity-mismatch' }

  const response = raw as { isin?: unknown; listings?: unknown; primaryExchange?: unknown }
  if (response.isin !== exactIsin) return { candidates: [], reason: 'instrument-identity-mismatch' }
  if (!Array.isArray(response.listings)) return { candidates: [], reason: 'listing-metadata-missing' }

  const active: QuoteListingCandidate[] = []
  for (const value of response.listings as unknown[]) {
    if (!value || typeof value !== 'object') return { candidates: [], reason: 'listing-metadata-missing' }
    const listing = value as RawTradeRepublicListing
    if (typeof listing.active !== 'boolean')
      return { candidates: [], reason: 'listing-metadata-missing' }
    if (!listing.active) continue
    if (typeof listing.slug !== 'string' || !venuePattern.test(listing.slug) ||
        typeof listing.currencyId !== 'string' || !currencyPattern.test(listing.currencyId))
      return { candidates: [], reason: 'listing-metadata-missing' }
    active.push({ venue: listing.slug, currency: listing.currencyId })
  }
  if (!active.length)
    return { candidates: [], reason: 'all-listings-inactive: obtain an active listing for the exact instrument' }

  const seen = new Set<string>()
  for (const candidate of active) {
    if (seen.has(candidate.venue)) return { candidates: [], reason: 'duplicate-venue' }
    seen.add(candidate.venue)
  }

  const currencies = new Set(active.map(candidate => candidate.currency))
  const lsx = active.find(candidate => candidate.venue === 'LSX')
  const primary = typeof response.primaryExchange === 'string' && venuePattern.test(response.primaryExchange)
    ? active.find(candidate => candidate.venue === response.primaryExchange)
    : undefined
  const preferred = lsx ?? primary
  const targetCurrency = preferred?.currency
  if (!targetCurrency && currencies.size > 1)
    return { candidates: [], reason: 'conflicting-active-currencies' }

  const sameCurrency = active.filter(candidate => candidate.currency === (targetCurrency ?? active[0].currency))
  const order = (candidate: QuoteListingCandidate) =>
    candidate.venue === 'LSX' ? 0 :
    candidate.venue === response.primaryExchange ? 1 :
    candidate.venue === 'BHS' ? 2 :
    candidate.venue === 'B2C' ? 3 : 4
  sameCurrency.sort((a, b) => order(a) - order(b) || a.venue.localeCompare(b.venue))
  return { candidates: sameCurrency.slice(0, 2), reason: null }
}
