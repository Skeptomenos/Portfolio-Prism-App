# Spec: Implement IPC Response Validation with Zod

> **Goal**: Enforce runtime validation for ALL data crossing the IPC boundary from Python sidecar to React frontend.
> **Estimated Time**: 30 minutes.
> **Priority**: CRITICAL

## 1. Overview

The frontend has a `validateResponse` function defined but it is NEVER called. All IPC responses from the Python sidecar enter the React application unvalidated, creating a critical type-safety gap.

### Rule Reference
`rules/rules_ts.md` Section 1 (Type Safety):
> "IO Boundaries: ALL external data (API, DB, Env Vars) MUST be validated with Zod at the edge. Trust nothing."

`rules/security.md` Section 1 (Input Validation):
> "Edge Validation: EVERY external input MUST be validated with Zod/Pydantic."

## 2. Current State

### 2.1 Existing Infrastructure
**File:** `src/lib/ipc.ts`

The file already contains validation infrastructure that is unused:

```typescript
// This function EXISTS but is NEVER CALLED
function validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError('Response validation failed', result.error)
  }
  return result.data
}
```

### 2.2 IPC Functions Bypassing Validation

| Function | Line | Returns |
|----------|------|---------|
| `getEngineHealth` | ~138 | Raw unvalidated data |
| `getDashboardData` | ~151 | Raw unvalidated data |
| `getPositions` | ~177 | Raw unvalidated data |
| `syncPortfolio` | ~193 | Raw unvalidated data |
| `uploadHoldings` | ~210 | Raw unvalidated data |
| `runPipeline` | ~225 | Raw unvalidated data |
| `getRecentReports` | ~378 | Raw unvalidated data |
| `getPendingReviews` | ~390 | Raw unvalidated data |

## 3. Implementation Steps

### 3.1 Define Zod Schemas

**Create file:** `src/lib/schemas/ipc.ts`

```typescript
import { z } from 'zod'

// =============================================================================
// Engine Health Schema
// =============================================================================
export const EngineHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  python_version: z.string(),
  uptime_seconds: z.number(),
  memory_mb: z.number().optional(),
  last_sync: z.string().nullable(),
})

export type EngineHealth = z.infer<typeof EngineHealthSchema>

// =============================================================================
// Dashboard Data Schema
// =============================================================================
export const PositionSchema = z.object({
  isin: z.string(),
  ticker: z.string().nullable(),
  name: z.string(),
  quantity: z.number(),
  current_price: z.number().nullable(),
  current_value: z.number().nullable(),
  cost_basis: z.number().nullable(),
  pnl: z.number().nullable(),
  pnl_percent: z.number().nullable(),
  weight: z.number(),
  asset_class: z.string().nullable(),
  sector: z.string().nullable(),
})

export type Position = z.infer<typeof PositionSchema>

export const DashboardDataSchema = z.object({
  total_value: z.number(),
  total_cost: z.number(),
  total_pnl: z.number(),
  total_pnl_percent: z.number(),
  positions: z.array(PositionSchema),
  last_updated: z.string(),
  sparkline: z.array(z.number()).optional(),
})

export type DashboardData = z.infer<typeof DashboardDataSchema>

// =============================================================================
// Pipeline / Sync Response Schema
// =============================================================================
export const PipelineResultSchema = z.object({
  success: z.boolean(),
  positions_count: z.number().optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
})

export type PipelineResult = z.infer<typeof PipelineResultSchema>

// =============================================================================
// System Log Report Schema
// =============================================================================
export const SystemLogReportSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
})

export type SystemLogReport = z.infer<typeof SystemLogReportSchema>

// =============================================================================
// Holdings Upload Response Schema
// =============================================================================
export const HoldingsUploadResultSchema = z.object({
  holdingsCount: z.number(),
  totalWeight: z.number(),
  contributedToHive: z.boolean().optional(),
})

export type HoldingsUploadResult = z.infer<typeof HoldingsUploadResultSchema>
```

### 3.2 Update IPC Functions to Use Validation

**File to modify:** `src/lib/ipc.ts`

For EACH IPC function, wrap the return value with `validateResponse`:

