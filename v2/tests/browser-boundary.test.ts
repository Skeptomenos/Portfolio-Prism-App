import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { build } from 'vite'

it('bundles views without server execution, credentials, storage or synthetic portfolio fixtures', async () => {
  const modules = new Set<string>()
  await build({ logLevel: 'silent', build: { write: false }, plugins: [{
    name: 'verify-browser-boundary',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk')
        for (const id of Object.keys(chunk.modules)) modules.add(id)
    },
  }] })
  expect([...modules].some(id => id.endsWith('/web/views/History.tsx'))).toBe(true)
  expect([...modules].some(id => id.endsWith('/web/views/AmundiPanel.tsx'))).toBe(true)
  for (const name of ['Holdings', 'CompanyExposure', 'DevelopmentProgress']) expect([...modules].some(id => id.endsWith(`/web/${name}.tsx`))).toBe(true)
  expect([...modules].some(id => id.endsWith('/web/views/ContributionMix.tsx'))).toBe(true)
  expect([...modules].filter(id => /\/server\/|\/tests\/fixtures\/|@napi-rs\/keyring|trade-republic-sdk|node:sqlite/.test(id))).toEqual([])
}, 30_000)

it('financial consumers depend on public contracts rather than internal server types', () => {
  for (const file of ['Holdings.tsx', 'CompanyExposure.tsx', 'DevelopmentProgress.tsx', 'CoverageSummary.tsx'])
    expect(readFileSync(new URL('../web/' + file, import.meta.url), 'utf8')).not.toMatch(/from ['"].*server\//)
})


it('bundles the public SDK example without its backend, fixture or host support', async () => {
  const modules = new Set<string>()
  await build({ logLevel: 'silent', build: { write: false, rollupOptions: { input: 'examples/synthetic-source/index.html' } }, plugins: [{
    name: 'verify-sdk-example-boundary',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk')
        for (const id of Object.keys(chunk.modules)) modules.add(id)
    },
  }] })
  expect([...modules].some(id => id.endsWith('/examples/synthetic-source/browser.tsx'))).toBe(true)
  expect([...modules].filter(id => /\/server\/|\/sdk\/server\.|\/sdk\/conformance\/|\/tests\/|@napi-rs\/keyring|trade-republic-sdk|node:sqlite|\/synthetic-source\/(fixture|host|server)\./.test(id))).toEqual([])
}, 30_000)
