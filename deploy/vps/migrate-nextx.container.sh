# Runs inside a node:22-alpine container started by migrate-nextx.sh.
#   /src  the deployed source tree (a git snapshot), read-only
#   /in   the frozen legacy snapshot, read-only
#   /out  this run's report directory; host-gates.json and local-evidence.json
#         are already there
# Every step stops the run on failure.
set -eu

step() { printf '\n  -> %s\n' "$*"; }

step "Preparing the migration tooling"
apk add --no-cache git >/dev/null
mkdir /w && cp -a /src/. /w && cd /w
git config --global --add safe.directory /w
corepack enable >/dev/null
pnpm install --frozen-lockfile --ignore-scripts >/dev/null
if [ -n "$(git status --porcelain)" ]; then
  echo "The deployed source tree differs from its snapshot commit:"
  git status --short | head -20
  exit 1
fi
FINGERPRINT="$(pnpm -s migrate:nextx:readiness-fingerprint | node -e '
  let d = ""; process.stdin.on("data", (c) => (d += c)).on("end", () => console.log(JSON.parse(d).fingerprint));')"
echo "source $(git rev-parse --short HEAD), fingerprint ${FINGERPRINT%"${FINGERPRINT#????????????}"}…"

step "Media preparation report (self-hosting, staging, runtime, RLS, Storage smoke test)"
FINGERPRINT="$FINGERPRINT" node <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const host = JSON.parse(readFileSync('/out/host-gates.json', 'utf8'));
for (const gate of ['SELF_HOSTING', 'COOLIFY_STAGING', 'SUPABASE_RUNTIME', 'RLS']) {
  if (host[gate] !== 'PASS') throw new Error(`${gate} did not pass on the host`);
}
if (host.storageSmokeTest !== 'PASS') throw new Error('Storage smoke test did not pass');
writeFileSync('/out/media-preparation.json', `${JSON.stringify({
  phase: 'MEDIA_PREPARATION',
  generatedAt: new Date().toISOString(),
  workingTreeFingerprint: process.env.FINGERPRINT,
  targetEnvironment: 'staging',
  stagingHost: process.env.NEXTX_STAGING_HOST,
  storageSmokeTest: 'PASS',
  gates: {
    SELF_HOSTING: 'PASS',
    COOLIFY_STAGING: 'PASS',
    SUPABASE_RUNTIME: 'PASS',
    RLS: 'PASS',
  },
  hostChecksAt: host.checkedAt,
  coolifyNote: host.coolifyNote,
}, null, 2)}\n`);
NODE

step "Copying legacy media into self-hosted Storage"
pnpm -s migrate:nextx:media-prepare -- --source /in/snapshot.json \
  --media-preparation-report /out/media-preparation.json \
  --target-environment staging --confirm-safe-target staging --out /out/media-map.json

step "MEDIA: every copied image is served over HTTPS"
node <<'NODE'
const map = JSON.parse(require('node:fs').readFileSync('/out/media-map.json', 'utf8'));
const urls = Object.values(map.assets).flatMap((asset) => [asset.publicUrl, asset.thumbUrl].filter(Boolean));
(async () => {
  const failures = [];
  for (const url of urls) {
    const response = await fetch(url);
    const type = response.headers.get('content-type') ?? '';
    await response.arrayBuffer();
    if (!response.ok || !type.startsWith('image/')) failures.push(`${response.status} ${type} ${new URL(url).pathname}`);
  }
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    throw new Error(`${failures.length} of ${urls.length} media URLs failed`);
  }
  console.log(`ok: ${urls.length} URLs for ${Object.keys(map.assets).length} assets`);
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE

step "MIGRATION_DRY_RUN and RECONCILIATION: dry-run with the media map"
pnpm -s migrate:nextx:dry-run -- --source /in/snapshot.json --media-map /out/media-map.json \
  --out /out/dry-run.json

step "Readiness report (all ten gates)"
FINGERPRINT="$FINGERPRINT" node <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const host = JSON.parse(readFileSync('/out/host-gates.json', 'utf8'));
const evidence = JSON.parse(readFileSync('/out/local-evidence.json', 'utf8'));
const dryRun = JSON.parse(readFileSync('/out/dry-run.json', 'utf8'));
const fatal = dryRun.conflicts.filter((conflict) => conflict.severity === 'fatal').length;
if (fatal !== 0) throw new Error(`Dry-run still has ${fatal} fatal conflicts`);
if (dryRun.validation?.status !== 'pass') throw new Error('Dry-run offline reconciliation did not pass');
const gates = {
  FEATURE_PARITY: evidence.gates?.FEATURE_PARITY,
  SELF_HOSTING: host.SELF_HOSTING,
  COOLIFY_STAGING: host.COOLIFY_STAGING,
  SUPABASE_RUNTIME: host.SUPABASE_RUNTIME,
  RLS: host.RLS,
  MEDIA: 'PASS',
  BACKUP_RESTORE: host.BACKUP_RESTORE,
  MIGRATION_DRY_RUN: 'PASS',
  RECONCILIATION: 'PASS',
  TESTS: evidence.gates?.TESTS,
};
const failed = Object.entries(gates).filter(([, value]) => value !== 'PASS').map(([gate]) => gate);
if (failed.length > 0) throw new Error(`Gates not passing: ${failed.join(', ')}`);
writeFileSync('/out/readiness.json', `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  workingTreeFingerprint: process.env.FINGERPRINT,
  gates,
  evidence: {
    host: '/out/host-gates.json',
    local: evidence,
    dryRun: { conflicts: dryRun.conflicts.length, fatal, reconciliation: dryRun.validation.status },
  },
}, null, 2)}\n`);
console.log('ok: all ten gates PASS');
NODE

step "Importing the NextX data"
pnpm -s migrate:nextx:run -- --source /in/snapshot.json --media-map /out/media-map.json \
  --readiness-report /out/readiness.json \
  --target-environment staging --confirm-safe-target staging --out /out/import.json

step "Online validation against the imported database"
pnpm -s migrate:nextx:validate -- --source /in/snapshot.json --media-map /out/media-map.json \
  --target-environment staging --confirm-safe-target staging --out /out/validation.json
