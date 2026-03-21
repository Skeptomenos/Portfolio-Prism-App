import { z } from 'zod'

export const EngineHealthSchema = z.object({
  version: z.string(),
  memoryUsageMb: z.number(),
  uptime: z.number().optional(),
  sessionId: z.string().optional(),
})

export type EngineHealth = z.infer<typeof EngineHealthSchema>
