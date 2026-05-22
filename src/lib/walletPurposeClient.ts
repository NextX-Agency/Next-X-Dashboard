import { DEFAULT_WALLET_PURPOSE, type WalletPurpose } from '@/types/walletPurpose'

interface WalletPurposeMapResponse {
  data?: Record<string, WalletPurpose>
  error?: string
}

export async function fetchWalletPurposeMap(): Promise<Record<string, WalletPurpose>> {
  const response = await fetch('/api/wallets/purpose', {
    cache: 'no-store',
  })

  const payload = await response.json() as WalletPurposeMapResponse

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load wallet purposes.')
  }

  return payload.data ?? {}
}

export async function updateWalletPurpose(walletId: string, purpose: WalletPurpose = DEFAULT_WALLET_PURPOSE): Promise<void> {
  const response = await fetch('/api/wallets/purpose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletId, purpose }),
  })

  const payload = await response.json() as WalletPurposeMapResponse

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to save wallet purpose.')
  }
}