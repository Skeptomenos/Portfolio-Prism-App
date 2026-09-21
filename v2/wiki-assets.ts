import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { wikiPages, wikiPageUrl } from './wiki-pages'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
type Asset = { body: string; type: string }

// Only referenced public documentation and source text can enter the bundle.
export function publicWikiReference(projectPath: string): boolean {
  return /^(README|CONTRIBUTING|AGENTS|index)\.md$/.test(projectPath) ||
    /^docs\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.md$/.test(projectPath) ||
    /^v2\/(?:README\.md|(?:server|web)\/[a-zA-Z0-9-]+\.tsx?)$/.test(projectPath)
}

export function loadWikiAssets(root = projectRoot): Map<string, Asset> {
  const assets = new Map<string, Asset>()
  const canonicalRoot = realpathSync(root)
  for (const page of wikiPages) {
    const source = resolve(root, page.source)
    const body = readFileSync(source, 'utf8').replace(
      /href="([^"]+)"/g,
      (attribute, href: string) => {
        if (href.startsWith('#') || /^https?:\/\//.test(href)) return attribute
        const [path] = href.split('#')
        const target = realpathSync(resolve(dirname(source), path))
        const projectPath = relative(canonicalRoot, target).split(sep).join('/')
        if (isAbsolute(projectPath) || !publicWikiReference(projectPath)) {
          throw new Error(`Wiki reference is not public: ${href}`)
        }
        const url = `/wiki-assets/references/${projectPath}.txt`
        assets.set(url, { body: readFileSync(target, 'utf8'), type: 'text/plain; charset=utf-8' })
        // Plain-text sources open separately; they never replace the interactive guide.
        return `href="${url}" target="_blank" rel="noopener noreferrer"`
      },
    )
    assets.set(wikiPageUrl(page.id), { body, type: 'text/html; charset=utf-8' })
  }
  return assets
}

export function wikiAssets(): Plugin {
  return {
    name: 'prism-public-wiki',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        if (!pathname.startsWith('/wiki-assets/')) return next()
        const asset = loadWikiAssets().get(pathname)
        if (!asset || !['GET', 'HEAD'].includes(req.method ?? '')) {
          res.writeHead(404)
          res.end('Wiki document not found')
          return
        }
        res.setHeader('Content-Type', asset.type)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(req.method === 'HEAD' ? undefined : asset.body)
      })
    },
    configurePreviewServer(server) {
      const buildRoot = realpathSync(resolve(server.config.root, server.config.build.outDir))
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        if (!pathname.startsWith('/wiki-assets/')) return next()
        const reference = pathname.startsWith('/wiki-assets/references/') && pathname.endsWith('.txt')
          ? pathname.slice('/wiki-assets/references/'.length, -4) : null
        const allowed = wikiPages.some(page => wikiPageUrl(page.id) === pathname) ||
          (reference !== null && publicWikiReference(reference))
        const target = resolve(buildRoot, `.${pathname}`)
        const builtPath = allowed && existsSync(target) ? relative(buildRoot, realpathSync(target)) : null
        if (!builtPath || isAbsolute(builtPath) || builtPath.startsWith(`..${sep}`) ||
            !['GET', 'HEAD'].includes(req.method ?? '')) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' })
          res.end(req.method === 'HEAD' ? undefined : 'Wiki document not found')
          return
        }
        // Serve the built file through Vite, never current source or the SPA fallback.
        res.setHeader('X-Content-Type-Options', 'nosniff')
        if (reference !== null) res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        next()
      })
    },
    generateBundle() {
      for (const [url, asset] of loadWikiAssets()) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: asset.body })
      }
    },
  }
}
