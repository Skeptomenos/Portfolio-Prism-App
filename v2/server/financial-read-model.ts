import { createHash } from 'node:crypto'
import { Schema } from 'effect'
import { financialContractVersion, financialSchemas, type FinancialResource } from '../contracts/financial'
import type { PortfolioService } from './service'

type FinancialService = Pick<PortfolioService, 'overview' | 'exposure' | 'coverage' | 'development' | 'developmentFund' | 'diagnostics'>
export class FinancialParameterError extends Error {}
const decoders = {
  overview: Schema.decodeUnknownSync(financialSchemas.overview),
  exposure: Schema.decodeUnknownSync(financialSchemas.exposure),
  coverage: Schema.decodeUnknownSync(financialSchemas.coverage),
  development: Schema.decodeUnknownSync(financialSchemas.development),
  diagnostics: Schema.decodeUnknownSync(financialSchemas.diagnostics),
  analysis: Schema.decodeUnknownSync(financialSchemas.analysis),
  fund: Schema.decodeUnknownSync(financialSchemas.fund),
}


/** Schema decoding is an allowlist projection: extra internal fields are stripped. */
export function financialRead(service: FinancialService, resource: FinancialResource, isin?: string) {
  let input: unknown
  switch (resource) {
    case 'overview': input = service.overview(); break
    case 'exposure': input = service.exposure(); break
    case 'coverage': input = service.coverage(); break
    case 'development': input = service.development(); break
    case 'diagnostics': input = { events: service.diagnostics() }; break
    case 'analysis': input = { exposure: service.exposure(), coverage: service.coverage() }; break
    case 'fund':
      if (!isin || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw new FinancialParameterError()
      input = service.developmentFund(isin)
      if (input === null) return null
  }
  const data = decoders[resource](input)
  // Exact content identity for this read, not a durable H1 checkpoint or a fresh quote time.
  const id = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  return { contractVersion: financialContractVersion, resource, snapshot: { kind: 'live-projection' as const, id }, data }
}

export function financialRoute(url: URL, service: FinancialService): { status: number; body: object } {
  try {
    if (url.search) throw new FinancialParameterError()
    const match = /^\/api\/financial\/(overview|exposure|coverage|development|diagnostics|analysis|fund)(?:\/([A-Z0-9]+))?$/.exec(url.pathname)
    if (!match) return { status: 404, body: { error: 'Financial endpoint not found' } }
    if ((match[1] === 'fund') !== Boolean(match[2])) throw new FinancialParameterError()
    // The regex restricts this key to the explicit public resource list.
    const result = financialRead(service, match[1] as FinancialResource, match[2])
    return { status: result ? 200 : 404, body: result ?? { error: 'Saved fund not found' } }
  } catch (error) {
    return { status: error instanceof FinancialParameterError ? 400 : 500,
      body: { error: error instanceof FinancialParameterError ? 'Invalid financial request' : 'Saved financial data is unavailable or incompatible. Check the local service and retry.' } }
  }
}
