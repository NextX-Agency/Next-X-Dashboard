// T-01 companion check: an UNCORRUPTED wipe restore must still succeed and
// commit. Proving that failure rolls back is only half the job — the happy path
// has to keep working, including the ledger trigger scoping.
import { PrismaClient } from '@prisma/client'

const BASE = 'http://127.0.0.1:3210'
const COOKIE = 'nextics_session=t01-verification-token'
const prisma = new PrismaClient()

async function snapshot() {
  const [sales, saleItems, walletTx, ledger, expenses, items, users] = await Promise.all([
    prisma.sale.count(), prisma.saleItem.count(), prisma.wallet_transactions.count(),
    prisma.financeLedgerEntry.count(), prisma.expense.count(), prisma.item.count(),
    prisma.user.count(),
  ])
  return { sales, saleItems, walletTx, ledger, expenses, items, users }
}

async function main() {
  const before = await snapshot()
  console.log('BEFORE:', JSON.stringify(before))

  const backup = await (await fetch(`${BASE}/api/backup/export`, { headers: { Cookie: COOKIE } })).json()

  const res = await fetch(`${BASE}/api/backup/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ backup, mode: 'wipe', confirmationText: 'WIPE DATABASE' }),
  })
  const body = await res.json()
  console.log(`restore HTTP ${res.status} success=${body.success} totalRows=${body.totalRows}`)
  if (body.error) console.log('error:', body.error)

  const after = await snapshot()
  console.log('AFTER: ', JSON.stringify(after))

  // wallet_transactions and finance_ledger_entries must stay 1:1 — the restore
  // suppressed the capture trigger and replayed the ledger snapshot verbatim.
  const drift = Object.keys(before).filter((k) => before[k] !== after[k])
  const ledgerPaired = after.walletTx === after.ledger

  console.log('\n================ RESULT ================')
  if (res.ok && body.success && drift.length === 0 && ledgerPaired) {
    console.log('PASS — a valid restore still commits, and wallet_transactions')
    console.log(`       still pair 1:1 with ledger entries (${after.walletTx}:${after.ledger}).`)
  } else {
    console.log('FAIL')
    if (!res.ok || !body.success) console.log('       restore did not report success')
    for (const k of drift) console.log(`       ${k}: ${before[k]} -> ${after[k]}`)
    if (!ledgerPaired) console.log(`       ledger drift: walletTx=${after.walletTx} ledger=${after.ledger}`)
  }
  console.log('========================================')
  process.exitCode = (res.ok && body.success && drift.length === 0 && ledgerPaired) ? 0 : 1
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e); await prisma.$disconnect(); process.exit(2)
})
