import { prisma } from '@/lib/prisma'
import { DEFAULT_WALLET_PURPOSE, isWalletPurpose, type WalletPurpose } from '@/types/walletPurpose'

export function parseWalletPurposeMap(value: string | null | undefined): Record<string, WalletPurpose> {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, WalletPurpose] => isWalletPurpose(entry[1])),
    )
  } catch {
    return {}
  }
}

export async function getWalletPurposeMap(): Promise<Record<string, WalletPurpose>> {
  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      purpose: true,
    },
  })

  return Object.fromEntries(
    wallets.map((wallet) => [
      wallet.id,
      isWalletPurpose(wallet.purpose) ? wallet.purpose : DEFAULT_WALLET_PURPOSE,
    ]),
  )
}

export async function setWalletPurpose(walletId: string, purpose: WalletPurpose): Promise<Record<string, WalletPurpose>> {
  await prisma.wallet.update({
    where: { id: walletId },
    data: { purpose: purpose || DEFAULT_WALLET_PURPOSE },
  })

  return getWalletPurposeMap()
}
