import { mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build, preview } from 'vite'
import { expect, it } from 'vitest'

it('serves built Wiki documents and returns 404 before SPA fallback for missing or private assets', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'prism-wiki-build-'))
  let server: Awaited<ReturnType<typeof preview>> | undefined
  try {
    await build({ configFile: resolve('vite.config.ts'), logLevel: 'silent', build: { outDir, emptyOutDir: true } })
    server = await preview({ configFile: resolve('vite.config.ts'), logLevel: 'silent', build: { outDir },
      preview: { host: '127.0.0.1', port: 0, open: false } })
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Preview did not bind a port')
    const origin = `http://127.0.0.1:${address.port}`
    const guide = await fetch(`${origin}/wiki-assets/architecture.html`)
    expect(guide.status).toBe(200)
    expect(await guide.text()).toContain('data-scenario=')
    const source = await fetch(`${origin}/wiki-assets/references/AGENTS.md.txt`)
    expect(source.status).toBe(200)
    expect(source.headers.get('content-type')).toContain('text/plain')
    expect(source.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await source.text()).toContain('# Portfolio Prism')
    for (const path of ['missing.html', 'references/_planning/secret.md.txt', 'references/v2/.env.txt',
      'references/docs/missing.md.txt']) {
      const response = await fetch(`${origin}/wiki-assets/${path}`)
      expect(response.status, path).toBe(404)
      expect(await response.text()).toBe('Wiki document not found')
    }
    expect((await fetch(`${origin}/wiki-assets/architecture.html`, { method: 'POST' })).status).toBe(404)
    const head = await fetch(`${origin}/wiki-assets/missing.html`, { method: 'HEAD' })
    expect(head.status).toBe(404)
    expect(await head.text()).toBe('')
    // A missing emitted file must not be replaced with current checkout content.
    unlinkSync(join(outDir, 'wiki-assets/architecture.html'))
    expect((await fetch(`${origin}/wiki-assets/architecture.html`)).status).toBe(404)
    const app = await fetch(`${origin}/`)
    expect(app.status).toBe(200)
    expect(await app.text()).toContain('id="root"')
  } finally {
    if (server) await new Promise<void>((done, reject) => server!.httpServer.close(error => error ? reject(error) : done()))
    rmSync(outDir, { recursive: true, force: true })
  }
}, 30_000)
