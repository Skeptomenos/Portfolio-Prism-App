import { Holdings } from '../Holdings'
import { CompanyExposure } from '../CompanyExposure'
import { DevelopmentProgress } from '../DevelopmentProgress'
import { ExploreView } from './Explore'
import { ContributionMix } from './ContributionMix'
import { contributionMix } from './contribution-mix'
import { AnalyticsRegistry } from './analytics-registry'
import { createFinancialClient, createExposureCommands, type AnalysisSnapshot } from './financial-client'
import React from 'react'
import { Wiki } from '../Wiki'
import { History } from './History'
import { AmundiPanel, createInspectionClient } from './AmundiPanel'
import { createHistoryClient } from './history-client'
import { BrowserViewRegistry } from './registry'
import { amundiPluginMetadata, historyPlugin, wikiPlugin, financialPlugin, contributionMixPlugin } from './plugin-metadata'

export const financialClient = createFinancialClient()
const commands = createExposureCommands()
const analytics = new AnalyticsRegistry([{ metadata: contributionMixPlugin, analyticsId: 'contribution-mix', evaluate: contributionMix }])
const evaluateMix = (input: AnalysisSnapshot) => analytics.evaluate('contribution-mix', input)
const historyClient = createHistoryClient()
const inspectionClient = createInspectionClient()
// Explicit trusted modules. Each receives only its fixed read client and shell
// route parameters, never the backend provider's network/credential context.
export const browserViews = new BrowserViewRegistry([
  { metadata: financialPlugin, viewId: 'portfolio', render: (_, context) => <Holdings client={financialClient} commands={commands} revision={context.revision} connection={context.connection} /> },
  { metadata: financialPlugin, viewId: 'breakdown', render: (_, context) => <CompanyExposure client={financialClient} commands={commands} securityIsin={context.securityIsin} /> },
  { metadata: financialPlugin, viewId: 'development', render: (_, context) => <DevelopmentProgress client={financialClient} commands={commands} fundIsin={context.fundIsin} coverage={context.coverage} /> },
  { metadata: financialPlugin, viewId: 'explore', render: () => <ExploreView /> },
  { metadata: contributionMixPlugin, viewId: 'contribution-mix-view', render: () => <ContributionMix client={financialClient} evaluate={evaluateMix} /> },
  { metadata: historyPlugin, viewId: 'portfolio-history', render: params => <History client={historyClient} params={params} /> },
  { metadata: amundiPluginMetadata, viewId: 'amundi-development-inspection', render: () => <AmundiPanel client={inspectionClient} /> },
  { metadata: wikiPlugin, viewId: 'project-wiki', render: params => <Wiki pageId={params.get('page')} section={params.get('section')} /> },
], ['home', 'data'])
browserViews.activate(new AbortController().signal)
