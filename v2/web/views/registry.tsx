import React from 'react'
import type { CoverageReport } from '../../contracts/financial'
import { pluginHostVersion, viewContributionContractVersion, type ViewContribution, type ViewPluginMetadata } from './plugin-metadata'

export interface ViewPresentation {
  revision?: string
  connection?: React.ReactNode
  fundIsin?: string
  securityIsin?: string
  coverage: CoverageReport | null
}
export interface BrowserViewModule {
  metadata: ViewPluginMetadata
  viewId: string
  render: (params: URLSearchParams, presentation: ViewPresentation) => React.ReactNode
  activate?: (context: { signal: AbortSignal }) => void
}
export interface RegisteredView {
  pluginId: string
  contribution: ViewContribution & { route: NonNullable<ViewContribution['route']> }
  module: BrowserViewModule
  state: 'active' | 'failed' | 'disabled' | 'incompatible'
}
const token = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export class BrowserViewRegistry {
  readonly entries: readonly RegisteredView[]
  constructor(modules: readonly BrowserViewModule[], reservedRoutes: readonly string[] = []) {
    const ids = new Set<string>()
    const routes = new Set(reservedRoutes)
    this.entries = modules.map(module => {
      const { metadata } = module
      const contribution = metadata.contributions.views.find(view => view.id === module.viewId)
      if (!token.test(metadata.id) || !/^\d+\.\d+\.\d+$/.test(metadata.version) ||
        !contribution?.route || !token.test(contribution.route.id) ||
        !contribution.readModel || !contribution.browserEntrypoint || !contribution.serverEntrypoint)
        throw new Error('Incompatible browser view registration')
      if (ids.has(contribution.id) || routes.has(contribution.route.id)) throw new Error('Duplicate browser view registration')
      ids.add(contribution.id); routes.add(contribution.route.id)
      return { pluginId: metadata.id, contribution: contribution as RegisteredView['contribution'], module, state: metadata.compatibility.hostVersion === pluginHostVersion && contribution.contractVersion === viewContributionContractVersion &&
        ['portfolio-financial/1', 'portfolio-history/1', 'portfolio-events/1', 'wiki-pages/1'].includes(contribution.readModel) ? 'active' : 'incompatible' }
    })
  }
  activate(signal: AbortSignal) {
    for (const entry of this.entries) {
      if (entry.state !== 'active') continue
      try { signal.throwIfAborted(); entry.module.activate?.({ signal }) } catch { entry.state = 'failed' }
    }
  }
  disable(viewId: string) {
    const entry = this.entries.find(item => item.contribution.id === viewId)
    if (!entry) throw new Error('Unknown view')
    entry.state = 'disabled'
  }
  route(id: string) { return this.entries.find(entry => entry.contribution.route.id === id) }
}

class ViewBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <p role="alert" className="notice error">This view failed. Saved data and other views remain available. Reload to retry.</p> : this.props.children
  }
}
function ViewContent({ entry, params, presentation }: { entry: RegisteredView; params: URLSearchParams; presentation: ViewPresentation }) { return <>{entry.module.render(params, presentation)}</> }
export function RegisteredViewHost({ entry, params, presentation = { coverage: null } }: { entry: RegisteredView; params: URLSearchParams; presentation?: ViewPresentation }) {
  if (entry.state !== 'active') return <p role="alert" className="notice error">This view is {entry.state}. Saved data and other views remain available.</p>
  return <ViewBoundary key={entry.contribution.id}><ViewContent entry={entry} params={params} presentation={presentation} /></ViewBoundary>
}
