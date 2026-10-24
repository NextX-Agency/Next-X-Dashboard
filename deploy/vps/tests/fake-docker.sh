#!/usr/bin/env bash
# Test fixture: a stand-in for `docker` that emulates only what backup-nextx.sh calls.
# It never contacts a real Docker daemon. Behaviour switches (environment):
#   FAKE_NO_PRODUCTS_TOC=1   pg_restore --list omits the public.products data entry
#   FAKE_DB_DOWN=1           `docker ps` finds no database container
cmd="${1:-}"; shift || true
case "$cmd" in
  info) exit 0 ;;
  ps)
    if [[ "${FAKE_DB_DOWN:-}" == 1 ]]; then exit 0; fi
    for a in "$@"; do [[ "$a" == "-q" ]] && { echo "deadbeef1234"; exit 0; }; done
    exit 0 ;;
  inspect) echo "fake-inspect-value"; exit 0 ;;
  volume)
    sub="${1:-}"; shift || true
    [[ "$sub" == inspect ]] && { echo "${FAKE_VOLUME_MOUNT:-/nonexistent-volume}"; exit 0; }
    exit 0 ;;
  image) exit 0 ;;
  exec)
    [[ "${1:-}" == "-i" ]] && shift
    shift              # container id
    shift 3            # sh -c <script>
    shift              # the "sh" that becomes $0
    tool="$1"; shift
    case "$tool" in
      pg_dump)
        schemas=""; while [[ $# -gt 0 ]]; do [[ "$1" == -n ]] && { schemas+="$2,"; shift; }; shift; done
        printf 'PGDMP fake custom dump of schemas %s\n' "$schemas"
        head -c 4096 /dev/urandom ;;
      pg_dumpall) printf 'CREATE ROLE anon;\nCREATE ROLE authenticated;\n' ;;
      pg_restore)
        first="$(head -c 5)"
        [[ "$first" == PGDMP ]] || { echo "pg_restore: error: input file does not appear to be a valid archive" >&2; exit 1; }
        cat >/dev/null
        echo ';'
        echo '210; 1259 16390 TABLE public sales postgres'
        [[ "${FAKE_NO_PRODUCTS_TOC:-}" == 1 ]] || echo '3400; 0 16390 TABLE DATA public products postgres'
        echo '3401; 0 16391 TABLE DATA public sales postgres' ;;
      psql)
        q=""; while [[ $# -gt 0 ]]; do [[ "$1" == -c ]] && { q="$2"; shift; }; shift; done
        case "$q" in
          "select 1") echo 1 ;;
          "show server_version") echo "17.6" ;;
          *"public.products"*) echo 34 ;;
          *"public.product_variants"*) echo 34 ;;
          *"public.sales"*) echo 12 ;;
          *"public.ledger_entries"*) echo 56 ;;
          *"public.members"*) echo 3 ;;
          *"auth.users"*) echo 3 ;;
          *"storage.objects"*) echo 20 ;;
          *) echo 0 ;;
        esac ;;
      *) echo "fake-docker: unsupported tool $tool" >&2; exit 127 ;;
    esac
    exit 0 ;;
  *) echo "fake-docker: unsupported command $cmd" >&2; exit 127 ;;
esac
