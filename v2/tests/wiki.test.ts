import { describe, expect, it } from 'vitest'
import { loadWikiAssets, publicWikiReference } from '../wiki-assets'
import { wikiPages, wikiPageUrl } from '../wiki-pages'

describe('public Wiki packaging', () => {
  it('packages the canonical HTML and every local source link without private assets', () => {
    const assets = loadWikiAssets()
    for (const page of wikiPages) {
      const html = assets.get(wikiPageUrl(page.id))!
      expect(html.type).toContain('text/html')
      expect(html.body).toContain('data-scenario=')
      expect(html.body).toContain('data-plugin=')
      for (const [, href] of html.body.matchAll(/href="([^"]+)"/g)) {
        if (href.startsWith('#') || href.startsWith('https://')) continue
        expect(assets.has(href), href).toBe(true)
        expect(assets.get(href)?.type).toContain('text/plain')
      }
    }
    expect(assets.size).toBeGreaterThan(20)
    for (const key of assets.keys()) expect(key).not.toMatch(/_planning|node_modules|\.env|\.sqlite/)
  })

  it('rejects private paths and arbitrary files from source references', () => {
    for (const path of ['../README.md', '/README.md', '_planning/strategy/plan.md', 'v2/.env',
      'v2/server/private.sqlite', 'v2/node_modules/readme.md', '.git/config', 'docs/../../private.md']) {
      expect(publicWikiReference(path), path).toBe(false)
    }
    expect(publicWikiReference('docs/plugin-architecture.md')).toBe(true)
    expect(publicWikiReference('v2/web/CoverageSummary.tsx')).toBe(true)
  })
})
