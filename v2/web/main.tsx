import { ConnectionList } from './ConnectionList'
import { ConnectionPanel } from './ConnectionPanel'
import { browserViews, financialClient } from './views/bundled'
import { RegisteredViewHost } from './views/registry'
import { DataExplorer } from './DataExplorer'
import { CoverageSummary, useCoverage } from './CoverageSummary'
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, MotionConfig } from 'motion/react'
import type { Status } from '../server/model'
import './style.css'
import { useRoute } from './navigation'

type View = string
type IssuerRefreshStatus = {
  active: boolean
  automatic: boolean
  currentFundIsin: string | null
  attempts: Record<string, { id: string; status: string; outcome: string; resolution: string; at: string }>
  warning: string | null
}

const views: { id: View; label: string }[] = [
  { id: 'data', label: 'Data & connections', order: 50 },
  ...browserViews.entries.map(entry => ({ id: entry.contribution.route.id, label: entry.contribution.route.label, order: entry.contribution.route.order ?? 60 })),
].sort((a, b) => a.order - b.order)
const routeMeta: Record<View, { eyebrow: string; title: string }> = {
  data: { eyebrow: 'TRADE REPUBLIC · SOURCE DATA', title: 'Data & connections' },
  ...Object.fromEntries(browserViews.entries.map(entry => [entry.contribution.route.id, { eyebrow: entry.contribution.route.eyebrow, title: entry.contribution.route.label }])),
}

function Navigation({ view, pageLabel }: { view: View; pageLabel: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const brand = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 900px)')
    const resize = () => {
      if (
        breakpoint.matches &&
        root.current?.querySelector('#navigation-links')?.contains(document.activeElement)
      )
        toggle.current?.focus()
      if (!breakpoint.matches && document.activeElement === toggle.current) brand.current?.focus()
      setOpen(false)
    }
    breakpoint.addEventListener('change', resize)
    return () => breakpoint.removeEventListener('change', resize)
  }, [])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        toggle.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  const links = (items: typeof views) =>
    items.map((item) => (
      <a
        key={item.id}
        className={`nav-link ${view === item.id ? 'active' : ''}`}
        href={`#/${item.id}`}
        aria-current={view === item.id ? 'page' : undefined}
        onClick={() => setOpen(false)}
      >
        {item.label}
      </a>
    ))
  return (
    <aside
      className="sidebar"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <a
        ref={brand}
        className="brand"
        href="#portfolio"
        aria-label="Portfolio Prism home"
        onClick={() => setOpen(false)}
      >
        <span className="brand-mark" aria-hidden="true">
          ◈
        </span>
        <span className="brand-full">Portfolio Prism</span>
        <span className="brand-short">Prism</span>
      </a>
      <p className="sidebar-caption">Local portfolio analysis</p>
      <button
        ref={toggle}
        className="navigation-toggle"
        type="button"
        aria-label={`Navigation menu, current page: ${pageLabel}`}
        aria-expanded={open}
        aria-controls="navigation-links"
        onClick={() => setOpen(!open)}
      >
        <span className="navigation-current">{pageLabel}</span>
        <span className="navigation-menu-label">
          Menu <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      <div id="navigation-links" className="navigation-links" data-open={open}>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {links(views.slice(0, 3))}
        </nav>
        <nav className="utility-nav" aria-label="Utilities">
          {links(views.slice(3))}
        </nav>
      </div>
      <div className="sidebar-footer">
        <span className="badge">V2 · local</span>
        <p>Read-only broker access · No trades</p>
      </div>
    </aside>
  )
}

function Diagnostics({ status }: { status: Status | null }) {
  return (
    <details className="panel diagnostics">
      <summary>Local diagnostics</summary>
      <p>
        Connection attempts are recorded on this computer. Credentials and account payloads are
        excluded.
      </p>
      {status?.lastDiagnostic && (
        <p>
          Latest: {status.lastDiagnostic.stage} · {status.lastDiagnostic.event} ·{' '}
          {status.lastDiagnostic.category}
          {status.lastDiagnostic.httpStatus !== undefined
            ? ` · HTTP ${status.lastDiagnostic.httpStatus}`
            : ''}
        </p>
      )}
      <a href="/api/diagnostics" target="_blank" rel="noreferrer">
        Open diagnostic history
      </a>
    </details>
  )
}

