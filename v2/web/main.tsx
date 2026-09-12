import { Holdings } from './Holdings'
import { CompanyExposure } from './CompanyExposure'
import { DataExplorer } from './DataExplorer'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, MotionConfig } from 'motion/react'
import type { Status } from '../server/model'
import './style.css'

function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const res = await fetch('/api/status', { signal: controller.signal })
        if (!res.ok) throw new Error()
        setStatus(await res.json())
      } catch {
        if (!controller.signal.aborted)
          setError('Cannot reach the local service. Reopen Prism or reload this page.')
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [])
  async function action(path: string, body: object = {}) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Prism-Client': '1' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const fresh = await fetch('/api/status')
      if (fresh.ok) setStatus(await fresh.json())
    } catch {
      setError('Request failed. Please retry after the current operation finishes.')
    } finally {
      setPin('')
      setSubmitting(false)
    }
  }
  const busy = submitting || (!!status && !['connected', 'disconnected'].includes(status.phase))
  const snapshot = status?.snapshot
  return (
    <MotionConfig reducedMotion="user">
      <main>
        <header>
          <a className="brand" href="/">
            ◈ <span>Portfolio Prism</span>
          </a>
          <span className="badge">V2 · Local preview</span>
        </header>
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="eyebrow">YOUR PORTFOLIO, IN FOCUS</p>
          <h1>Start with what you own.</h1>
          <p className="intro">
            Connect Trade Republic to see your holdings and sourced company exposure, with visible
            gaps where evidence is incomplete.
          </p>
          <div className="grid">
            <article className="panel">
              <div className="section-title">
                <h2>Trade Republic</h2>
                <span className="status">{status?.phase.replaceAll('-', ' ') ?? 'Starting'}</span>
              </div>
              <p>
                Your PIN is used for login only. The session is saved in your system credential
                store.
              </p>
              {status?.phase === 'connected' ? (
                <div className="actions">
                  <button disabled={busy} onClick={() => void action('sync')}>
                    Refresh holdings
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void action('logout')}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void action('login', { phone, pin })
                  }}
                >
                  <label>
                    Phone number
                    <input
                      type="tel"
                      autoComplete="tel"
                      placeholder="+49…"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={busy}
                      required
                      pattern="\+[1-9][0-9]{6,14}"
                    />
                  </label>
                  <label>
                    PIN
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      disabled={busy}
                      required
                      pattern="[0-9]{4}"
                      maxLength={4}
                    />
                  </label>
                  <button disabled={busy || !status}>Connect securely</button>
                </form>
              )}
              {status?.phase === 'disconnected' && (
                <button className="secondary" disabled={busy} onClick={() => void action('logout')}>
                  Forget saved session
                </button>
              )}
              <div role="status" aria-live="polite">
                {status?.phase === 'awaiting-approval' && (
                  <p className="notice">
                    Approve this login in your Trade Republic app. This page will update
                    automatically.
                  </p>
                )}
                {status?.phase === 'syncing' && <p>Importing your positions…</p>}
              </div>
              {busy && (
                <button className="secondary" onClick={() => void action('cancel')}>
                  Cancel operation
                </button>
              )}
            </article>
            <article className="panel summary">
              <p className="eyebrow">SAVED ON THIS COMPUTER</p>
              <strong>{snapshot?.positions.length ?? '—'}</strong>
              <h2>Positions in your latest import</h2>
              <p>
                {snapshot
                  ? `Last imported ${new Date(snapshot.fetchedAt).toLocaleString()}`
                  : 'Your first successful import will appear here.'}
              </p>
              <p>
                Refreshes on startup and every 15 minutes while the local service runs. Saved data
                remains available when disconnected.
              </p>
            </article>
          </div>
          {(error || status?.error) && (
            <div role="alert" className="notice error">
              {error || status?.error}
            </div>
          )}
          {status?.sessionWarning && (
            <div role="alert" className="notice">
              {status.sessionWarning}
            </div>
          )}
          {!status?.error &&
            status?.outcome?.holdings &&
            ['failed', 'partial', 'cancelled'].includes(status.outcome.valuation) && (
              <p role="alert" className="notice">
                Last saved holdings import:{' '}
                {new Date(status.outcome.holdings.fetchedAt).toLocaleString()}. Valuation refresh{' '}
                {status.outcome.valuation}. Saved estimates still require compatible quotes.
              </p>
            )}
          <CompanyExposure />
          <Holdings revision={status?.lastDiagnostic?.at} />
        </motion.section>
        <DataExplorer
          busy={busy}
          connected={status?.phase === 'connected'}
          revision={status?.lastDiagnostic?.at}
          snapshot={snapshot}
          action={action}
        />
        <details className="panel" style={{ marginTop: 24 }}>
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
        <footer>Local storage · Read-only broker access · No trades</footer>
      </main>
    </MotionConfig>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
