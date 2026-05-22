export type FinancialHealthTone = 'emerald' | 'blue' | 'amber' | 'red'

export interface FinancialHealthScore {
  score: number
  label: string
  tone: FinancialHealthTone
  summary: string
  profitability: number
  liquidity: number
  reconciliation: number
  inventory: number
  liquidityCoverage: number
}

export interface FinancialHealthInput {
  totalRevenue: number
  totalNetProfit: number
  totalExpenses: number
  totalCommissions: number
  liquidBalance: number
  openPurchaseCommitment: number
  walletNetChange: number
  salesCreditGap: number
  expenseDebitGap: number
  unmappedRevenue: number
  walletSalesMapped: number
  expensesBookedToWallets: number
  daysOfInventory: number | null
  inventoryValue: number
  inventoryDataLimited?: boolean
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function calculateFinancialHealthScore(input: FinancialHealthInput): FinancialHealthScore {
  const profitability = input.totalRevenue <= 0
    ? 0
    : clampScore((((input.totalNetProfit / input.totalRevenue) * 100) + 15) * 3.5 + (input.totalNetProfit > 0 ? 5 : 0))

  const liquidityBase = input.totalExpenses + input.totalCommissions + (input.openPurchaseCommitment * 0.5)
  const liquidityCoverage = input.liquidBalance / Math.max(1, liquidityBase)
  const liquidity = clampScore((liquidityCoverage * 75) + (input.walletNetChange >= 0 ? 5 : 0))

  const reconciliationExposure = Math.abs(input.salesCreditGap) + Math.abs(input.expenseDebitGap) + Math.abs(input.unmappedRevenue)
  const reconciliationBase = Math.max(input.totalRevenue, input.walletSalesMapped, input.expensesBookedToWallets, 1)
  const reconciliation = clampScore(100 - ((reconciliationExposure / reconciliationBase) * 120))

  let inventory = 60
  if (!input.inventoryDataLimited) {
    inventory = 70
    if (input.daysOfInventory === null) inventory = 55
    else if (input.daysOfInventory <= 60) inventory = 90
    else if (input.daysOfInventory <= 120) inventory = 78
    else if (input.daysOfInventory <= 180) inventory = 65
    else if (input.daysOfInventory <= 365) inventory = 45
    else inventory = 30

    if (input.openPurchaseCommitment > input.liquidBalance && input.liquidBalance > 0) {
      inventory -= 10
    }
    if (input.inventoryValue <= 0) {
      inventory -= 5
    }
    inventory = clampScore(inventory)
  }

  const weights = input.inventoryDataLimited
    ? {
        profitability: 0.4,
        liquidity: 0.3,
        reconciliation: 0.3,
        inventory: 0,
      }
    : {
        profitability: 0.35,
        liquidity: 0.25,
        reconciliation: 0.25,
        inventory: 0.15,
      }

  const score = clampScore(
    (profitability * weights.profitability) +
    (liquidity * weights.liquidity) +
    (reconciliation * weights.reconciliation) +
    (inventory * weights.inventory)
  )

  const weakestArea = [
    { key: 'profitability', value: profitability },
    { key: 'liquidity', value: liquidity },
    { key: 'reconciliation', value: reconciliation },
    ...(input.inventoryDataLimited ? [] : [{ key: 'inventory', value: inventory }]),
  ].sort((left, right) => left.value - right.value)[0]?.key

  const inventoryNote = input.inventoryDataLimited
    ? ' Inventory pressure is excluded here because historical stock snapshots are not stored.'
    : ''

  if (score >= 85) {
    return {
      score,
      label: 'Strong',
      tone: 'emerald',
      summary: `Profitability, cash cover, and reconciliation are working together well.${inventoryNote}`,
      profitability,
      liquidity,
      reconciliation,
      inventory,
      liquidityCoverage,
    }
  }

  if (score >= 70) {
    return {
      score,
      label: 'Healthy',
      tone: 'blue',
      summary: `${weakestArea === 'liquidity'
        ? 'Business health is solid, but liquid cash cover deserves attention.'
        : 'The business is in decent shape, with one weaker area worth tightening.'}${inventoryNote}`,
      profitability,
      liquidity,
      reconciliation,
      inventory,
      liquidityCoverage,
    }
  }

  if (score >= 55) {
    return {
      score,
      label: 'Watch',
      tone: 'amber',
      summary: `${weakestArea === 'reconciliation'
        ? 'Wallet mismatches are reducing confidence in the numbers.'
        : weakestArea === 'profitability'
          ? 'Revenue is not converting into enough net profit.'
          : weakestArea === 'inventory'
            ? 'Too much value is tied up in stock or purchase commitments.'
            : 'Liquidity is tighter than ideal against current obligations.'}${inventoryNote}`,
      profitability,
      liquidity,
      reconciliation,
      inventory,
      liquidityCoverage,
    }
  }

  return {
    score,
    label: 'At Risk',
    tone: 'red',
    summary: `${weakestArea === 'reconciliation'
      ? 'The financial picture is too noisy because wallet activity does not fully line up.'
      : weakestArea === 'profitability'
        ? 'The business is not turning enough revenue into profit.'
        : weakestArea === 'inventory'
          ? 'Inventory pressure is heavy relative to current movement and cash.'
          : 'Cash cover is under pressure relative to current obligations.'}${inventoryNote}`,
    profitability,
    liquidity,
    reconciliation,
    inventory,
    liquidityCoverage,
  }
}