function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [issuerRefresh, setIssuerRefresh] = useState<IssuerRefreshStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [actionPath, setActionPath] = useState('')
  const pending = useRef(false)
  const epoch = useRef(0)
  const [submitting, setSubmitting] = useState(false)
  const route = useRoute()
  const fundIsin = route.path.startsWith('/fund/') ? route.path.slice(6) : undefined
  const securityIsin = route.path.startsWith('/security/') ? route.path.slice(10) : undefined
  const view: View = fundIsin
    ? 'development'
    : securityIsin
      ? 'breakdown'
      : (views.find((item) => '/' + item.id === route.path)?.id ?? 'portfolio')
  const registeredView = browserViews.route(view)
  const showCoverage = registeredView?.contribution.route.coverage ?? false
  const coverage = useCoverage(showCoverage, financialClient)
  const needsService = registeredView?.contribution.route.needsService ?? true

  useEffect(() => {
    if (!needsService) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const version = epoch.current
      try {
        const response = await fetch('/api/status', { signal: controller.signal })
        if (!response.ok) throw new Error()
        const fresh: Status = await response.json()
        const issuerResponse = await fetch('/api/compositions/status', { signal: controller.signal })
        if (issuerResponse.ok) setIssuerRefresh(await issuerResponse.json())
        if (version === epoch.current && !pending.current) {
          setStatus(fresh)
          setServiceError(null)
        }
      } catch {
        if (!controller.signal.aborted && version === epoch.current && !pending.current)
          setServiceError('Cannot reach the local service. Reopen Prism or reload this page.')
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [needsService])

  async function action(path: string, body: object = {}) {
    if (pending.current) return
    pending.current = true
    epoch.current += 1
    setActionPath(path)
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Prism-Client': '1' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(response.status === 409 ? 'busy' : 'request')
      const fresh = await fetch('/api/status')
      if (!fresh.ok) throw new Error('status')
      setStatus(await fresh.json())
      setServiceError(null)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'busy'
          ? 'An operation is already running. Wait for it to finish or cancel it.'
          : 'Could not confirm the request. Check the connection state before retrying; saved holdings remain available.'
      )
    } finally {
      epoch.current += 1
      pending.current = false
      setSubmitting(false)
    }
  }

  const busy = submitting || (!!status && !['connected', 'disconnected'].includes(status.phase))
  const advancedError = ['extract', 'history/continue'].includes(actionPath)
  const meta = routeMeta[view]

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault()
            const main = document.getElementById('main-content')
            main?.focus({ preventScroll: true })
            main?.scrollIntoView({ block: 'start' })
          }}
        >
          Skip to content
        </a>
        <Navigation
          key={route.path}
          view={view}
          pageLabel={fundIsin ? 'ETF detail' : securityIsin ? 'Security detail' : meta.title}
        />
        <main id="main-content" className="content" tabIndex={-1}>
          <header className="topbar">
            <div>
              <p className="eyebrow">{meta.eyebrow}</p>
              <h1 tabIndex={-1}>
                {fundIsin ? 'ETF detail' : securityIsin ? 'Security detail' : meta.title}
              </h1>
            </div>
            <span className="badge">Evidence remains visible</span>
          </header>
          {serviceError && needsService && (
            <p role="alert" className="notice error">
              {serviceError}
            </p>
          )}
          <motion.div
            key={route.path}
            className="route-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {showCoverage && <CoverageSummary report={coverage.report} error={coverage.error} compact={!!fundIsin || !!securityIsin} />}
            {registeredView && <RegisteredViewHost entry={registeredView} params={route.params} presentation={{
              revision: status?.lastDiagnostic?.at, fundIsin, securityIsin, coverage: coverage.report,
              connection: <ConnectionPanel compact status={status} busy={busy} error={advancedError ? null : error} action={action} cancelling={submitting && actionPath === 'cancel'} />,
            }} />}
            {view === 'data' && (
              <>
                <ConnectionPanel
                  status={status}
                  busy={busy}
                  error={advancedError ? null : error}
                  action={action}
                  cancelling={submitting && actionPath === 'cancel'}
                />
                <ConnectionList />
                <section className="panel composition-actions">
                  <h2>ETF compositions</h2>
                  <p>
                    Issuer refresh checks each held supported fund in sequence. Saved compositions
                    remain available when a source is unavailable.
                  </p>
                  <p className="refresh-policy">
                    {issuerRefresh?.active
                      ? `Refreshing ${issuerRefresh.currentFundIsin ?? 'held funds'}…`
                      : issuerRefresh?.warning ?? 'No issuer refresh is running.'}
                  </p>
                  <div className="connection-controls">
                    <button className="primary-action" type="button" disabled={issuerRefresh?.active} onClick={() => void action('compositions/refresh')}>
                      Refresh held funds
                    </button>
                    {issuerRefresh?.active && <button className="secondary" type="button" onClick={() => void action('compositions/cancel')}>Cancel refresh</button>}
                  </div>
                  {issuerRefresh && Object.keys(issuerRefresh.attempts).length > 0 && (
                    <ul className="refresh-attempts" aria-label="Issuer refresh attempts">
                      {Object.entries(issuerRefresh.attempts).map(([fund, attempt]) => (
                        <li key={fund}>
                          <span className="mono">{fund}</span> · {attempt.outcome} · {attempt.at}
                          {attempt.status === 'failed' ? ` · ${attempt.resolution} · diagnostic ${attempt.id}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  <a href="#/breakdown">Review selected ETF composition →</a>
                </section>
                <details className="panel advanced-data">
                  <summary>Advanced data</summary>
                  <p>
                    Inspect saved broker responses or extract the full broker history. Extraction is
                    separate from portfolio sync and ETF composition refresh.
                  </p>
                  {advancedError && error && (
                    <p role="alert" className="notice error">
                      {error}
                    </p>
                  )}
                  {status?.lastDiagnostic?.operation === 'extraction' && status.error && (
                    <p role="alert" className="notice error">
                      {status.error}
                    </p>
                  )}
                  <DataExplorer
                    busy={busy}
                    connected={status?.connected ?? status?.phase === 'connected'}
                    revision={status?.lastDiagnostic?.at}
                    snapshot={status?.snapshot}
                    action={action}
                  />
                  <Diagnostics status={status} />
                </details>
              </>
            )}
          </motion.div>
          <footer>
            Saved locally · Source dates stay separate from retrieval dates · No trades
          </footer>
        </main>
      </div>
    </MotionConfig>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
