#!/usr/bin/env bash
# Fail if the commits about to be pushed (vs origin/main) contain secrets or private data.
set -u
RANGE="${1:-origin/main..HEAD}"
bad=0
files=$(git diff --name-only "$RANGE")
if echo "$files" | grep -E '(^|/)(\.env|private/|.*credentials.*|.*\.pem$|id_ed25519|id_rsa)'; then echo "FORBIDDEN FILE"; bad=1; fi
added=$(git diff "$RANGE" -U0 -- . ':!scripts/privacy-scan.sh' | grep -E '^\+[^+]' || true)
pat='(BEGIN [A-Z ]*PRIVATE KEY|service_role|SUPABASE_SERVICE|eyJ[A-Za-z0-9_-]{20,}\.|postgres(ql)?://[^ ]+:[^ ]+@|password *[:=] *["'"'"'][^"'"'"' ]{4,}|_vercel_share=|BLOB_READ_WRITE_TOKEN *=|vercel_blob_rw_|sk-[A-Za-z0-9]{20,}|80\.190\.77\.248)'
if echo "$added" | grep -inE "$pat" | cut -c1-140; [ "${PIPESTATUS[1]}" -eq 0 ]; then echo "SECRET-LIKE CONTENT"; bad=1; fi
[ $bad -eq 0 ] && echo "privacy scan: clean ($(echo "$files" | wc -l) files)"
exit $bad
