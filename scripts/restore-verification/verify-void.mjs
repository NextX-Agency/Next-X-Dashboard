// T-13 verification: voiding must preserve every row and post contra entries.
//
// The control matters most here. The old undo path deleted commissions, then
// sale items, then the sale — while finance_ledger_entries refuses DELETE. So
// the ledger kept a movement for a sale that no longer existed, and the books
// diverged from the ledger permanently. This reproduces that, then shows the
// void path leaving everything intact.
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

const createSale = (quantity = 2) => fetch(`${BASE}/api/sales`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
  body: JSON.stringify({
    locationId: ids.locationId, currency: 'SRD', paymentMethod: 'cash', sellerId: ids.sellerId,
    items: [{ itemId: ids.speakerId, quantity }], combos: [],
  }),
}).then((r) => r.json())

async function walletBalance() {
  const w = await prisma.wallet.findUnique({ where: { id: ids.walletId }, select: { balance: true } })
  return money(w.balance)
}

// ------------------------------------------------------------- CONTROL
async function controlOldDeletePath() {
  const created = await createSale(1)
  const saleId = created.data.saleId
  const before = {
    sales: await prisma.sale.count(),
    saleItems: await prisma.saleItem.count(),
    commissions: await prisma.commission.count(),
    ledger: await prisma.financeLedgerEntry.count(),
  }

  // Exactly what handleUndoSale used to do.
  await prisma.commission.deleteMany({ where: { saleId } })
  await prisma.saleItem.deleteMany({ where: { saleId } })
  await prisma.sale.delete({ where: { id: saleId } })

  const after = {
    sales: await prisma.sale.count(),
    saleItems: await prisma.saleItem.count(),
    commissions: await prisma.commission.count(),
    ledger: await prisma.financeLedgerEntry.count(),
  }
  const rowsDestroyed = (before.sales - after.sales) + (before.saleItems - after.saleItems) + (before.commissions - after.commissions)
  const ledgerKept = after.ledger === before.ledger

  // The bug: rows gone, ledger entry still there, pointing at nothing.
  const orphanLedger = await prisma.financeLedgerEntry.count({ where: { sourceId: saleId } })

  record('CONTROL: old delete path destroys rows and orphans the ledger (expected)',
    rowsDestroyed > 0 && ledgerKept && orphanLedger > 0,
    `${rowsDestroyed} financial row(s) deleted; ledger unchanged at ${after.ledger}; `
    + `${orphanLedger} ledger entr(y/ies) still reference the deleted sale`)
}

// ------------------------------------------------------------- void path
async function voidKeepsEverything() {
  const created = await createSale(2)
  const saleId = created.data.saleId
  const saleTotal = created.data.totalAmount

  const before = {
    sales: await prisma.sale.count(),
    saleItems: await prisma.saleItem.count(),
    commissions: await prisma.commission.count(),
    ledger: await prisma.financeLedgerEntry.count(),
    walletTx: await prisma.wallet_transactions.count(),
    balance: await walletBalance(),
    stock: (await prisma.stock.findFirst({ where: { itemId: ids.speakerId, locationId: ids.locationId } })).quantity,
  }

  const res = await fetch(`${BASE}/api/sales/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ saleId, reason: 'customer returned the goods' }),
  })
  const body = await res.json()
  if (!res.ok) return record('void keeps every row and reverses the money', false, `HTTP ${res.status}: ${body.error}`)

  const after = {
    sales: await prisma.sale.count(),
    saleItems: await prisma.saleItem.count(),
    commissions: await prisma.commission.count(),
    ledger: await prisma.financeLedgerEntry.count(),
    walletTx: await prisma.wallet_transactions.count(),
    balance: await walletBalance(),
    stock: (await prisma.stock.findFirst({ where: { itemId: ids.speakerId, locationId: ids.locationId } })).quantity,
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { status: true, voidReason: true, voidedAt: true, correlationId: true },
  })
  const entries = await prisma.financeLedgerEntry.findMany({
    where: { correlationId: sale.correlationId },
    select: { direction: true, amount: true },
  })
  const net = money(entries.reduce((s, e) => s + (e.direction === 'in' ? Number(e.amount) : -Number(e.amount)), 0))

  const nothingDeleted = after.sales === before.sales
    && after.saleItems === before.saleItems
    && after.commissions === before.commissions
  const reversed = after.balance === money(before.balance - saleTotal)
  const stockReturned = after.stock === before.stock + 2
  const contraPosted = after.ledger === before.ledger + 1 && after.walletTx === before.walletTx + 1

  record('void keeps every row and reverses the money',
    nothingDeleted && reversed && stockReturned && contraPosted && sale.status === 'voided' && net === 0,
    `status=${sale.status}; rows kept (sales ${after.sales}, items ${after.saleItems}, commissions ${after.commissions}); `
    + `wallet ${before.balance} -> ${after.balance}; stock ${before.stock} -> ${after.stock}; `
    + `${entries.length} ledger entries under one correlation_id netting to ${net}`)
}

async function doubleVoidRefused() {
  const created = await createSale(1)
  const saleId = created.data.saleId
  const first = await fetch(`${BASE}/api/sales/void`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ saleId, reason: 'first void' }),
  })
  const balanceAfterFirst = await walletBalance()
  const second = await fetch(`${BASE}/api/sales/void`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ saleId, reason: 'second void' }),
  })
  const balanceAfterSecond = await walletBalance()

  record('a second void is refused rather than double-debiting',
    first.ok && second.status === 409 && balanceAfterFirst === balanceAfterSecond,
    `first ${first.status}, second ${second.status}; wallet unchanged at ${balanceAfterSecond}`)
}

async function reasonRequired() {
  const created = await createSale(1)
  const res = await fetch(`${BASE}/api/sales/void`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ saleId: created.data.saleId, reason: 'x' }),
  })
  record('a void without a real reason is refused', res.status === 400, `HTTP ${res.status}`)
}

async function main() {
  await controlOldDeletePath()
  await voidKeepsEverything()
  await doubleVoidRefused()
  await reasonRequired()

  const walletTx = await prisma.wallet_transactions.count()
  const ledger = await prisma.financeLedgerEntry.count()
  record('ledger still pairs 1:1 with wallet transactions', walletTx === ledger,
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