```typescript
import {
  EngineHealthSchema,
  DashboardDataSchema,
  PositionSchema,
  PipelineResultSchema,
  SystemLogReportSchema,
  HoldingsUploadResultSchema,
  type EngineHealth,
  type DashboardData,
  type Position,
  type PipelineResult,
  type SystemLogReport,
  type HoldingsUploadResult,
} from './schemas/ipc'

// BEFORE (BAD)
export async function getEngineHealth(): Promise<EngineHealth> {
  return await callCommand('get_engine_health', {})
}

// AFTER (GOOD)
export async function getEngineHealth(): Promise<EngineHealth> {
  const data = await callCommand('get_engine_health', {})
  return validateResponse(EngineHealthSchema, data)
}

// BEFORE (BAD)
export async function getDashboardData(): Promise<DashboardData> {
  return await callCommand('get_dashboard_data', {})
}

// AFTER (GOOD)
export async function getDashboardData(): Promise<DashboardData> {
  const data = await callCommand('get_dashboard_data', {})
  return validateResponse(DashboardDataSchema, data)
}

// BEFORE (BAD)
export async function getPositions(): Promise<Position[]> {
  return await callCommand('get_positions', {})
}

// AFTER (GOOD)
export async function getPositions(): Promise<Position[]> {
  const data = await callCommand('get_positions', {})
  return validateResponse(z.array(PositionSchema), data)
}

// Continue for ALL other IPC functions...
```

### 3.3 Functions to Update (Complete List)

| Function | Schema to Use |
|----------|---------------|
| `getEngineHealth` | `EngineHealthSchema` |
| `getDashboardData` | `DashboardDataSchema` |
| `getPositions` | `z.array(PositionSchema)` |
| `syncPortfolio` | `PipelineResultSchema` |
| `uploadHoldings` | `HoldingsUploadResultSchema` |
| `runPipeline` | `PipelineResultSchema` |
| `getRecentReports` | `z.array(SystemLogReportSchema)` |
| `getPendingReviews` | `z.array(SystemLogReportSchema)` |
| `getHiveContribution` | Define new schema |
| `getPipelineDiagnostics` | Define new schema |

### 3.4 Update Existing Types

**File to modify:** `src/types/index.ts`

Remove duplicate type definitions and re-export from schemas:

```typescript
// Re-export types from Zod schemas (single source of truth)
export type {
  EngineHealth,
  DashboardData,
  Position,
  PipelineResult,
  SystemLogReport,
  HoldingsUploadResult,
} from '@/lib/schemas/ipc'
```

### 3.5 Handle Validation Errors in UI

Ensure components using IPC functions have error boundaries or try/catch:

```typescript
// In a React component or hook
try {
  const data = await getDashboardData()
  // data is now guaranteed to match DashboardDataSchema
} catch (error) {
  if (error instanceof ValidationError) {
    logger.error('[Dashboard] IPC response validation failed', error)
    // Show user-friendly error, not raw Zod issues
  }
  throw error
}
```

## 4. Testing Verification

### 4.1 Unit Test for Schema Validation
```typescript
// src/lib/schemas/ipc.test.ts
import { EngineHealthSchema } from './ipc'

describe('EngineHealthSchema', () => {
  it('validates correct data', () => {
    const valid = {
      status: 'healthy',
      python_version: '3.12.0',
      uptime_seconds: 1234,
      last_sync: '2026-01-26T10:00:00Z',
    }
    expect(() => EngineHealthSchema.parse(valid)).not.toThrow()
  })

  it('rejects invalid status', () => {
    const invalid = {
      status: 'broken', // Not in enum
      python_version: '3.12.0',
      uptime_seconds: 1234,
      last_sync: null,
    }
    expect(() => EngineHealthSchema.parse(invalid)).toThrow()
  })
})
```

### 4.2 Integration Test
```bash
# Start the app and verify dashboard loads
npm run tauri dev

# Check console for ValidationError
# If Python returns unexpected shape, we should see clear error
```

## 5. Acceptance Criteria

- [ ] `src/lib/schemas/ipc.ts` contains Zod schemas for ALL IPC response types
- [ ] Every function in `src/lib/ipc.ts` that returns data calls `validateResponse`
- [ ] `src/types/index.ts` re-exports types from Zod schemas (no duplicate definitions)
- [ ] Running `grep -n "callCommand.*{}" src/lib/ipc.ts` shows all calls wrapped with validation
- [ ] Unit tests exist for critical schemas
- [ ] Application still functions correctly with validated data

## 6. Related Files

| File | Action |
|------|--------|
| `src/lib/schemas/ipc.ts` | CREATE - Define all IPC schemas |
| `src/lib/ipc.ts` | MODIFY - Wrap all returns with validateResponse |
| `src/types/index.ts` | MODIFY - Remove duplicates, re-export from schemas |
| `src/lib/schemas/ipc.test.ts` | CREATE - Unit tests for schemas |

## 7. Dependencies

- Zod is already installed (`package.json` shows `"zod": "^4.3.6"`)
- No new dependencies required
