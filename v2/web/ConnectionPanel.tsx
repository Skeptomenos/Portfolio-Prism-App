import React, { useEffect, useRef, useState } from 'react'
import type { Status } from '../server/model'

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : 'Not recorded'
export function ConnectionPanel({
  status,
  busy,
  error,
  action,
  cancelling = false,
  compact = false,
}: {
  status: Status | null
  busy: boolean
  error: string | null
  action: (path: string, body?: object) => Promise<void>
  cancelling?: boolean
  compact?: boolean
}) {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const phoneInput = useRef<HTMLInputElement>(null)
  const authHeading = useRef<HTMLHeadingElement>(null)
  const authResultHeading = useRef<HTMLHeadingElement>(null)
  const previousAuthState = useRef<string | null>(null)
  const focused = useRef(false)
  const connected = status?.connected ?? status?.phase === 'connected'
  const extraction = status?.activeOperation === 'extraction'
  const attempt = status?.lastPortfolioAttempt
  const outcome = attempt ? attempt.outcome : status?.outcome
  const loginAttempt = attempt?.operation === 'login' ? attempt : null
  const importPartial = loginAttempt?.event === 'partial' || loginAttempt?.outcome?.valuation === 'partial' || loginAttempt?.outcome?.events === 'partial'
  const syncProblem =
    !!outcome?.holdings && ['partial', 'failed', 'cancelled'].includes(outcome.valuation)
  const connectionError =
    status?.lastDiagnostic?.operation !== 'extraction' || !connected ? status?.error : null
  const reconnect = !connected && !!(connectionError || attempt?.category === 'authentication')
  const connectLabel = reconnect ? 'Reconnect & sync' : 'Connect & sync'
  const pending = busy && !extraction
  const activeLogin =
    busy &&
    status?.activeOperation === 'portfolio' &&
    (status.activeOperationName === 'login' || status.phase === 'connecting' || status.phase === 'awaiting-approval')
  const loginTimedOut = loginAttempt?.category === 'timeout' || loginAttempt?.timeoutOrigin === 'operation'
  const loginApprovalSucceeded =
    !!loginAttempt &&
    (connected || !!loginAttempt.outcome?.holdings || ['syncing', 'persisting', 'data_extraction'].includes(loginAttempt.stage))
  const loginImportTimedOut = loginTimedOut && loginApprovalSucceeded
  const loginImportCancelled = loginAttempt?.event === 'cancelled' && loginApprovalSucceeded
  const retry = connected && !!(connectionError || syncProblem || error || loginImportTimedOut || loginImportCancelled)
  const importRecoveryMessage = connected
    ? 'Use Retry sync below to refresh the saved portfolio.'
    : `Use ${connectLabel} below to re-establish the connection and retry the portfolio import.`
  const importOutcomeMessage = loginAttempt?.outcome?.holdings
    ? `Phone approval succeeded. Holdings were saved. Valuation refresh ${loginAttempt.outcome.valuation}; transaction refresh ${loginAttempt.outcome.events ?? 'not reported for this attempt'}.`
    : 'Phone approval succeeded, but holdings were not saved in this attempt.'
  const authFlow = !status
    ? null
    : cancelling && activeLogin
      ? 'cancelling'
      : activeLogin && status.phase === 'connecting'
        ? 'connecting'
        : activeLogin && status.phase === 'awaiting-approval'
          ? 'awaiting-approval'
          : activeLogin && status.phase === 'syncing'
            ? 'importing'
            : !busy && connected && status.phase === 'connected' &&
                (loginAttempt?.event === 'succeeded' || loginAttempt?.event === 'partial') &&
                !!loginAttempt.outcome?.holdings
                  ? 'complete'
                  : null
  const authResult = !busy && (loginAttempt?.event === 'cancelled' || loginAttempt?.event === 'failed')
    ? loginAttempt.event
    : null
  useEffect(() => {
    const authState = authFlow ?? authResult
    if (authState && authState !== previousAuthState.current) {
      if (authFlow) authHeading.current?.focus()
      else authResultHeading.current?.focus()
    }
    previousAuthState.current = authState
  }, [authFlow, authResult])
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
    authFlow !== 'complete' &&
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
        <span className={authFlow ? 'status auth-status' : 'status'}>
          {authFlow === 'awaiting-approval' ? 'Waiting for approval'
            : authFlow === 'connecting' ? 'Requesting approval'
                : authFlow === 'cancelling' ? 'Cancelling request'
                  : authFlow === 'importing' ? 'Importing portfolio'
                  : authFlow === 'complete' ? importPartial ? 'Import partial' : 'Login complete'
                    : status ? (connected ? 'Connected' : 'Disconnected') : 'Checking connection…'}
        </span>
      </div>
      {authFlow && authFlow !== 'complete' ? (
        <section className={`auth-progress auth-progress-${authFlow}`} aria-label="Login progress">
          <h2 ref={authHeading} tabIndex={-1}>
            {authFlow === 'connecting' ? 'Requesting phone approval'
              : authFlow === 'awaiting-approval' ? 'Open Trade Republic on your phone'
                : authFlow === 'cancelling' ? 'Cancelling the login request'
                  : authFlow === 'importing' ? 'Approval received. Importing your portfolio'
                    : importPartial
                      ? 'Phone approval succeeded. The import has partial results.'
                      : 'Login and import complete'}
          </h2>
          {(authFlow === 'connecting' || authFlow === 'awaiting-approval' || authFlow === 'cancelling' || authFlow === 'importing') && (
            <p className="auth-progress-status" role="status" aria-live="polite" aria-atomic="true">
              <span className="auth-progress-indicator" aria-hidden="true" />
              {authFlow === 'connecting' ? 'Sending the login request…'
                : authFlow === 'awaiting-approval' ? 'Waiting for your approval…'
                  : authFlow === 'cancelling' ? 'Cancelling the request…'
                    : 'Saving holdings and refreshing quotes and cash…'}
            </p>
          )}
          {authFlow === 'awaiting-approval' && (
            <p className="auth-progress-instruction">
              Approve the login request in the app. Prism will import your holdings and refresh saved quotes and cash automatically.
            </p>
          )}
          {authFlow === 'connecting' && <p>Keep this page open while Prism sends the request.</p>}
          {authFlow === 'importing' && <p>Your phone approval is complete. Prism is saving the returned portfolio data.</p>}
          {error && <p role="alert" className="notice error">{error}</p>}
          {(authFlow === 'connecting' || authFlow === 'awaiting-approval' || authFlow === 'cancelling' || authFlow === 'importing') && (
            <button className="secondary" disabled={cancelling} onClick={() => void action('cancel')}>
              {cancelling ? 'Cancelling…' : authFlow === 'awaiting-approval' ? 'Cancel approval' : 'Cancel login'}
            </button>
          )}
          <details className="auth-progress-details">
            <summary>About the login process</summary>
            <p>Prism does not save your PIN. Session cookies use the system credential store. Saved holdings and their dates remain available if a login or import does not finish.</p>
            <p>Issuer composition refresh is separate from broker login and portfolio import.</p>
          </details>
        </section>
      ) : <>
      {authFlow === 'complete' && (
        <section className="auth-result auth-result-complete" aria-label="Login result">
          <h2 ref={authHeading} tabIndex={-1}>
            {importPartial
              ? 'Phone approval succeeded. The import has partial results.'
              : 'Login and import complete'}
          </h2>
          {loginAttempt?.outcome && (
            <p>
              Phone approval succeeded. Holdings were saved. Valuation: {loginAttempt.outcome.valuation}.
              {' '}Transactions: {loginAttempt.outcome.events ?? 'not reported for this attempt'}.
            </p>
          )}
          {importPartial && connectionError && <p role="alert" className="notice error">{connectionError}</p>}
        </section>
      )}
      <div className="connection-controls">
        <div className="sync-dates">
          <span>
            Last complete broker refresh:{' '}
            <time dateTime={status?.lastSuccessfulSyncAt ?? undefined}>
              {date(status?.lastSuccessfulSyncAt)}
            </time>
          </span>
          {!compact && (
            <span>
              Saved holdings:{' '}
              <time dateTime={status?.lastHoldingsCommitAt ?? status?.snapshot?.fetchedAt}>
                {date(status?.lastHoldingsCommitAt ?? status?.snapshot?.fetchedAt)}
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
      {!compact && outcome && authFlow !== 'complete' && <p className="sync-saved">
        Holdings: {outcome.holdings ? 'saved' : 'not saved in this attempt'}. Valuation: {outcome.valuation}.
        {' '}Transactions: {status?.lastEventAttempt?.outcome?.events ?? outcome.events ?? 'not recorded for this older attempt'}.
        {outcome.sources.some(source => source.id === 'availableCash' && source.status === 'failed') && ' Optional spending-balance refresh failed; total cash has its own outcome.'}
        {' '}Issuer refresh results are shown separately below.
      </p>}
      <div role="status" aria-live="polite">
        {step && <p className="notice">{step}</p>}
        {extraction && <p>Advanced data extraction is running; it is not a portfolio sync.</p>}
        {result && (
          <p className={syncProblem || attempt?.event === 'failed' ? 'notice' : 'sync-result'}>
            {result}
          </p>
        )}
      </div>
      {authResult && (
        <section className={`auth-result auth-result-${authResult}`} aria-label="Login result">
          <h2 ref={authResultHeading} tabIndex={-1}>
            {loginImportCancelled ? 'Portfolio import cancelled'
              : authResult === 'cancelled' ? 'Login approval cancelled'
              : loginImportTimedOut ? 'Portfolio import timed out'
              : loginTimedOut
                ? 'The login request timed out'
                : connected ? 'Login was approved, but import did not finish'
                  : 'Could not complete the login'}
          </h2>
          <p role="alert" className="notice">
            {loginImportCancelled
              ? `${importOutcomeMessage} The import was cancelled. ${importRecoveryMessage}`
              : authResult === 'cancelled'
              ? 'The login request was cancelled. You can start again when you are ready.'
              : loginImportTimedOut
                ? `${importOutcomeMessage} ${importRecoveryMessage}`
                : loginTimedOut
                  ? loginAttempt?.stage === 'connecting'
                    ? 'The login request timed out before Prism confirmed phone approval. Check the phone app, then start a new request.'
                    : 'No approval was confirmed before the request timed out. Check the phone app, then start a new request.'
                : loginAttempt?.category === 'authentication'
                  ? 'Trade Republic did not accept the login. Check the app and try again.'
                  : connected
                    ? 'Your phone approval was accepted, but the portfolio import failed. Retry the import below.'
                    : 'The login did not finish. Check the connection and try again.'}
            {loginAttempt?.attemptId && <> Diagnostic reference: {loginAttempt.attemptId}.</>}
            {status?.snapshot && !loginImportCancelled && !loginImportTimedOut && ' Saved holdings remain available.'}
          </p>
        </section>
      )}
      {(error || connectionError) && !authResult && authFlow !== 'complete' && (
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
      </>}
    </section>
  )
}
