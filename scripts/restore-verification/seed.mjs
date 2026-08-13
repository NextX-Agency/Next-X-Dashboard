// T-01 verification seed: a small but structurally representative dataset.
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const prisma = new PrismaClient()
// Must match hashSessionToken in src/lib/sessions.ts exactly.
const hash = (v) => createHash('sha256').update(v).digest('hex')

const SESSION_TOKEN = 't01-verification-token'

async function main() {
  const location = await prisma.location.create({
    data: { name: 'Paramaribo-Noord', address: 'Test', is_active: true },
  })

  const admin = await prisma.user.create({
    data: {
      email: 'admin@t01.local',
      name: 'T01 Admin',
      role: 'admin',
      passwordHash: 'x',
      isActive: true,
    },
  })

  const category = await prisma.category.create({ data: { name: 'Audio' } })

  const item = await prisma.item.create({
    data: {
      name: 'Test Speaker',
      categoryId: category.id,
      purchasePriceUsd: 100,
      sellingPriceSrd: 5000,
    },
  })

  await prisma.stock.create({
    data: { itemId: item.id, locationId: location.id, quantity: 10 },
  })

  const wallet = await prisma.wallet.create({
    data: {
      personName: 'Kas Noord',
      type: 'cash',
      currency: 'SRD',
      balance: 1000,
      location_id: location.id,
    },
  })

  const sale = await prisma.sale.create({
    data: {
      locationId: location.id,
      totalAmount: 5000,
      paymentMethod: 'cash',
      currency: 'SRD',
      exchangeRate: 38,
      wallet_id: wallet.id,
    },
  })

  await prisma.saleItem.create({
    data: {
      saleId: sale.id,
      itemId: item.id,
      quantity: 1,
      unitPrice: 5000,
      subtotal: 5000,
    },
  })

  // This insert fires wallet_transactions_capture_ledger, which mirrors it into
  // finance_ledger_entries — exactly as production does.
  await prisma.wallet_transactions.create({
    data: {
      wallet_id: wallet.id,
      type: 'income',
      amount: 5000,
      balance_before: 1000,
      balance_after: 6000,
      currency: 'SRD',
      reference_type: 'sale',
      sale_id: sale.id,
      description: 'T-01 seed sale',
    },
  })

  await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: 6000 } })

  const expenseCategory = await prisma.expenseCategory.create({ data: { name: 'Shipping' } })
  await prisma.expense.create({
    data: {
      categoryId: expenseCategory.id,
      walletId: wallet.id,
      location_id: location.id,
      amount: 250,
      currency: 'SRD',
      description: 'T-01 seed expense',
    },
  })

  await prisma.appSession.create({
    data: {
      userId: admin.id,
      tokenHash: hash(SESSION_TOKEN),
      userAgentHash: hash(''),
      ipHash: hash(''),
      expiresAt: new Date(Date.now() + 86400000),
    },
  })

  console.log('seeded. session token:', SESSION_TOKEN)
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
