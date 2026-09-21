import { expect, it } from 'vitest'
import { selectQuoteListings } from '../server/quote-listings'

const isin = 'US0378331005'
const listing = (slug: string, currencyId = 'EUR', active: unknown = true) => ({ slug, currencyId, active })

it('rejects an instrument identity mismatch', () => {
  expect(selectQuoteListings(isin, { isin: 'US88160R1014', listings: [listing('LSX')] }))
    .toEqual({ candidates: [], reason: 'instrument-identity-mismatch' })
  expect(selectQuoteListings(isin, [])).toEqual({ candidates: [], reason: 'instrument-identity-mismatch' })
})

it('rejects duplicate venues and conflicting active currencies', () => {
  expect(selectQuoteListings(isin, { isin, listings: [listing('BHS'), listing('BHS')] }))
    .toEqual({ candidates: [], reason: 'duplicate-venue' })
  expect(selectQuoteListings(isin, { isin, listings: [listing('BHS', 'EUR'), listing('B2C', 'BTC')] }))
    .toEqual({ candidates: [], reason: 'conflicting-active-currencies' })
})

it('preserves LSX and limits same-currency fallbacks', () => {
  expect(selectQuoteListings(isin, { isin, listings: [listing('LEX'), listing('LSX'), listing('BHS'), listing('B2C')] }))
    .toEqual({ candidates: [{ venue: 'LSX', currency: 'EUR' }, { venue: 'BHS', currency: 'EUR' }], reason: null })
})

it('orders BTC-like BHS/B2C venues before lexical fallbacks', () => {
  expect(selectQuoteListings(isin, { isin, listings: [listing('ZZZ', 'BTC'), listing('B2C', 'BTC'), listing('AAA', 'BTC'), listing('BHS', 'BTC')] }))
    .toEqual({ candidates: [{ venue: 'BHS', currency: 'BTC' }, { venue: 'B2C', currency: 'BTC' }], reason: null })
})

it('uses a consistent active primary exchange before BHS/B2C', () => {
  expect(selectQuoteListings(isin, { isin, primaryExchange: 'AAA', listings: [listing('BHS'), listing('AAA'), listing('ZZZ')] }))
    .toEqual({ candidates: [{ venue: 'AAA', currency: 'EUR' }, { venue: 'BHS', currency: 'EUR' }], reason: null })
})

it('reports missing metadata and all-inactive listings safely', () => {
  expect(selectQuoteListings(isin, { isin, listings: [listing('LSX', 'unknown')] })).toEqual({ candidates: [], reason: 'listing-metadata-missing' })
  expect(selectQuoteListings(isin, { isin, listings: [listing('LSX', 'EUR', 'unknown')] })).toEqual({ candidates: [], reason: 'listing-metadata-missing' })
  expect(selectQuoteListings(isin, { isin, listings: [listing('LSX', 'EUR', false)] })).toEqual({ candidates: [], reason: 'all-listings-inactive: obtain an active listing for the exact instrument' })
})
