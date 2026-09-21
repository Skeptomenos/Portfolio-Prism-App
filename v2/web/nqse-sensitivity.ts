import { Decimal } from 'decimal.js'

const D = Decimal.clone({ precision: 40 })
export const nqseIsin = 'IE00BYVQ9F29'
// Dated explanatory evidence, never a composition input or current correction.
export const nqseHistoricalHedge = {
  date: '2026-01-31',
  gainsUsd: '17934000', lossesUsd: '22000', eurPerUsd: '0.8406', classNavEur: '1749942000',
  source: 'https://www.ishares.com/ch/individual/en/literature/interim-report/ishares-vii-plc-interim-report-en-ch-31-jan-26.pdf?siteEntryPassthrough=true&switchLocale=y',
  pages: 'PDF pages 65–66 and 223–224',
} as const
export function historicalHedgePercent(): string {
  const h = nqseHistoricalHedge
  return new D(h.gainsUsd).sub(h.lossesUsd).mul(h.eurPerUsd).div(h.classNavEur).mul(100).toFixed()
}
// Relative sensitivity of an already selected estimate. No assumed hedge balance,
// NAV bridge, currency conversion or corrected exposure is returned.
export function sensitivityAmount(amount: string | null, relativePercent: string): string | null {
  if (amount === null || !/^\d+(?:\.\d+)?$/.test(relativePercent.trim())) return null
  try {
    const value = new D(amount), percent = new D(relativePercent)
    if (!value.isFinite() || value.lt(0) || !percent.isFinite() || percent.lt(0) || percent.gt(100)) return null
    return value.mul(percent).div(100).toFixed()
  } catch { return null }
}
