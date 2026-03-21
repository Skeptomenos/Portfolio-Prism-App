export type { SessionCheck, AuthResponse, Position } from '../../types'

export interface HoldingsUploadProps {
  isOpen: boolean
  onClose: () => void
  etfIsin: string
  etfTicker: string
  onSuccess?: () => void
}

export interface HoldingsUploadResult {
  holdingsCount: number
  totalWeight: number
  contributedToHive: boolean
}
