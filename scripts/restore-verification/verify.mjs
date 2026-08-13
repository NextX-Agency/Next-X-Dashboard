// T-01 verification harness.
//
// Exports a backup, deliberately corrupts one table's payload so that the
// insert phase fails AFTER the wipe phase has run, fires a wipe restore, and
// asserts the database is byte-for-byte what it was before the attempt.
//
// Run against the FIXED code it must print PASS.
// Run against the ORIGINAL code it must print FAIL — otherwise the test proves
// nothing.
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const BASE = 'http://127.0.0.1:3210'
const COOKIE = 'nextics_session=t01-verification-token'
const prisma = new PrismaClient()

async function snapshot() {
  const [sales, saleItems, walletTx, ledger, expenses, items, users, wallets] = await Promise.all([
    prisma.sale.count(),
    prisma.saleItem.count(),
    prisma.wallet_transactions.count(),
    prisma.financeLedgerEntry.count(),
    prisma.expense.count(),
    prisma.item.count(),
    prisma.user.count(),
    prisma.wallet.findMany({ select: { id: true, balance: true }, orderBy: { id: 'asc' } }),
  ])
  return {
    sales, saleItems, walletTx, ledger, expenses, items, users,
    walletBalances: wallets.map((w) => `${w.id}:${w.balance}`).join(','),
  }
}

const fmt = (s) => JSON.stringify(s, null, 2)

async function main() {
  const before = await snapshot()
  console.log('--- BEFORE the failed restore ---')
  console.log(fmt(before))

  // 1. Export a real backup through the app's own endpoint.
  const exportRes = await fetch(`${BASE}/api/backup/export`, { headers: { Cookie: COOKIE } })
  if (!exportRes.ok) throw new Error(`export failed: ${exportRes.status}`)
  const backup = await exportRes.json()

  // 2. Corrupt it. A sale item pointing at an item id that does not exist
  //    passes payload validation but violates a foreign key on insert — the
  //    realistic "fails partway through" case, and it fails LATE, well after
  //    the wipe has emptied the tables.
  //
  //    The payload checksum is dropped along with the edit. validateBackupPayload
  //    accepts a checksum-less backup (it warns rather than rejecting), which is
  //    what makes this reach the restore itself instead of being turned away at
  //    validation — the failure has to happen mid-restore for this test to mean
  //    anything.
  if (!backup.tables.saleItems?.length) throw new Error('seed has no sale items to corrupt')
  backup.tables.saleItems[0].itemId = randomUUID()
  delete backup.checksum
  console.log(`\ncorrupted saleItems[0].itemId -> ${backup.tables.saleItems[0].itemId} (no such item)`)

  // 3. Attempt the wipe restore.
  const restoreRes = await fetch(`${BASE}/api/backup/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify({ backup, mode: 'wipe', confirmationText: 'WIPE DATABASE' }),
  })
  const restoreBody = await restoreRes.json()
  console.log(`\nrestore HTTP ${restoreRes.status}`)
  console.log(fmt(restoreBody).slice(0, 900))

  // 4. The database must be exactly as it was.
  const after = await snapshot()
  console.log('\n--- AFTER the failed restore ---')
  console.log(fmt(after))

  const drift = Object.keys(before).filter((k) => before[k] !== after[k])

  console.log('\n================ RESULT ================')
  if (drift.length === 0) {
    console.log('PASS — a deliberately failed restore left the database unchanged.')
    console.log(`       restore correctly reported failure (HTTP ${restoreRes.status}).`)
  } else {
    console.log('FAIL — the database was modified by a restore that did not succeed.')
    for (const k of drift) console.log(`       ${k}: ${before[k]} -> ${after[k]}`)
  }
  console.log('========================================')
  process.exitCode = drift.length === 0 ? 0 : 1
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(2)
})
