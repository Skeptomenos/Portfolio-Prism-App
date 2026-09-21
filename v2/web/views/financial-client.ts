import { Schema } from 'effect'
import { financialEnvelope, financialSchemas, type FinancialModels, type FinancialResource } from '../../contracts/financial'
export type AnalysisInput = FinancialModels['analysis']
export interface AnalysisSnapshot { data: AnalysisInput; snapshot: { readonly kind: 'live-projection'; readonly id: string } }
export interface FinancialClient {
  overview(signal: AbortSignal): Promise<FinancialModels['overview']>
  exposure(signal: AbortSignal): Promise<FinancialModels['exposure']>
  coverage(signal: AbortSignal): Promise<FinancialModels['coverage']>
  development(signal: AbortSignal): Promise<FinancialModels['development']>
  fund(isin: string, signal: AbortSignal): Promise<FinancialModels['fund']>
  diagnostics(signal: AbortSignal): Promise<FinancialModels['diagnostics']>
  analysis(signal: AbortSignal): Promise<AnalysisSnapshot>
}
export interface ExposureCommands { refresh(signal?: AbortSignal): Promise<void> }
export function createFinancialClient(request: typeof fetch = fetch): FinancialClient {
  async function read<A, I>(resource: FinancialResource, schema: Schema.Schema<A, I>, signal: AbortSignal, suffix = '') {
    const response = await request(`/api/financial/${resource}${suffix}`, { signal, credentials: 'same-origin', redirect: 'error' })
    if (!response.ok) throw new Error('Saved financial data could not load. Check the local service and retry.')
    try { return Schema.decodeUnknownSync(financialEnvelope(resource, schema))(await response.json()) }
    catch { throw new Error('The financial read contract is incompatible or malformed. Update the local service and reload.') }
  }
  return {
    overview: async signal => (await read('overview', financialSchemas.overview, signal)).data,
    exposure: async signal => (await read('exposure', financialSchemas.exposure, signal)).data,
    coverage: async signal => (await read('coverage', financialSchemas.coverage, signal)).data,
    development: async signal => (await read('development', financialSchemas.development, signal)).data,
    diagnostics: async signal => (await read('diagnostics', financialSchemas.diagnostics, signal)).data,
    analysis: async signal => { const value = await read('analysis', financialSchemas.analysis, signal); return { data: value.data, snapshot: value.snapshot } },
    fund: async (isin, signal) => {
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw new Error('Invalid fund identifier')
      const value = (await read('fund', financialSchemas.fund, signal, `/${isin}`)).data
      if (value.isin !== isin) throw new Error('Saved fund identity does not match the request')
      return value
    },
  }
}
/** Host-granted, fixed command; no arbitrary endpoint or credentials accepted. */
export function createExposureCommands(request: typeof fetch = fetch): ExposureCommands {
  return { async refresh(signal) {
    const response = await request('/api/composition/refresh', { method: 'POST', signal, redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Prism-Client': '1' }, body: '{}' })
    if (!response.ok) throw new Error('Composition refresh could not start')
  } }
}
