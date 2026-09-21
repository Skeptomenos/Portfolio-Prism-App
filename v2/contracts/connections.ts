import { Schema } from 'effect'
export const ConnectionStatusSchema = Schema.Struct({
  id: Schema.String, providerId: Schema.String, providerVersion: Schema.String,
  enabled: Schema.Boolean, available: Schema.Boolean, connected: Schema.Boolean,
  phase: Schema.String, error: Schema.NullOr(Schema.String), active: Schema.Boolean,
  savedHoldingsAt: Schema.NullOr(Schema.String),
})
export const ConnectionsSchema = Schema.Struct({ connections: Schema.Array(ConnectionStatusSchema) })
export type ConnectionStatus = typeof ConnectionStatusSchema.Type
export const decodeConnections = Schema.decodeUnknownSync(ConnectionsSchema)
