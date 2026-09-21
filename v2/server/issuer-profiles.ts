import type { IssuerProfile } from './iusa-qualification'

const terms = 'https://www.ishares.com/uk/individual/en/compliance/terms-and-conditions'
export const issuerProfiles: Readonly<Record<string, IssuerProfile>> = {
  IE0031442068: { fundIsin:'IE0031442068', productId:'251900', fundName:'iShares Core S&P 500 UCITS ETF USD (Dist)', currency:'USD', ticker:'IUSA', sourceKind:'columnar', productUrl:'https://www.ishares.com/uk/individual/en/products/251900/ishares-sp-500-ucits-etf-inc-fund', termsUrl:terms },
  IE00B4L5Y983: { fundIsin:'IE00B4L5Y983', productId:'251882', fundName:'iShares Core MSCI World UCITS ETF', currency:'USD', ticker:'SWDA', sourceKind:'columnar', productUrl:'https://www.ishares.com/uk/individual/en/products/251882/ishares-core-msci-world-ucits-etf', termsUrl:terms },
  IE00B53SZB19: { fundIsin:'IE00B53SZB19', productId:'253741', fundName:'iShares NASDAQ 100 UCITS ETF', currency:'USD', ticker:'CNDX', sourceKind:'columnar', productUrl:'https://www.ishares.com/uk/individual/en/products/253741/ishares-nasdaq-100-ucits-etf-acc-fund', termsUrl:terms },
  IE00BYVQ9F29: { fundIsin:'IE00BYVQ9F29', productId:'304353', fundName:'iShares NASDAQ 100 UCITS ETF', shareClassName:'iShares NASDAQ 100 UCITS ETF EUR Hedged (Acc)', currency:'EUR', ticker:'NQSE', sourceKind:'columnar', productUrl:'https://www.ishares.com/uk/individual/en/products/304353/ishares-nasdaq-100-ucits-etf', termsUrl:terms,
    estimateLimitation: {
      qualifier: 'Underlying-weight estimate; class hedge adjustment unknown, not included in the numerical remainder.',
      nextAction: 'Obtain dated NQSE class-specific security weights or the same-date attributable-underlying / class-NAV ratio with currency, denominator and hedge treatment.',
    } },
  IE00B3WJKG14: { fundIsin:'IE00B3WJKG14', productId:'280510', fundName:'iShares S&P 500 Information Technology Sector UCITS ETF', currency:'USD', ticker:'IUIT', sourceKind:'columnar', productUrl:'https://www.ishares.com/uk/individual/en/products/280510/ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-fund', termsUrl:terms },
  DE000A0F5UF5: { fundIsin:'DE000A0F5UF5', productId:'251896', fundName:'iShares NASDAQ-100 UCITS ETF (DE)', currency:'USD', ticker:'EXXT', sourceKind:'legacy', productUrl:'https://www.ishares.com/de/privatanleger/de/produkte/251896/ishares-nasdaq100-ucits-etf-de-fund', termsUrl:terms },
}
export const issuerProfile = (isin: string) => issuerProfiles[isin]
