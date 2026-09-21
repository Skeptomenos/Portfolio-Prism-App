// Capability selection reuses the application's actual regression suites. No live calls.
import { spawnSync } from 'node:child_process'
const shared = ['tests/plugin-registry.test.ts', 'tests/sdk-example.test.ts']
const suites = {
  composition: ['tests/composition-admission.test.ts', 'tests/provider-host-integration.test.ts', 'tests/provider-store.test.ts', 'tests/provider-refresh-service.test.ts', 'tests/ishares-provider.test.ts'],
  inspection: ['tests/amundi-provider.test.ts', 'tests/inspection-host-integration.test.ts', 'tests/inspection-store.test.ts'],
  broker: ['tests/event-reprocess.test.ts', 'tests/event-ledger.test.ts', 'tests/explorer.test.ts', 'tests/broker-connections.test.ts', 'tests/connection-contract.test.ts', 'tests/connection-security.test.ts', 'tests/broker-cash-retention.test.ts', 'tests/quantity-observations.test.ts'],
  view: ['tests/events-client.test.ts', 'tests/browser-view-registry.test.ts', 'tests/browser-boundary.test.ts', 'tests/financial-contracts.test.ts', 'tests/history-view-client.test.ts'],
  analytics: ['tests/financial-contracts.test.ts'],
}
const names = process.argv.slice(2)
const selected = names.length ? names : Object.keys(suites)
if (selected.some(name => !Object.hasOwn(suites, name))) {
  console.error('Choose one or more capabilities: ' + Object.keys(suites).join(', ')); process.exit(2)
}
const files = new Set(shared)
for (const name of selected) for (const file of suites[name as keyof typeof suites]) files.add(file)
console.log('Synthetic host conformance: ' + selected.join(', ') + '. Live source compatibility, independent contribution and publication are separate gates.')
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...files], { stdio: 'inherit', cwd: new URL('../../', import.meta.url) })
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
