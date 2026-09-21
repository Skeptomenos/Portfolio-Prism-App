import { expect, it } from 'vitest'
import { issuerGroups } from '../server/issuer-relationships'
import type { CompanyExposure } from '../server/exposure'
const row = (isin: string, currency: string | null, value: string | null): CompanyExposure => ({
  isin, name: 'Alphabet lookalike', currency, direct: value ?? '0', indirect: '0', knownTotal: value ?? '0', percentOfPriced: null,
  contributions: [{ kind: 'direct', positionIsin: isin, account: 'synthetic', value, positionValue: value, weightPercent: '100', quoteAt: null, quality: 'synthetic' }],
})
it('groups only the two evidenced ISINs in each currency without modifying security contributions', () => {
  const rows = [row('US02079K3059', 'EUR', '100.1234567890123456789'), row('US02079K1079', 'EUR', '5'), row('US02079K1079', 'USD', '9'), row('US0378331005', 'EUR', '200')]
  const before = JSON.stringify(rows), groups = issuerGroups(rows)
  expect(groups).toHaveLength(2)
  expect(groups.find(group => group.currency === 'EUR')?.knownTotal).toBe('105.1234567890123456789')
  expect(groups.find(group => group.currency === 'USD')?.knownTotal).toBe('9')
  expect(groups[0].members.map(member => member.isin)).not.toContain('US0378331005')
  expect(JSON.stringify(rows)).toBe(before)
})
it('preserves unknown contributions and missing currency without turning unknown into zero', () => {
  const groups = issuerGroups([row('US02079K3059', null, null), row('US02079K1079', 'EUR', '5'), row('US02079K3059', 'EUR', null)])
  expect(groups.find(group => group.currency === null)).toMatchObject({ knownTotal: null, unknownContributions: 1 })
  expect(groups.find(group => group.currency === 'EUR')).toMatchObject({ knownTotal: '5', unknownContributions: 1 })
})

it('groups the two evidenced HEICO classes without merging lookalikes or currencies', () => {
  const rows = [row('US4228061093', 'EUR', '17.1234567890123456789'), row('US4228062083', 'EUR', '8.9876543210987654321'), row('US4228062083', 'USD', '3'), row('US0378331005', 'EUR', '90'), row('US4228061093', null, null)]
  const before = JSON.stringify(rows)
  const groups = issuerGroups(rows)
  expect(groups).toHaveLength(3)
  expect(groups.find(group => group.currency === 'EUR')).toMatchObject({ issuerId: 'lei:529900O1DTDLCJ7L0I14', knownTotal: '26.111111110111111111', unknownContributions: 0 })
  expect(groups.find(group => group.currency === null)).toMatchObject({ knownTotal: null, unknownContributions: 1 })
  expect(groups.find(group => group.currency === 'USD')?.knownTotal).toBe('3')
  expect(JSON.stringify(rows)).toBe(before)
  expect(groups[0].evidence.scope).toContain('lapsed')
})

it('keeps legacy identity policy available and rejects unknown policy versions', () => {
  const rows = [row('US02079K3059', 'EUR', '1'), row('US4228061093', 'EUR', '2'), row('US4228062083', 'EUR', '3')]
  expect(issuerGroups(rows, 'alphabet-equity-classes/2026-09-20.1')).toHaveLength(1)
  expect(issuerGroups(rows)).toHaveLength(2)
  expect(() => issuerGroups(rows, 'unknown/1')).toThrow('Unsupported identity policy')
})
