// Seed for the T-17 inventory-health check.
//
// This is the real production shape, reduced to what the calculation depends
// on: 38 stocked item/location rows carrying (quantity, purchase price USD,
// units sold in the last 90 days). Item names and ids do not affect any
// figure, so they are generated.
//
// The plan publishes four numbers measured against production
// (USD 503.02 dead, USD 177.90 overstocked, USD 680.92 releasable, 26 of 38
// dead) and says that if your query produces anything else, your query is
// wrong. This fixture is what lets that be checked without touching production.
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const prisma = new PrismaClient()
const hash = (v) => createHash('sha256').update(v).digest('hex')
const SESSION_TOKEN = 't17-verification-token'

// quantityOnHand, purchasePriceUsd, unitsSoldInLast90Days — production, 2026-08-13.
const FIXTURE = '2,12.00,0;1,16.00,0;1,12.78,0;1,16.86,0;1,30.00,0;1,30.00,0;1,14.33,0;1,1.80,0;6,1.80,0;1,10.28,0;3,1.80,0;6,1.80,0;5,14.00,3;1,13.78,0;1,32.00,0;1,32.00,1;1,30.00,0;1,15.24,0;1,15.24,0;1,13.32,0;3,1.50,4;15,1.50,13;2,5.05,7;4,11.00,1;1,40.00,0;1,14.19,0;3,12.00,1;1,12.00,3;2,3.60,0;3,3.60,1;3,5.05,3;1,30.00,0;1,15.00,0;1,30.00,0;2,24.00,0;9,1.90,5;6,1.90,14;1,16.00,0'

async function main() {
  const location = await prisma.location.create({ data: { name: 'Fixture Branch', is_active: true } })
  const admin = await prisma.user.create({
    data: { email: 'admin@t17.local', name: 'T17 Admin', role: 'admin', passwordHash: 'x', isActive: true },
  })
  await prisma.appSession.create({
    data: { userId: admin.id, tokenHash: hash(SESSION_TOKEN), expiresAt: new Date(Date.now() + 86400000) },
  })
  await prisma.exchangeRate.create({ data: { usdToSrd: 38, isActive: true } })
  const category = await prisma.category.create({ data: { name: 'Fixture' } })

  const rows = FIXTURE.split(';').map((chunk, index) => {
    const [quantity, price, sold] = chunk.split(',')
    return { index, quantity: Number(quantity), price: Number(price), sold: Number(sold) }
  })

  // Each fixture row becomes its own item so that per item+location velocity
  // matches the production figure exactly.
  for (const row of rows) {
    const item = await prisma.item.create({
      data: {
        name: `Fixture item ${row.index + 1}`,
        categoryId: category.id,
        purchasePriceUsd: row.price,
        sellingPriceSrd: 1000,
      },
    })
    await prisma.stock.create({
      data: { itemId: item.id, locationId: location.id, quantity: row.quantity },
    })
    if (row.sold > 0) {
      // One sale inside the 90-day window carrying the observed unit count.
      const sale = await prisma.sale.create({
        data: {
          locationId: location.id, currency: 'SRD', totalAmount: 1000,
          paymentMethod: 'cash', createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.saleItem.create({
        data: { saleId: sale.id, itemId: item.id, quantity: row.sold, unitPrice: 1000 / row.sold, subtotal: 1000 },
      })
    }
  }

  console.log(JSON.stringify({ locationId: location.id, sessionToken: SESSION_TOKEN, rows: rows.length }, null, 2))
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1)
})
