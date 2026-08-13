// Reproduce production's *shape* locally, so the unapplied T-06 / T-09 / T-12
// migrations can be run for real and their in-transaction assertions checked.
//
// Matches the Part 6 baseline exactly: 149 sales, 306 sale_items,
// 490 wallet_transactions, 490 ledger entries, 83 expenses,
// SRD 42,005.99 / USD 534.00 — plus the Part 5 anomalies the migrations assert
// on: 4 sales with no lines, 4 header/line mismatches, 5 zero-cost items,
// 9 "Personal Items" expenses, and 15 sales with no exchange rate.
//
// Values are synthetic. Only the counts and the anomaly structure matter.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const location = await prisma.location.create({ data: { name: 'Shape Branch', is_active: true } })
  const category = await prisma.category.create({ data: { name: 'Shape' } })

  const normalCat = await prisma.expenseCategory.create({ data: { name: 'Business Expense' } })
  const personalCat = await prisma.expenseCategory.create({ data: { name: 'Personal Items' } })

  // Wallets summing to the baseline: SRD 42,005.99 and USD 534.00 over 13 wallets.
  const srdWallet = await prisma.wallet.create({
    data: { personName: 'Kas', type: 'cash', currency: 'SRD', balance: 42005.99, purpose: 'operational', location_id: location.id },
  })
  const usdWallet = await prisma.wallet.create({
    data: { personName: 'USD Kas', type: 'cash', currency: 'USD', balance: 534.00, purpose: 'operational', location_id: location.id },
  })
  // wallets carries a unique constraint on (location_id, type, currency,
  // purpose), so the remaining 11 need their own locations to exist at all.
  for (let i = 0; i < 11; i++) {
    const fillerLocation = await prisma.location.create({ data: { name: `Filler branch ${i}`, is_active: true } })
    await prisma.wallet.create({
      data: { personName: `Filler ${i}`, type: 'cash', currency: 'SRD', balance: 0, purpose: 'operational', location_id: fillerLocation.id },
    })
  }

  // 5 items with zero cost, plus normal ones.
  const zeroCostItems = []
  for (let i = 0; i < 5; i++) {
    zeroCostItems.push(await prisma.item.create({
      data: { name: `Zero cost ${i}`, categoryId: category.id, purchasePriceUsd: 0, sellingPriceSrd: 500 },
    }))
  }
  const normalItem = await prisma.item.create({
    data: { name: 'Normal item', categoryId: category.id, purchasePriceUsd: 10, sellingPriceSrd: 500 },
  })

  // 149 sales. Sales 0-3 get no line items. Sales 4-7 get a header that
  // disagrees with their line sum. 15 sales carry no exchange rate.
  let saleItemsCreated = 0
  const TOTAL_SALES = 149
  const TARGET_SALE_ITEMS = 306

  for (let i = 0; i < TOTAL_SALES; i++) {
    const noLines = i < 4
    const mismatch = i >= 4 && i < 8
    const sale = await prisma.sale.create({
      data: {
        locationId: location.id,
        currency: 'SRD',
        exchangeRate: i < 15 ? null : 38,
        totalAmount: mismatch ? 999 : 500,
        paymentMethod: 'cash',
        wallet_id: srdWallet.id,
      },
    })
    if (noLines) continue

    // Two lines on most sales, so the total lands on 306 exactly.
    const remainingSales = TOTAL_SALES - i
    const remainingItems = TARGET_SALE_ITEMS - saleItemsCreated
    const lines = Math.min(2, Math.max(1, Math.round(remainingItems / remainingSales)))
    for (let l = 0; l < lines && saleItemsCreated < TARGET_SALE_ITEMS; l++) {
      await prisma.saleItem.create({
        data: {
          saleId: sale.id,
          // Zero-cost items appear on real sale lines, so T-12's guard is exercised.
          itemId: l === 0 && i % 30 === 8 ? zeroCostItems[i % 5].id : normalItem.id,
          quantity: 1,
          unitPrice: 250,
          subtotal: 250,
        },
      })
      saleItemsCreated++
    }
  }

  // Top up to exactly 306 lines if the distribution fell short. The filler sale
  // must already have lines — attaching one to a deliberately empty header
  // would quietly destroy the anomaly the fixture exists to reproduce.
  if (saleItemsCreated < TARGET_SALE_ITEMS) {
    const filler = await prisma.sale.findFirst({
      where: { saleItems: { some: {} } },
      select: { id: true },
    })
    while (saleItemsCreated < TARGET_SALE_ITEMS) {
      await prisma.saleItem.create({
        data: { saleId: filler.id, itemId: normalItem.id, quantity: 1, unitPrice: 250, subtotal: 250 },
      })
      saleItemsCreated++
    }
  }

  // 83 expenses, 9 of them in "Personal Items".
  for (let i = 0; i < 83; i++) {
    await prisma.expense.create({
      data: {
        categoryId: i < 9 ? personalCat.id : normalCat.id,
        walletId: srdWallet.id,
        location_id: location.id,
        amount: 100,
        currency: 'SRD',
        description: `Shape expense ${i}`,
      },
    })
  }

  // 490 wallet transactions. The capture trigger mirrors each into the ledger.
  for (let i = 0; i < 490; i++) {
    await prisma.wallet_transactions.create({
      data: {
        wallet_id: i % 2 === 0 ? srdWallet.id : usdWallet.id,
        type: 'credit',
        amount: 1,
        balance_before: 0,
        balance_after: 1,
        currency: i % 2 === 0 ? 'SRD' : 'USD',
        description: `Shape tx ${i}`,
      },
    })
  }

  const counts = {
    sales: await prisma.sale.count(),
    saleItems: await prisma.saleItem.count(),
    walletTx: await prisma.wallet_transactions.count(),
    ledger: await prisma.financeLedgerEntry.count(),
    expenses: await prisma.expense.count(),
    srd: Number((await prisma.wallet.aggregate({ where: { currency: 'SRD' }, _sum: { balance: true } }))._sum.balance),
    usd: Number((await prisma.wallet.aggregate({ where: { currency: 'USD' }, _sum: { balance: true } }))._sum.balance),
  }
  console.log(JSON.stringify(counts, null, 2))
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1)
})
