import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  createInvestigationsClient,
  type InvestigationAction,
  type InvestigationItem,
  type InvestigationScope,
type ManualEvidence,
} from './views/investigations-client'

const client = createInvestigationsClient()

function scopeKey(scope: InvestigationScope) {
  return `${scope.connectionId}:${scope.account}:${scope.isin}`
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Unknown'
}

function evidenceLabel(item: ManualEvidence) {
  if (item.kind === 'price') return `Price ${item.price ?? 'unknown'} ${item.currency ?? ''} per security`
  if (item.kind === 'revoke') return 'Revoke'
  return 'Note'
}

type Draft = { reason: string; noteSource: string; price: { value: string; currency: string; asOf: string; source: string; reason: string } }
const emptyDraft = (): Draft => ({ reason: '', noteSource: '', price: { value: '', currency: '', asOf: '', source: '', reason: '' } })

export function Investigations({ isin }: { isin?: string }) {
  const [result, setResult] = useState<{ items: InvestigationItem[]; counts: { open: number; excluded: number; manualSupported: number } } | null>(null)
  const [filter, setFilter] = useState<'open' | 'excluded'>('open')
  const [readError, setReadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const busyRef = useRef<string | null>(null)
  const readSequence = useRef(0)
  const mounted = useRef(true)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  async function load(signal?: AbortSignal) {
    const sequence = ++readSequence.current
    try {
      const next = await client.read(signal)
      if (mounted.current && !signal?.aborted && sequence === readSequence.current) {
        setResult(next)
        setReadError(null)
      }
    } catch (cause) {
      if (mounted.current && !signal?.aborted && sequence === readSequence.current) setReadError('Investigations are unavailable. Saved financial values are unchanged.')
    }
  }
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    void load(controller.signal)
    const changed = () => { if (!busyRef.current) void load(controller.signal) }
    const timer = window.setInterval(() => { if (!busyRef.current) void load(controller.signal) }, 5000)
    window.addEventListener('prism-investigations-changed', changed)
    return () => {
      mounted.current = false
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('prism-investigations-changed', changed)
    }
  }, [])

  const items = useMemo(() => (result?.items ?? []).filter((item) => {
    if (isin && item.scope.isin !== isin) return false
    if (item.state !== filter) return false
    return !(item.manualStatus.toLowerCase().includes('resolved') && item.evidence.length === 0)
  }), [result, filter, isin])
  const counts = useMemo(() => {
    const scoped = (result?.items ?? []).filter(item => !isin || item.scope.isin === isin)
    return {
      open: scoped.filter(item => item.state === 'open' && item.value === null).length,
      excluded: scoped.filter(item => item.state === 'excluded').length,
      manualSupported: scoped.filter(item => item.manualStatus.startsWith('Manual price fallback selected')).length,
    }
  }, [result, isin])

  async function act(item: InvestigationItem, action: InvestigationAction) {
    if (busyRef.current) return
    const key = scopeKey(item.scope)
    readSequence.current += 1
    setBusy(key)
    busyRef.current = key
    setMutationError(null)
    try {
      await client.act(action)
      if (!mounted.current) return
      window.dispatchEvent(new CustomEvent('prism-investigations-changed'))
      await load()
      if (!mounted.current) return
      setDrafts((current) => ({ ...current, [scopeKey(item.scope)]: emptyDraft() }))
    } catch (cause) {
      if (mounted.current) setMutationError(cause instanceof Error ? cause.message : 'Could not save the investigation update.')
    } finally {
      if (mounted.current) setBusy(null)
      busyRef.current = null
    }
  }

  return (
    <section className="panel investigation-panel" aria-labelledby="investigations-title" style={{ padding: '16px 18px' }}>
      <div className="section-title" style={{ flexWrap: 'wrap' }}>
        <h2 id="investigations-title">Investigations</h2>
        <span className="badge" style={{ whiteSpace: 'normal', lineHeight: 1.5 }}>{result ? `${counts.open} unresolved open · ${counts.excluded} excluded · ${counts.manualSupported} manual-supported` : 'Loading'}</span>
      </div>
      <p className="muted">Resolve a valuation gap with retained evidence. Investigation status does not change financial completeness; compatible manual prices can support valuation.</p>
      <div className="detail-tabs" aria-label="Investigation state">
        <button className="secondary compact-button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Open</button>
        <button className="secondary compact-button" aria-pressed={filter === 'excluded'} onClick={() => setFilter('excluded')}>Excluded</button>
      </div>
      {readError && <p role="alert" className="notice error">{readError}</p>}
      {mutationError && <p role="alert" className="notice error">{mutationError} <button className="secondary compact-button" onClick={() => setMutationError(null)}>Dismiss</button></p>}
      {!readError && result && !items.length && <p className="empty">No {filter} investigations in this scope.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => {
          const key = scopeKey(item.scope)
          const draft = drafts[key] ?? emptyDraft()
          const updateDraft = (patch: Partial<Draft>) => { setMutationError(null); setDrafts((current) => ({ ...current, [key]: { ...draft, ...patch } })) }
          const updatePrice = (patch: Partial<Draft['price']>) => updateDraft({ price: { ...draft.price, ...patch } })
          const latestPrice = item.manualEvidence?.kind === 'price' ? item.manualEvidence : null
          return (
            <article key={key} className="company-card" style={{ padding: 12 }}>
              <div className="section-title" style={{ marginBottom: 6 }}>
                <strong>{item.name}</strong>
                <span className={`state-chip ${item.state === 'open' ? 'open' : 'ready'}`}>{item.state}</span>
              </div>
              <p style={{ margin: '4px 0' }}><span className="mono">{item.scope.isin}</span> · {item.scope.account} · {item.value ?? 'Unknown'} {item.currency ?? ''}</p>
              <p style={{ margin: '4px 0' }}>{item.reason}</p>
              <p style={{ margin: '4px 0' }}>{item.manualStatus}{item.quantityObservedAt ? ` · quantity observed ${date(item.quantityObservedAt)}` : ''}</p>
              {item.brokerReason && <p style={{ margin: '4px 0' }}>Broker valuation: {item.brokerValue ?? 'Unknown'} {item.currency ?? ''} · {item.brokerReason}</p>}
              {latestPrice && <p style={{ margin: '4px 0' }}>Saved manual price: {evidenceLabel(latestPrice)} · {date(latestPrice.asOf)} · {latestPrice.source}</p>}
              <details>
                <summary>Manual evidence and actions</summary>
                <p>Decision recorded: {date(item.decisionAt)}</p>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {item.evidence.map((entry) => (
                    <div key={entry.id} className="notice" style={{ margin: 0, padding: '8px 10px' }}>
                      <strong>{evidenceLabel(entry)}</strong> · {date(entry.recordedAt)}
                      <small style={{ display: 'block' }}>{entry.source}{entry.reason ? ` · ${entry.reason}` : ''}{entry.revokes ? ` · revokes ${entry.revokes}` : ''}</small>
                      {entry.kind === 'price' && item.manualEvidence?.id === entry.id && (
                        <button className="secondary compact-button" disabled={busy !== null} onClick={() => void act(item, { action: 'revoke', scope: item.scope, evidenceId: entry.id, reason: 'Manual price revoked' })}>Revoke price</button>
                      )}
                    </div>
                  ))}
                  <label>Decision reason<input value={draft.reason} onChange={(event) => updateDraft({ reason: event.target.value })} placeholder="Why is this state correct?" /></label>
                  <div className="actions">
                    <button className="secondary compact-button" disabled={busy !== null} onClick={() => void act(item, { action: 'decide', scope: item.scope, state: item.state === 'open' ? 'excluded' : 'open', reason: draft.reason.trim() })}>{item.state === 'open' ? 'Exclude from investigation' : 'Reopen investigation'}</button>
                  </div>
                  <label>Evidence source<input value={draft.noteSource} onChange={(event) => updateDraft({ noteSource: event.target.value })} placeholder="Source or reference" /></label>
                  <button className="secondary compact-button" disabled={busy !== null || !draft.noteSource.trim() || !draft.reason.trim()} onClick={() => void act(item, { action: 'note', scope: item.scope, source: draft.noteSource, reason: draft.reason })}>Add note</button>
                  {item.manualAllowed && <>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      <label>Price per security<input inputMode="decimal" value={draft.price.value} onChange={(event) => updatePrice({ value: event.target.value })} /></label>
                      <label>Currency<input value={draft.price.currency} list={`investigation-currencies-${key}`} placeholder={item.allowedCurrencies.join(', ') || 'Allowed listing currency'} onChange={(event) => updatePrice({ currency: event.target.value })} /></label>
                      <datalist id={`investigation-currencies-${key}`}>{item.allowedCurrencies.map(currency => <option value={currency} key={currency} />)}</datalist>
                      <label>As of<input type="datetime-local" step="any" value={draft.price.asOf} onChange={(event) => updatePrice({ asOf: event.target.value })} /></label>
                      <label>Price source<input value={draft.price.source} onChange={(event) => updatePrice({ source: event.target.value })} /></label>
                    </div>
                    <label>Price reason<input value={draft.price.reason} onChange={(event) => updatePrice({ reason: event.target.value })} /></label>
                    <button className="secondary compact-button" disabled={busy !== null || !draft.price.value || !draft.price.currency || !draft.price.asOf || !draft.price.source || !draft.price.reason} onClick={() => void act(item, { action: 'price', scope: item.scope, price: draft.price.value, currency: draft.price.currency, asOf: new Date(draft.price.asOf).toISOString(), source: draft.price.source, reason: draft.price.reason, unit: 'per-security' })}>Save per-security price</button>
                  </>}
                  {!item.manualAllowed && <p className="muted">Manual price is unavailable for this holding. Notes remain available.</p>}
                </div>
              </details>
            </article>
          )
        })}
      </div>
    </section>
  )
}
