import { prisma } from '@/lib/prisma'
import { DEFAULT_WALLET_PURPOSE, isWalletPurpose, WALLET_PURPOSE_SETTING_KEY, type WalletPurpose } from '@/types/walletPurpose'

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
  const setting = await prisma.storeSetting.findUnique({
    where: { key: WALLET_PURPOSE_SETTING_KEY },
    select: { value: true },
  })

  return parseWalletPurposeMap(setting?.value)
}

export async function setWalletPurpose(walletId: string, purpose: WalletPurpose): Promise<Record<string, WalletPurpose>> {
  const purposeMap = await getWalletPurposeMap()
  purposeMap[walletId] = purpose || DEFAULT_WALLET_PURPOSE

  await prisma.storeSetting.upsert({
    where: { key: WALLET_PURPOSE_SETTING_KEY },
    update: { value: JSON.stringify(purposeMap) },
    create: {
      key: WALLET_PURPOSE_SETTING_KEY,
      value: JSON.stringify(purposeMap),
    },
  })

  return purposeMap
}