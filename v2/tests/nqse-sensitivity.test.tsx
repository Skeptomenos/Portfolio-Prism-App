import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { historicalHedgePercent, sensitivityAmount } from '../web/nqse-sensitivity'
import { NqseUncertainty } from '../web/NqseUncertainty'

describe('NQSE uncertainty stays explanatory', () => {
  it('uses only EUR-class forward balances and the same-date FX/class NAV, not fund-wide losses', () => {
    expect(Number(historicalHedgePercent())).toBeCloseTo(0.8604186424464354, 12)
  })
  it('applies a relative scenario only to the supplied contribution', () => {
    expect(sensitivityAmount('147.9343315058641032', '1')).toBe('1.479343315058641032')
    expect(sensitivityAmount('147.9343315058641032', '5')).toBe('7.39671657529320516')
    expect(sensitivityAmount('0', '1')).toBe('0')
    expect(sensitivityAmount(null, '1')).toBeNull()
    for (const input of ['', '-1', 'NaN', 'Infinity', '101']) expect(sensitivityAmount('100', input)).toBeNull()
  })
  it('keeps unknown current error separate from a dated observation and hypothetical impact', () => {
    const html = renderToStaticMarkup(<NqseUncertainty amount="100" currency="EUR" scope="ETF contribution" />)
    expect(html).toContain('Current error margin')
    expect(html).toContain('Unknown')
    expect(html).toContain('2026-01-31')
    expect(html).toContain('0.86')
    expect(html).toContain('not a measured error range')
    expect(html).toContain('This changes no portfolio totals')
  })
  it('does not invent zero impact for missing money and does not round tiny impact to zero', () => {
    expect(renderToStaticMarkup(<NqseUncertainty amount={null} currency="EUR" scope="ETF contribution" />)).toContain('saved value missing')
    expect(renderToStaticMarkup(<NqseUncertainty amount="0.01" currency="EUR" scope="ETF contribution" />)).toContain('&lt;0.01 EUR')
  })
})
