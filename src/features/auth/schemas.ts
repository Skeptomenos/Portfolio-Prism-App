import { z } from 'zod'

export const AuthStateSchema = z.enum(['idle', 'waiting_2fa', 'authenticated', 'error'])

export const AuthStatusSchema = z.object({
  authState: AuthStateSchema,
  hasStoredCredentials: z.boolean(),
  lastError: z.string().nullable().optional(),
})

export const SessionCheckSchema = z.object({
  hasSession: z.boolean(),
  phoneNumber: z.string().nullable().optional(),
  prompt: z.enum(['restore_session', 'login_required']),
})

export const AuthResponseSchema = z.object({
  authState: AuthStateSchema,
  message: z.string(),
  countdown: z.number().optional(),
})

export const LogoutResponseSchema = z.object({
  authState: z.literal('idle'),
  message: z.string(),
})

export const StoredCredentialsSchema = z.object({
  hasCredentials: z.boolean(),
  maskedPhone: z.string().nullable(),
})

export type AuthState = z.infer<typeof AuthStateSchema>
export type AuthStatus = z.infer<typeof AuthStatusSchema>
export type SessionCheck = z.infer<typeof SessionCheckSchema>
export type AuthResponse = z.infer<typeof AuthResponseSchema>
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>
export type StoredCredentials = z.infer<typeof StoredCredentialsSchema>
