// T-17 verification: GET /api/finance/inventory-health must reproduce the four
// figures the plan measured against production.
//
//   USD 503.02 dead · USD 177.90 overstocked · USD 680.92 releasable · 26 of 38 dead
//
// "If your numbers differ, your query is wrong."
const BASE = 'http://127.0.0.1:3210'
const COOKIE = 'nextics_session=t17-verification-token'

const EXPECTED = {
  rows: 38,
  deadRows: 26,
  deadCashUsd: 503.02,
  overstockedCashUsd: 177.90,
  releasableCashUsd: 680.92,
  cashTiedUpUsd: 788.57,
}

async function main() {
  const res = await fetch(`${BASE}/api/finance/inventory-health`, { headers: { Cookie: COOKIE } })
  const payload = await res.json()
  if (!res.ok) {
    console.log(`FAIL — HTTP ${res.status}: ${payload.error}`)
    process.exit(1)
  }

  const t = payload.data.totals
  const actual = {
    rows: t.rows,
    deadRows: t.byStatus.dead.rows,
    deadCashUsd: t.deadCashUsd,
    overstockedCashUsd: t.overstockedCashUsd,
    releasableCashUsd: t.releasableCashUsd,
    cashTiedUpUsd: t.cashTiedUpUsd,
  }

  console.log('Against the production fixture:\n')
  let ok = true
  for (const key of Object.keys(EXPECTED)) {
    const match = Math.abs(actual[key] - EXPECTED[key]) < 0.005
    if (!match) ok = false
    console.log(`  ${match ? 'ok  ' : 'BAD '} ${key.padEnd(20)} expected ${String(EXPECTED[key]).padStart(8)}  got ${String(actual[key]).padStart(8)}`)
  }

  console.log(`\n  status breakdown: ${Object.entries(t.byStatus)
    .filter(([, v]) => v.rows > 0)
    .map(([k, v]) => `${k}=${v.rows}`).join(' ')}`)
  console.log(`  excess beyond ${payload.data.thresholds.overstockDays}d cover: USD ${t.excessCashUsd}`)
  const c = payload.data.purchasingCeiling
  console.log(`  purchasing ceiling: trailing-${c.windowMonths}m COGS SRD ${c.monthlyCogsSrd}/mo `
    + `+${c.bufferPct}% = SRD ${c.monthlyCeilingSrd}/mo, spend SRD ${c.monthlySpendSrd}/mo`)

  console.log(`\n${'='.repeat(46)}`)
  console.log(ok ? 'PASS — reproduces the plan\'s production figures.' : 'FAIL — figures differ from the plan.')
  console.log('='.repeat(46))
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => { console.error(e); process.exit(2) })
