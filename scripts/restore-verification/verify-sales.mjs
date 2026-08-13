// T-11 verification: POST /api/sales must be atomic and concurrency-safe.
//
// Four checks, each stated so it can only pass for the right reason:
//
//   1. A normal sale writes header, lines, stock, commissions, wallet credit,
//      wallet transaction and ledger entry — consistently, in one go.
//   2. CONTROL — the read-modify-write the old client used
//      (`sales/page.tsx:715` wrote `matchingWallet.balance + total` from a
//      balance read at page load) loses money under concurrency. This must FAIL,
//      or check 3 proves nothing.
//   3. Two concurrent sales through the route leave the wallet holding the sum
//      of both.
//   4. A failure injected after the sale header is written leaves nothing
//      behind — no orphan header, no stock decrement, no commission.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const BASE = 'http://127.0.0.1:3210'
const ids = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const COOKIE = `nextics_session=${ids.sessionToken}`
const prisma = new PrismaClient()

const post = (body) => fetch(`${BASE}/api/sales`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
  body: JSON.stringify(body),
})

const money = (v) => Math.round(Number(v) * 100) / 100

async function walletBalance() {
  const w = await prisma.wallet.findUnique({ where: { id: ids.walletId }, select: { balance: true } })
  return money(w.balance)
}

async function counts() {
  const [sales, saleItems, walletTx, ledger, commissions] = await Promise.all([
    prisma.sale.count(), prisma.saleItem.count(), prisma.wallet_transactions.count(),
    prisma.financeLedgerEntry.count(), prisma.commission.count(),
  ])
  return { sales, saleItems, walletTx, ledger, commissions }
}

async function stockOf(itemId) {
  const s = await prisma.stock.findFirst({ where: { itemId, locationId: ids.locationId }, select: { quantity: true } })
  return s.quantity
}

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`)
  if (detail) console.log(`       ${detail}`)
}

// ---------------------------------------------------------------- check 1
async function checkHappyPath() {
  const before = await walletBalance()
  const stockBefore = await stockOf(ids.speakerId)

  const res = await post({
    locationId: ids.locationId, currency: 'SRD', paymentMethod: 'cash', sellerId: ids.sellerId,
    items: [
      { itemId: ids.speakerId, quantity: 2 },          // 2 x 1000 = 2000, audio @10%
      { itemId: ids.watchId, quantity: 1 },            // 1 x  500 =  500, watches @20%
    ],
    combos: [],
  })
  const body = await res.json()
  if (!res.ok) return record('normal sale is written', false, `HTTP ${res.status}: ${body.error}`)

  const sale = await prisma.sale.findUnique({
    where: { id: body.data.saleId },
    select: { totalAmount: true, sellerId: true, saleItems: { select: { subtotal: true } }, commissions: { select: { commissionAmount: true, commission_rate: true } } },
  })
  const lineSum = money(sale.saleItems.reduce((s, l) => s + Number(l.subtotal), 0))
  const commissionSum = money(sale.commissions.reduce((s, c) => s + Number(c.commissionAmount), 0))
  const after = await walletBalance()
  const stockAfter = await stockOf(ids.speakerId)
  const ledgerRow = await prisma.financeLedgerEntry.findFirst({
    where: { sourceId: body.data.saleId }, select: { amount: true, direction: true },
  })

  // audio 2000 @10% = 200; watches 500 @20% = 100 → 300
  const ok = money(sale.totalAmount) === 2500
    && lineSum === 2500
    && after === money(before + 2500)
    && stockAfter === stockBefore - 2
    && commissionSum === 300
    && sale.commissions.length === 2
    && ledgerRow && money(ledgerRow.amount) === 2500 && ledgerRow.direction === 'in'

  record('normal sale is written consistently', ok,
    `total=${money(sale.totalAmount)} lines=${lineSum} wallet ${before}->${after} stock ${stockBefore}->${stockAfter} `
    + `commissions=${commissionSum} across ${sale.commissions.length} rows (rates ${sale.commissions.map(c => c.commission_rate).join('/')})`)
}

// ---------------------------------------------------------------- check 2 (control)
async function checkControlReadModifyWrite() {
  // Reproduce the exact anti-pattern the old page used: read the balance once,
  // then have two "sales" each write back readValue + amount.
  const start = await walletBalance()
  const readAtPageLoad = start

  await Promise.all([
    prisma.wallet.update({ where: { id: ids.walletId }, data: { balance: money(readAtPageLoad + 100) } }),
    prisma.wallet.update({ where: { id: ids.walletId }, data: { balance: money(readAtPageLoad + 200) } }),
  ])

  const after = await walletBalance()
  const expectedIfCorrect = money(start + 300)
  const lost = money(expectedIfCorrect - after)

  // This is the bug. It must reproduce, otherwise check 3 is not testing anything.
  record('CONTROL: old read-modify-write loses money (expected to lose)', lost > 0,
    `wallet ${start} + 100 + 200 should be ${expectedIfCorrect}, actually ${after} — lost ${lost}`)

  await prisma.wallet.update({ where: { id: ids.walletId }, data: { balance: start } })
}

// ---------------------------------------------------------------- check 3
async function checkConcurrentSales() {
  const before = await walletBalance()

  const sale = (quantity) => post({
    locationId: ids.locationId, currency: 'SRD', paymentMethod: 'cash', sellerId: ids.sellerId,
    items: [{ itemId: ids.speakerId, quantity }],
    combos: [],
  })

  // 1 x 1000 and 3 x 1000, fired together at the same wallet.
  const [a, b] = await Promise.all([sale(1), sale(3)])
  const [bodyA, bodyB] = await Promise.all([a.json(), b.json()])
  const okBoth = a.ok && b.ok
  const after = await walletBalance()
  const expected = money(before + 4000)

  record('two concurrent sales both land in full', okBoth && after === expected,
    okBoth
      ? `wallet ${before} -> ${after}, expected ${expected}`
      : `one request failed: ${bodyA.error ?? ''} ${bodyB.error ?? ''}`.trim())
}

// ---------------------------------------------------------------- check 4
async function checkRollbackOnLateFailure() {
  const before = await counts()
  const balanceBefore = await walletBalance()
  const stockBefore = await stockOf(ids.watchId)

  // Fail the transaction at the wallet_transactions insert — after the header,
  // the lines, the stock decrement and the commissions have all been written.
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION t11_fail_late() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 't11 injected failure'; END; $$;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER t11_fail_late_trigger BEFORE INSERT ON public.wallet_transactions
    FOR EACH ROW WHEN (NEW.amount = 777) EXECUTE FUNCTION t11_fail_late();
  `)

  let status, errText
  try {
    // 777 SRD exactly: 1 watch at a custom price.
    const res = await post({
      locationId: ids.locationId, currency: 'SRD', paymentMethod: 'cash', sellerId: ids.sellerId,
      items: [{ itemId: ids.speakerId, quantity: 1, customPrice: 777, discountReason: 'injected failure test' }],
      combos: [],
    })
    status = res.status
    errText = (await res.json()).error
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS t11_fail_late_trigger ON public.wallet_transactions')
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS t11_fail_late()')
  }

  const after = await counts()
  const balanceAfter = await walletBalance()
  const stockAfter = await stockOf(ids.watchId)
  const drift = Object.keys(before).filter((k) => before[k] !== after[k])

  record('failure after the header leaves nothing behind',
    status >= 400 && drift.length === 0 && balanceAfter === balanceBefore && stockAfter === stockBefore,
    `HTTP ${status} (${errText}); counts ${JSON.stringify(before)} -> ${JSON.stringify(after)}; wallet ${balanceBefore} -> ${balanceAfter}`)
}

