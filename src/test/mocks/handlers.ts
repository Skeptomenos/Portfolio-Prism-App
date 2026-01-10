import { http, HttpResponse } from 'msw'
import {
  mockEngineHealth,
  mockDashboardData,
  mockAuthStatusIdle,
  mockSessionCheck,
  mockPositionsResponse,
  mockTrueHoldingsResponse,
} from './ipc'

const ECHO_BRIDGE_URL = 'http://127.0.0.1:5001'

function createCommandResponse(data: unknown) {
  return { status: 'success', data }
}

function createErrorResponse(code: string, message: string) {
  return { status: 'error', error: { code, message } }
}

export const handlers = [
  http.post(`${ECHO_BRIDGE_URL}/command`, async ({ request }) => {
    const body = (await request.json()) as { command: string; payload?: Record<string, unknown> }
    const { command } = body

    switch (command) {
      case 'get_health':
        return HttpResponse.json(createCommandResponse(mockEngineHealth))

      case 'get_dashboard_data':
        return HttpResponse.json(createCommandResponse(mockDashboardData))

      case 'get_positions':
        return HttpResponse.json(createCommandResponse(mockPositionsResponse))

      case 'tr_get_auth_status':
        return HttpResponse.json(createCommandResponse(mockAuthStatusIdle))

      case 'tr_check_saved_session':
        return HttpResponse.json(createCommandResponse(mockSessionCheck))

      case 'get_true_holdings':
        return HttpResponse.json(createCommandResponse(mockTrueHoldingsResponse))

      case 'run_pipeline':
        return HttpResponse.json(
          createCommandResponse({ success: true, errors: [], durationMs: 1500 })
        )

      case 'sync_portfolio':
        return HttpResponse.json(
          createCommandResponse({
            syncedPositions: 10,
            newPositions: 2,
            updatedPositions: 8,
            totalValue: 75000,
            durationMs: 1500,
          })
        )

      default:
        return HttpResponse.json(
          createErrorResponse('UNKNOWN_COMMAND', `Unknown command: ${command}`),
          { status: 400 }
        )
    }
  }),
]

export { http, HttpResponse }
