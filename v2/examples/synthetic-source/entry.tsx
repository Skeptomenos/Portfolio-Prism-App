import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserViewRegistry, RegisteredViewHost, createFinancialClient } from '../../sdk/browser'
import { exampleView } from './browser'
import '../../web/style.css'
const registry = new BrowserViewRegistry([exampleView(createFinancialClient())])
registry.activate(new AbortController().signal)
const entry = registry.route('synthetic-source')!
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1100, margin: 'auto', padding: 16 }}>
  <RegisteredViewHost entry={entry} params={new URLSearchParams()} />
</main>)
