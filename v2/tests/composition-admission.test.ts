import { expect, describe, it } from 'vitest'
import { admitComposition, checkedDate, sourceHash, validateProviderEvidence } from '../server/composition-admission'
import { decodeProviderEvidence } from '../server/composition-providers'
import { isharesProvider } from '../server/ishares-provider'
import { ProviderError, type CompositionCandidate, type ProviderEvidence } from '../server/composition-provider'
import { providerEvidence } from './provider-fixture'

const clone = <T>(value: T): T => structuredClone(value)
const validEvidence = providerEvidence
const expectCode = (fn: () => unknown, code: string) => expect(fn).toThrowError(expect.objectContaining({ code }))

describe('composition provider admission', () => {
  it('binds fund identity, publication date, artifact hash and policy versions', () => {
    const evidence = validEvidence()
    const composition = decodeProviderEvidence(evidence)
    expect(composition.fundIsin).toBe(evidence.fundIsin)
    expect(composition.asOf).toBe(evidence.publicationDate)
    expect(composition.sha256).toBe(evidence.artifacts[1].sha256)
    expect(composition.provider?.policyVersion).toBe('issuer-allocation/1')

    const wrongPolicy = clone(evidence); wrongPolicy.policyVersion = 'other/1' as typeof evidence.policyVersion
    expectCode(() => validateProviderEvidence(wrongPolicy, isharesProvider), 'version')
    const wrongFund = clone(evidence); wrongFund.fundIsin = 'IE00INVALID000'
    expectCode(() => validateProviderEvidence(wrongFund, isharesProvider), 'identity')
    const wrongDate = clone(evidence); wrongDate.publicationDate = '2026-09-11'
    expectCode(() => decodeProviderEvidence(wrongDate), 'date')
    const wrongHash = clone(evidence); wrongHash.artifacts[1].sha256 = '0'.repeat(64)
    expectCode(() => decodeProviderEvidence(wrongHash), 'format')
  })

  it('rejects duplicate rows, partial compositions and invalid registration', () => {
    const evidence = validEvidence()
    const candidate = isharesProvider.decode(evidence)
    const duplicate = clone(candidate) as unknown as CompositionCandidate
    duplicate.rows[1].sourceRow = duplicate.rows[0].sourceRow
    expectCode(() => admitComposition(duplicate, evidence), 'duplicate')

    const partial = clone(candidate) as unknown as CompositionCandidate
    partial.completeness = 'partial'
    expectCode(() => admitComposition(partial, evidence), 'partial')

    const badRegistration = clone(evidence)
    expectCode(() => decodeProviderEvidence(badRegistration, [
      { ...isharesProvider, manifest: { ...isharesProvider.manifest, contractVersion: 'composition-provider/999' as never } },
    ]), 'version')
  })

  it('preserves high precision and signed non-equity rows while rejecting negative equity', () => {
    const evidence = validEvidence()
    const candidate = isharesProvider.decode(evidence)
    expect(candidate.rows[0].marketValue).toBe('1000.123456789012345')
    expect(candidate.rows[0].weightPercent).toBe('99')

    const signedNonEquity = clone(candidate) as unknown as CompositionCandidate
    signedNonEquity.rows = [
      { ...signedNonEquity.rows[0], weightPercent: '99.000000000000000001' },
      { ...signedNonEquity.rows[1], weightPercent: '-1.000000000000000001' },
      { ...signedNonEquity.rows[1], sourceRow: 3, assetClass: 'Future', weightPercent: '2' },
    ]
    const admitted = admitComposition(signedNonEquity, evidence)
    expect(admitted.sourceAccounting?.reportedPercent).toBe('100')
    expect(admitted.sourceRows?.find(row => row.sourceRow === 2)?.weightPercent).toBe('-1.000000000000000001')
    expect(admitted.sourceRows?.find(row => row.sourceRow === 3)?.equityIdentity).toBe('not-equity')

    const negativeEquity = clone(candidate) as unknown as CompositionCandidate
    negativeEquity.rows[0].weightPercent = '-1'
    negativeEquity.rows[1].weightPercent = '101'
    expectCode(() => admitComposition(negativeEquity, evidence), 'weights')
  })

  it('keeps source date validation strict and hashes original bytes', () => {
    expect(checkedDate('2026-09-10')).toBe('2026-09-10')
    expect(() => checkedDate('2026-02-30')).toThrow()
    const bytes = new TextEncoder().encode('original bytes')
    expect(sourceHash(bytes)).toMatch(/^[a-f0-9]{64}$/)
    const evidence = validEvidence()
    const mismatchedCandidate = isharesProvider.decode(evidence)
    mismatchedCandidate.asOf = '2026-09-09'
    expectCode(() => admitComposition(mismatchedCandidate, evidence), 'date')
  })
})
