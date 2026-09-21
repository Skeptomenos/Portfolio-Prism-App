import { createHash } from 'node:crypto'
import { amundiFundIsin, amundiProvider, amundiRequestBody, amundiRequestSha256, amundiSourceUrl } from '../server/amundi-provider'
import type { InspectionEvidence } from '../server/composition-inspection'

const retrievedAt = '2026-09-17T12:00:00.000Z'

function artifact(body: string, retrieved = retrievedAt) {
  const bytes = Buffer.from(body)
  const request = {
    method: 'POST' as const,
    url: amundiSourceUrl,
    body: amundiRequestBody,
    sha256: amundiRequestSha256,
  }
  return {
    role: 'amundi-details',
    url: amundiSourceUrl,
    retrievedAt: retrieved,
    status: 200 as const,
    contentType: 'application/json',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    body: bytes.toString('base64'),
    request,
  }
}

export function inspectionResponse(date = '2026-09-16', revision = false): string {
  const rows = [
    {
      compositionCharacteristics: {
        date,
        quantity: 100,
        bbg: 'SYN EQ',
        name: revision ? 'Synthetic Equity Revision' : 'Synthetic Equity',
        weight: revision ? '0.60' : '0.6',
        currency: 'USD',
        type: 'EQUITY_ORDINARY',
        sector: 'Technology',
        isin: 'US0378331005',
        countryOfRisk: 'United States',
      },
      weight: revision ? '0.60' : '0.6',
    },
    {
      compositionCharacteristics: {
        date,
        quantity: 200,
        bbg: 'SYN BN',
        name: 'Synthetic Bank',
        weight: '0.4',
        currency: 'INR',
        type: 'EQUITY_ORDINARY',
        sector: 'Financials',
        isin: 'INE040A01034',
        countryOfRisk: 'India',
      },
      weight: '0.4',
    },
    {
      compositionCharacteristics: {
        date,
        quantity: 1,
        bbg: null,
        name: null,
        weight: '-0.0001',
        currency: 'EUR',
        type: 'CASH',
        sector: null,
        isin: null,
        countryOfRisk: null,
      },
      weight: '-0.0001',
    },
  ]
  return JSON.stringify({
    products: [{
      productId: amundiFundIsin,
      characteristics: {
        ISIN: amundiFundIsin,
        SHARE_MARKETING_NAME: 'Synthetic Amundi India Swap ETF',
        POSITION_AS_OF_DATE: date,
        REPLICATION_METHODOLOGY: 'Indirect (Unfunded swap)',
        BENCHMARK_NAME: 'Synthetic India Net TR',
        BENCHMARK_TICKER: 'SYNIND',
        FUND_SWAP_COUNTERPART: 'Synthetic Counterparty',
        FUND_BREAKDOWNS_AS_OF_DATE: date,
        FUND_FUND_NAME: 'Synthetic Amundi India Swap ETF',
      },
      composition: { totalNumberOfInstruments: rows.length, compositionData: rows },
      breakDowns: [{
        aggregationField: 'INDEX_TOP10',
        breakDownData: [{
          aggregationName: 'Synthetic Benchmark',
          weight: 0,
          adjustedWeight: '0.75',
          additionalProperties: {
            bbg: 'SYN BM',
            isin: 'US5949181045',
            type: 'EQUITY_ORDINARY',
            currency: 'USD',
            countryOfRisk: 'United States',
          },
        }],
      }],
    }],
  })
}

export function inspectionEvidence(date = '2026-09-16', revision = false): InspectionEvidence {
  const body = inspectionResponse(date, revision)
  const response = artifact(body)
  return {
    format: 'composition-inspection-evidence/1',
    providerId: amundiProvider.manifest.id,
    providerVersion: amundiProvider.manifest.version,
    contractVersion: 'composition-inspection/1',
    fundIsin: amundiFundIsin,
    publicationDate: date,
    sourceUrl: amundiSourceUrl,
    request: response.request,
    artifact: response,
  }
}
