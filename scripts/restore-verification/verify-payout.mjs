// T-07 verification: commission payouts must post an expense, move the wallet,
// and hit the ledger — atomically.
//
// The control reproduces the exact insert the browser used to make. It targets
// `category`, `payment_method` and `date` (no such columns) and omits the NOT
// NULL `wallet_id`. It must fail — and the point is that the old code never
// looked at the error, so 106 commissions worth SRD 9,458.05 are marked paid in
// production with no payout expense behind them (F-15).
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const BASE = 'http://127.0.0.1:3210'
const ids = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const COOKIE = `nextics_session=${ids.sessionToken}`
const prisma = new PrismaClient()

const money = (v) => Math.round(Number(v) * 100) / 100
const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`)
  if (detail) console.log(`       ${detail}`)
}

const createSale = (quantity) => fetch(`${BASE}/api/sales`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
  body: JSON.stringify({
    locationId: ids.locationId, currency: 'SRD', paymentMethod: 'cash', sellerId: ids.sellerId,
    items: [{ itemId: ids.speakerId, quantity }], combos: [],
  }),
}).then((r) => r.json())

const payout = (body) => fetch(`${BASE}/api/commissions/payout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
  body: JSON.stringify({ locationId: ids.locationId, walletId: ids.walletId, ...body }),
})

// ------------------------------------------------------------------ CONTROL
async function controlOldInsert() {
  let failed = false
  let message = ''
  try {
    // Byte-for-byte the shape the old client sent.
    await prisma.$executeRawUnsafe(`
      INSERT INTO public.expenses (location_id, category, description, amount, currency, payment_method, date)
      VALUES ($1, 'Commissions', 'Commission payout', 100, 'SRD', 'cash', NOW())
    `, ids.locationId)
  } catch (error) {
    failed = true
    message = String(error.message).split('\n').find((l) => l.includes('column')) || 'rejected'
  }
  record('CONTROL: the old expense insert is rejected by the database (expected)', failed,
    `${message.trim()} — the old code never checked this error, so the payout silently recorded nothing`)
}

// ------------------------------------------------------------------ payout
async function payoutPostsEverything() {
  await createSale(2)
  await createSale(1)

  const before = {
    expenses: await prisma.expense.count(),
    walletTx: await prisma.wallet_transactions.count(),
    ledger: await prisma.financeLedgerEntry.count(),
    unpaid: await prisma.commission.count({ where: { paid: false } }),
    balance: money((await prisma.wallet.findUnique({ where: { id: ids.walletId }, select: { balance: true } })).balance),
  }

  const res = await payout({})
  const body = await res.json()
  if (!res.ok) return record('payout posts expense, wallet debit and ledger entry', false, `HTTP ${res.status}: ${body.error}`)

  const after = {
    expenses: await prisma.expense.count(),
    walletTx: await prisma.wallet_transactions.count(),
    ledger: await prisma.financeLedgerEntry.count(),
    unpaid: await prisma.commission.count({ where: { paid: false } }),
    balance: money((await prisma.wallet.findUnique({ where: { id: ids.walletId }, select: { balance: true } })).balance),
  }

  const expense = await prisma.expense.findUnique({
    where: { id: body.data.expenseId },
    select: { amount: true, classification: true, walletId: true, vendorName: true },
  })

  const ok = after.expenses === before.expenses + 1
    && after.walletTx === before.walletTx + 1
    && after.ledger === before.ledger + 1
    && after.unpaid === 0
    && after.balance === money(before.balance - body.data.totalPaid)
    && expense.classification === 'payroll'
    && expense.walletId === ids.walletId
    && money(expense.amount) === body.data.totalPaid

  record('payout posts expense, wallet debit and ledger entry', ok,
    `paid ${body.data.totalPaid} ${body.data.currency} covering ${body.data.commissionsPaid} commission(s); `
    + `expenses ${before.expenses}->${after.expenses}, wallet ${before.balance}->${after.balance}, `
    + `ledger ${before.ledger}->${after.ledger}, unpaid ${before.unpaid}->${after.unpaid}; `
    + `classification=${expense.classification}, wallet_id set=${expense.walletId === ids.walletId}`)
}

async function noUnpaidRefused() {
  const res = await payout({})
  record('paying with nothing outstanding is refused', res.status === 409, `HTTP ${res.status}`)
}

async function insufficientBalanceRefused() {
  await createSale(2)
  // Drain the wallet through a real transaction row, never a bare balance write.
  const wallet = await prisma.wallet.findUnique({ where: { id: ids.walletId }, select: { balance: true } })
  const before = money(wallet.balance)
  await prisma.wallet_transactions.create({
    data: {
      wallet_id: ids.walletId, type: 'debit', amount: before,
      balance_before: before, balance_after: 0, currency: 'SRD', description: 'drain for test',
    },
  })
  await prisma.wallet.update({ where: { id: ids.walletId }, data: { balance: { decrement: before } } })

  const expensesBefore = await prisma.expense.count()
  const res = await payout({})
  const expensesAfter = await prisma.expense.count()
  const stillUnpaid = await prisma.commission.count({ where: { paid: false } })

  record('a payout larger than the balance posts nothing',
    res.status === 409 && expensesAfter === expensesBefore && stillUnpaid > 0,
    `HTTP ${res.status}; expenses unchanged at ${expensesAfter}; ${stillUnpaid} commission(s) still unpaid`)
}

async function main() {
  await controlOldInsert()
  await payoutPostsEverything()
  await noUnpaidRefused()
  await insufficientBalanceRefused()

  const walletTx = await prisma.wallet_transactions.count()
  const ledger = await prisma.financeLedgerEntry.count()
  // expenses.wallet_id is NOT NULL, so an expense without a wallet cannot
  // exist — which is precisely why the old insert omitting it always failed.
  record('ledger pairs 1:1 with wallet transactions', walletTx === ledger,
    `wallet_transactions=${walletTx}, ledger=${ledger}`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'='.repeat(46)}`)
  console.log(failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`)
  console.log('='.repeat(46))
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(2)
})
