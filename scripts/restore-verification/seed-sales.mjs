// Seed for the T-11 sale-creation checks.
//
// One location, one operational SRD cash wallet, one seller with a
// category-specific commission rate, and two stocked items.
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

const prisma = new PrismaClient()
const hash = (v) => createHash('sha256').update(v).digest('hex')
export const SESSION_TOKEN = 't11-verification-token'

async function main() {
  const location = await prisma.location.create({
    data: { name: 'Paramaribo-Noord', is_active: true, commission_rate: 5 },
  })

  const admin = await prisma.user.create({
    data: { email: 'admin@t11.local', name: 'T11 Admin', role: 'admin', passwordHash: 'x', isActive: true },
  })

  await prisma.appSession.create({
    data: {
      userId: admin.id,
      tokenHash: hash(SESSION_TOKEN),
      expiresAt: new Date(Date.now() + 86400000),
    },
  })

  await prisma.exchangeRate.create({ data: { usdToSrd: 38, isActive: true } })

  const audio = await prisma.category.create({ data: { name: 'Audio' } })
  const watches = await prisma.category.create({ data: { name: 'Watches' } })

  const speaker = await prisma.item.create({
    data: {
      name: 'Test Speaker', categoryId: audio.id, purchasePriceUsd: 100,
      sellingPriceSrd: 1000, allow_custom_price: true,
    },
  })
  const watch = await prisma.item.create({
    data: {
      name: 'Test Watch', categoryId: watches.id, purchasePriceUsd: 50,
      sellingPriceSrd: 500, allow_custom_price: false,
    },
  })

  await prisma.stock.createMany({
    data: [
      { itemId: speaker.id, locationId: location.id, quantity: 100 },
      { itemId: watch.id, locationId: location.id, quantity: 100 },
    ],
  })

  const wallet = await prisma.wallet.create({
    data: {
      personName: 'Kas Noord', type: 'cash', currency: 'SRD',
      balance: 0, purpose: 'operational', location_id: location.id,
    },
  })

  const seller = await prisma.seller.create({
    data: { name: 'Rico', commissionRate: 10, location_id: location.id },
  })
  // Watches pay a different rate, so the per-category grouping is exercised.
  await prisma.seller_category_rates.create({
    data: { seller_id: seller.id, category_id: watches.id, commission_rate: 20 },
  })

  console.log(JSON.stringify({
    locationId: location.id, walletId: wallet.id, sellerId: seller.id,
    speakerId: speaker.id, watchId: watch.id,
    audioCategoryId: audio.id, watchCategoryId: watches.id,
    sessionToken: SESSION_TOKEN,
  }, null, 2))
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(1)
})
