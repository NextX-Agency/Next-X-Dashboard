#!/usr/bin/env bash
# Test fixture: a stand-in for `rclone` where the remote "fake:<path>" is the directory
# $FAKE_REMOTE_ROOT/<path>. FAKE_RCLONE_FAIL=1 makes copy fail.
map() { case "$1" in fake:*) printf '%s/%s' "$FAKE_REMOTE_ROOT" "${1#fake:}" ;; *) printf '%s' "$1" ;; esac; }
cmd="${1:-}"; shift || true
case "$cmd" in
  mkdir) mkdir -p "$(map "$1")" ;;
  copy)
    [[ "${FAKE_RCLONE_FAIL:-}" == 1 ]] && { echo "rclone: simulated network failure" >&2; exit 1; }
    src="$1"; dst="$(map "$2")"; mkdir -p "$dst"; cp -r "$src"/. "$dst"/ ;;
  check) diff -r "$1" "$(map "$2")" >/dev/null ;;
  lsf) for d in "$(map "$1")"/*/; do [[ -d "$d" ]] && echo "$(basename "$d")/"; done ;;
  purge) rm -rf "$(map "$1")" ;;
  *) echo "fake-rclone: unsupported $cmd" >&2; exit 1 ;;
esac
