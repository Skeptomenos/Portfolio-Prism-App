/**
 * Dashboard Feature Zod Schemas
 *
 * Runtime validation schemas for dashboard IPC responses.
 * These schemas provide type safety at the boundary where data enters the frontend.
 */

import { z } from 'zod'

// =============================================================================
// Base Schemas (reusable building blocks)
// =============================================================================

export const HoldingSchema = z.object({
  isin: z.string(),
  name: z.string(),
  ticker: z.string().optional(),
  value: z.number(),
  weight: z.number(),
  pnl: z.number(),
  pnlPercentage: z.number(),
})

export const AllocationDataSchema = z.object({
  sector: z.record(z.string(), z.number()),
  region: z.record(z.string(), z.number()),
})

export const HistoryPointSchema = z.object({
  date: z.string(),
  value: z.number(),
})

// =============================================================================
// Dashboard Response Schema
// =============================================================================

export const DashboardDataSchema = z.object({
  totalValue: z.number(),
  totalGain: z.number(),
  gainPercentage: z.number(),
  dayChange: z.number(),
  dayChangePercent: z.number(),
  history: z.array(HistoryPointSchema),
  allocations: AllocationDataSchema,
  topHoldings: z.array(HoldingSchema),
  lastUpdated: z.string().nullable(),
  isEmpty: z.boolean(),
  positionCount: z.number(),
})

// =============================================================================
// X-Ray Response Schemas (also used in dashboard feature)
// =============================================================================

export const ResolutionStatusSchema = z.enum(['resolved', 'unresolved', 'skipped', 'unknown'])

export const XRayHoldingSchema = z.object({
  stock: z.string(),
  ticker: z.string(),
  isin: z.string().nullable().optional(),
  totalValue: z.number(),
  sector: z.string().optional(),
  geography: z.string().optional(),
  sources: z.array(
    z.object({
      etf: z.string(),
      value: z.number(),
      weight: z.number(),
    })
  ),
  resolutionStatus: ResolutionStatusSchema,
  resolutionSource: z.string().optional(),
  resolutionConfidence: z.number(),
  resolutionDetail: z.string().optional(),
})

export const ResolutionSummarySchema = z.object({
  total: z.number(),
  resolved: z.number(),
  unresolved: z.number(),
  skipped: z.number(),
  unknown: z.number(),
  bySource: z.record(z.string(), z.number()),
  healthScore: z.number(),
})

export const TrueHoldingsResponseSchema = z.object({
  holdings: z.array(XRayHoldingSchema),
  summary: ResolutionSummarySchema,
})

// =============================================================================
// Inferred Types (use these instead of manual interfaces)
// =============================================================================

export type Holding = z.infer<typeof HoldingSchema>
export type AllocationData = z.infer<typeof AllocationDataSchema>
export type DashboardData = z.infer<typeof DashboardDataSchema>
export type XRayHolding = z.infer<typeof XRayHoldingSchema>
export type ResolutionSummary = z.infer<typeof ResolutionSummarySchema>
export type TrueHoldingsResponse = z.infer<typeof TrueHoldingsResponseSchema>
