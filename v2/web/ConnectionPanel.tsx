import React, { useEffect, useRef, useState } from 'react'
import type { Status } from '../server/model'

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : 'Not recorded'
export function ConnectionPanel({
  status,
  busy,
  error,
  action,
  compact = false,
}: {
  status: Status | null
  busy: boolean
  error: string | null
  action: (path: string, body?: object) => Promise<void>
  compact?: boolean
}) {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const phoneInput = useRef<HTMLInputElement>(null)
  const focused = useRef(false)
  const connected = status?.connected ?? status?.phase === 'connected'
  const extraction = status?.activeOperation === 'extraction'
  const attempt = status?.lastPortfolioAttempt
  const outcome = attempt ? attempt.outcome : status?.outcome
  const syncProblem =
    !!outcome?.holdings && ['partial', 'failed', 'cancelled'].includes(outcome.valuation)
  const connectionError =
    status?.lastDiagnostic?.operation !== 'extraction' || !connected ? status?.error : null
  const reconnect = !connected && !!(connectionError || attempt?.category === 'authentication')
  const retry = connected && !!(connectionError || syncProblem || error)
  const connectLabel = reconnect ? 'Reconnect & sync' : 'Connect & sync'
  const pending = busy && !extraction
  const step =
    status?.phase === 'awaiting-approval'
      ? 'Approve in the Trade Republic phone app. Import starts automatically after approval.'
      : status?.phase === 'connecting'
        ? 'Connecting to Trade Republic…'
        : status?.phase === 'restoring'
          ? 'Restoring the saved connection…'
          : status?.phase === 'syncing' && !extraction
            ? 'Importing positions and refreshing saved quotes and cash…'
            : busy && !extraction
              ? 'Sending request…'
              : null
  const result =
    !pending &&
    (syncProblem
      ? `Holdings saved. Valuation refresh ${outcome!.valuation}; estimates may be incomplete.`
      : attempt?.event === 'failed' || attempt?.event === 'cancelled'
        ? `Portfolio sync ${attempt.event}. Previous saved holdings remain available.`
        : attempt?.event === 'succeeded' && attempt.outcome?.holdings
          ? 'Portfolio updated.'
          : null)
  useEffect(() => {
    if (
      compact ||
      !status ||
      connected ||
      focused.current ||
      !new URLSearchParams(location.hash.split('?')[1]).has('connect')
    )
      return
    focused.current = true
    const frame = requestAnimationFrame(() => phoneInput.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [compact, !!status, connected])
  return (
    <section
      className={compact ? 'connection-summary' : 'panel connection-panel'}
      aria-label="Trade Republic connection"
    >
      <div className="connection-heading">
        <strong>Trade Republic</strong>
        <span className="status">
          {status ? (connected ? 'Connected' : 'Disconnected') : 'Checking connection…'}
        </span>
      </div>
      <div className="connection-controls">
        <div className="sync-dates">
          <span>
            Last successful sync:{' '}
            <time dateTime={status?.lastSuccessfulSyncAt ?? undefined}>
              {date(status?.lastSuccessfulSyncAt)}
            </time>
          </span>
          {!compact && (
            <span>
              Saved holdings:{' '}
              <time dateTime={status?.snapshot?.fetchedAt}>
                {date(status?.snapshot?.fetchedAt)}
              </time>
              . Quote and composition dates are separate.
            </span>
          )}
        </div>
        {connected ? (
          <button disabled={busy || !status} onClick={() => void action('sync')}>
            {retry ? 'Retry sync' : 'Sync portfolio'}
          </button>
        ) : compact && !busy ? (
          <a className="primary-action" href="#/data?connect=1">
            {connectLabel}
          </a>
        ) : null}
      </div>
      {compact && (
        <p className="sync-saved">
          {status?.snapshot
            ? 'Saved holdings remain available offline.'
            : 'No saved portfolio yet.'}
        </p>
      )}
      <div role="status" aria-live="polite">
        {step && <p className="notice">{step}</p>}
        {extraction && <p>Advanced data extraction is running; it is not a portfolio sync.</p>}
        {result && (
          <p className={syncProblem || attempt?.event === 'failed' ? 'notice' : 'sync-result'}>
            {result}
          </p>
        )}
      </div>
      {(error || connectionError) && (
        <p role="alert" className="notice error">
          {error || connectionError}
        </p>
      )}
      {status?.sessionWarning && (
        <p role="alert" className="notice">
          {status.sessionWarning}
        </p>
      )}
      {!compact && (
        <>
          <p className="action-scope">
            Sync portfolio imports positions, quotes and cash. It does not refresh ETF compositions
            or extract the full broker history. Saved holdings remain available if a sync fails.
          </p>
          {!connected && (
            <form
              aria-label="Connect Trade Republic"
              onSubmit={(event) => {
                event.preventDefault()
                if (busy) return
                const body = { phone, pin }
                setPin('')
                void action('login', body)
              }}
            >
              <label>
                Phone number
                <input
                  ref={phoneInput}
                  type="tel"
                  autoComplete="tel"
                  placeholder="+49…"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={busy || !status}
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
                  onChange={(event) => setPin(event.target.value)}
                  disabled={busy || !status}
                  required
                  pattern="[0-9]{4}"
                  maxLength={4}
                />
              </label>
              <button disabled={busy || !status}>{connectLabel}</button>
            </form>
          )}
          <p className="action-scope">
            Connect → approve in the phone app → automatic import → review the outcome. Your PIN is
            not saved; session cookies use the system credential store.
          </p>
          <p className="refresh-policy">
            {!status?.automaticRefresh
              ? 'Automatic refresh policy is not recorded by this service.'
              : !status.automaticRefresh.enabled
                ? 'Automatic refresh is disabled for this preview. Manual actions remain available.'
                : status.automaticRefresh.sessionRestoreEnabled
                  ? `Automatic portfolio refresh runs on startup and every ${status.automaticRefresh.intervalMinutes} minutes while the service runs; a valid session is required. The separate ETF pilot refresh is checked on that schedule, at most daily.`
                  : 'Automatic portfolio reconnection is disabled until you connect again. The separate ETF pilot refresh may still run.'}
          </p>
          <button
            className="secondary"
            disabled={busy || !status}
            onClick={() => void action('logout')}
          >
            {connected ? 'Disconnect' : 'Forget saved session'}
          </button>
        </>
      )}
      {busy && (
        <button className="secondary" onClick={() => void action('cancel')}>
          Cancel operation
        </button>
      )}
    </section>
  )
}
