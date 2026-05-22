export const WALLET_PURPOSES = ['operational', 'savings', 'reserve'] as const

export type WalletPurpose = typeof WALLET_PURPOSES[number]

export const DEFAULT_WALLET_PURPOSE: WalletPurpose = 'operational'
export const WALLET_PURPOSE_SETTING_KEY = 'wallet_purpose_map'

export const WALLET_PURPOSE_LABELS: Record<WalletPurpose, string> = {
  operational: 'Operational',
  savings: 'Savings',
  reserve: 'Reserve',
}

export function isWalletPurpose(value: unknown): value is WalletPurpose {
  return typeof value === 'string' && WALLET_PURPOSES.includes(value as WalletPurpose)
}