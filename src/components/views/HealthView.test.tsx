import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../test/utils'
import HealthView from './HealthView'
import * as ipc from '../../lib/ipc'
import type { PipelineHealthReport } from '../../hooks/usePipelineDiagnostics'

vi.mock('../../lib/ipc', () => ({
  getPipelineReport: vi.fn(),
  runPipeline: vi.fn(),
  getRecentReports: vi.fn(),
  getPendingReviews: vi.fn(),
  getHiveContribution: vi.fn(),
  setHiveContribution: vi.fn(),
}))

function createMockReport(overrides: Partial<PipelineHealthReport> = {}): PipelineHealthReport {
  return {
    timestamp: '2025-01-10T12:00:00Z',
    metrics: {
      direct_holdings: 0,
      etf_positions: 0,
      etfs_processed: 0,
      tier1_resolved: 0,
      tier1_failed: 0,
    },
    performance: {
      execution_time_seconds: 0,
      hive_hit_rate: 0,
      api_fallback_rate: 0,
      total_assets_processed: 0,
      phase_durations: {},
    },
    failures: [],
    ...overrides,
  }
}

vi.mock('../../store/useAppStore', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => {
    const state = {
      setLastPipelineRun: vi.fn(),
    }
    return selector(state)
  },
  useTelemetryMode: vi.fn(() => 'auto'),
  useSetTelemetryMode: vi.fn(() => vi.fn()),
  useHiveContributionEnabled: vi.fn(() => true),
  useSetHiveContributionEnabled: vi.fn(() => vi.fn()),
}))

describe('HealthView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ipc.getPipelineReport).mockResolvedValue(createMockReport())
    vi.mocked(ipc.getRecentReports).mockResolvedValue([])
    vi.mocked(ipc.getPendingReviews).mockResolvedValue([])
    vi.mocked(ipc.getHiveContribution).mockResolvedValue(true)
  })

  it('renders system health header', async () => {
    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument()
    })
  })

  it('shows run diagnostics button', async () => {
    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument()
    })
  })

  it('triggers pipeline run when clicking diagnostics button', async () => {
    vi.mocked(ipc.runPipeline).mockResolvedValue({ success: true, errors: [], durationMs: 1000 })

    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Diagnostics/i }))

    await waitFor(() => {
      expect(ipc.runPipeline).toHaveBeenCalled()
    })
  })

  it('displays telemetry settings section', async () => {
    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByText('Automatic Error Reporting')).toBeInTheDocument()
    })
  })

  it('displays hive contribution toggle', async () => {
    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByText('Hive Community Contribution')).toBeInTheDocument()
    })
  })

  it('shows status cards', async () => {
    vi.mocked(ipc.getPipelineReport).mockResolvedValue(
      createMockReport({
        performance: {
          execution_time_seconds: 1,
          hive_hit_rate: 85,
          api_fallback_rate: 15,
          total_assets_processed: 10,
          phase_durations: {},
        },
        etf_stats: [],
      })
    )

    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByText('Last Run')).toBeInTheDocument()
      expect(screen.getByText('Hive Hit Rate')).toBeInTheDocument()
      expect(screen.getByText('Telemetry')).toBeInTheDocument()
      expect(screen.getByText('Active Errors')).toBeInTheDocument()
    })
  })

  it('displays error banner when pipeline fails', async () => {
    vi.mocked(ipc.runPipeline).mockRejectedValue(new Error('Pipeline failed'))

    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Diagnostics/i }))

    await waitFor(() => {
      expect(screen.getByText('Pipeline failed')).toBeInTheDocument()
    })
  })

  it('shows loading state during diagnostics', async () => {
    vi.mocked(ipc.runPipeline).mockImplementation(() => new Promise(() => {}))

    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Diagnostics/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Run Diagnostics/i }))

    await waitFor(() => {
      expect(screen.getByText(/Running/)).toBeInTheDocument()
    })
  })

  it('displays ETF decomposition table when data available', async () => {
    vi.mocked(ipc.getPipelineReport).mockResolvedValue(
      createMockReport({
        etf_stats: [{ ticker: 'VWCE', holdings_count: 100, weight_sum: 95.5, status: 'complete' }],
      })
    )

    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByText('ETF Decomposition Status')).toBeInTheDocument()
      expect(screen.getByText('VWCE')).toBeInTheDocument()
    })
  })

  it('displays active issues when failures exist', async () => {
    vi.mocked(ipc.getPipelineReport).mockResolvedValue(
      createMockReport({
        failures: [
          {
            severity: 'error',
            stage: 'decompose',
            item: 'ETF123',
            error: 'Missing data',
            fix: 'Upload CSV',
          },
        ],
        etf_stats: [],
      })
    )

    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByText('Active Issues')).toBeInTheDocument()
      expect(screen.getByText(/Missing data/)).toBeInTheDocument()
    })
  })

  it('shows telemetry mode buttons', async () => {
    render(<HealthView />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Auto' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument()
    })
  })
})