// ---------------------------------------------------------------- check 5
async function checkComboSplitsExactly() {
  // A price that does not divide evenly across three units. The old client
  // computed each member's share independently, so rounding could leave the
  // lines a cent away from the combo price — a header/line mismatch of exactly
  // the kind T-09 has to flag.
  const before = await walletBalance()
  const res = await post({
    locationId: ids.locationId, currency: 'SRD', paymentMethod: 'cash', sellerId: ids.sellerId,
    items: [],
    combos: [{
      name: 'Bundle',
      comboPrice: 1000.01,
      items: [
        { itemId: ids.speakerId, quantity: 1 },
        { itemId: ids.watchId, quantity: 2 },
      ],
    }],
  })
  const body = await res.json()
  if (!res.ok) return record('combo lines sum exactly to the combo price', false, `HTTP ${res.status}: ${body.error}`)

  const sale = await prisma.sale.findUnique({
    where: { id: body.data.saleId },
    select: { totalAmount: true, saleItems: { select: { subtotal: true } }, commissions: { select: { commissionAmount: true } } },
  })
  const lineSum = money(sale.saleItems.reduce((s, l) => s + Number(l.subtotal), 0))
  const after = await walletBalance()

  record('combo lines sum exactly to the combo price', lineSum === 1000.01 && money(sale.totalAmount) === 1000.01 && after === money(before + 1000.01),
    `combo price 1000.01, line sum ${lineSum}, header ${money(sale.totalAmount)}, wallet ${before} -> ${after}, `
    + `${sale.commissions.length} commission row for the bundle`)
}

async function main() {
  await checkHappyPath()
  await checkControlReadModifyWrite()
  await checkConcurrentSales()
  await checkRollbackOnLateFailure()
  await checkComboSplitsExactly()

  // Invariant that must hold no matter what: every wallet transaction has a
  // ledger entry, and no sale header is left without lines.
  const orphanHeaders = await prisma.sale.count({ where: { saleItems: { none: {} } } })
  const walletTx = await prisma.wallet_transactions.count()
  const ledger = await prisma.financeLedgerEntry.count()
  record('no orphan sale headers, ledger pairs 1:1', orphanHeaders === 0 && walletTx === ledger,
    `orphan headers=${orphanHeaders}, wallet_transactions=${walletTx}, ledger=${ledger}`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'='.repeat(46)}`)
  console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`)
  console.log('='.repeat(46))
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(2)
})
