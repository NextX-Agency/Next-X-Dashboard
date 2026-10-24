#!/usr/bin/env bash
# Send one alert to every channel configured in /etc/nextx/ops.env.
#
#   notify-nextx.sh "<subject>" "<message>" [high|default|low]
#   notify-nextx.sh --test                      # sends a harmless test message
#
# Channels (any combination):
#   ALERT_WEBHOOK_URL + ALERT_KIND=ntfy      ntfy.sh topic or self-hosted ntfy (NTFY_TOKEN optional)
#   ALERT_WEBHOOK_URL + ALERT_KIND=generic   JSON {"text":..,"content":..} for Slack/Discord/Mattermost style hooks
#   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID    Telegram Bot API
#   ALERT_EMAIL                              via `mail` or `sendmail` if installed (the VPS needs an MTA)
#
# Exit 0 if at least one channel accepted the message, or none is configured (a warning is
# logged). Exit 1 when channels are configured but every one failed.
set -uo pipefail
HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck source=lib-ops.sh
. "$HERE/lib-ops.sh"
ops_load_env; ops_defaults

if [[ "${1:-}" == "--test" ]]; then
  set -- "NextX alert test" "This is a test alert from $HOST_LABEL at $(date -u +%FT%TZ). If you can read it, alerting works." default
fi
SUBJECT="${1:?usage: notify-nextx.sh <subject> <message> [priority]}"
MESSAGE="${2:-}"
PRIORITY="${3:-high}"
FULL="[$HOST_LABEL] $SUBJECT"

configured=0; delivered=0
curl_post() { curl -fsS -m 15 --retry 2 --retry-delay 2 -o /dev/null "$@"; }
# Escape a value for a double-quoted curl config string.
cfg_esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

kind="$ALERT_KIND"
if [[ -z "$kind" && -n "$ALERT_WEBHOOK_URL" ]]; then
  case "$ALERT_WEBHOOK_URL" in *ntfy*) kind=ntfy ;; *) kind=generic ;; esac
fi

# Webhook URLs and tokens go to curl through a config on stdin so they never appear in `ps`.
if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
  configured=$((configured + 1))
  case "$kind" in
    ntfy)
      if {
           printf 'url = "%s"\n' "$(cfg_esc "$ALERT_WEBHOOK_URL")"
           printf 'header = "Title: %s"\n' "$(cfg_esc "$FULL")"
           printf 'header = "Priority: %s"\n' "$(cfg_esc "$PRIORITY")"
           printf 'header = "Tags: warning"\n'
           if [[ -n "$NTFY_TOKEN" ]]; then printf 'header = "Authorization: Bearer %s"\n' "$(cfg_esc "$NTFY_TOKEN")"; fi
         } | curl_post -K - --data-binary "$MESSAGE"; then
        delivered=$((delivered + 1))
      else
        ops_log WARN "ntfy delivery failed"
      fi
      ;;
    *)
      body="{\"text\":\"$(ops_json_escape "$FULL: $MESSAGE")\",\"content\":\"$(ops_json_escape "$FULL: $MESSAGE")\"}"
      if printf 'url = "%s"\n' "$(cfg_esc "$ALERT_WEBHOOK_URL")" \
         | curl_post -K - -H 'Content-Type: application/json' --data-binary "$body"; then
        delivered=$((delivered + 1))
      else
        ops_log WARN "webhook delivery failed"
      fi
      ;;
  esac
fi

if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
  configured=$((configured + 1))
  if printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$(cfg_esc "$TELEGRAM_BOT_TOKEN")" \
     | curl_post -K - --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "text=$FULL: $MESSAGE"; then
    delivered=$((delivered + 1))
  else
    ops_log WARN "telegram delivery failed"
  fi
fi

if [[ -n "$ALERT_EMAIL" ]]; then
  configured=$((configured + 1))
  if command -v mail >/dev/null 2>&1 && printf '%s\n' "$MESSAGE" | mail -s "$FULL" "$ALERT_EMAIL"; then
    delivered=$((delivered + 1))
  elif command -v sendmail >/dev/null 2>&1 && printf 'To: %s\nSubject: %s\n\n%s\n' "$ALERT_EMAIL" "$FULL" "$MESSAGE" | sendmail -t; then
    delivered=$((delivered + 1))
  else
    ops_log WARN "email delivery failed or no mail/sendmail on this host (install an MTA such as msmtp, or use ntfy/Telegram)"
  fi
fi

if (( configured == 0 )); then
  ops_log WARN "no alert channel configured in $OPS_ENV_FILE; alert NOT delivered: $FULL: $MESSAGE"
  exit 0
fi
(( delivered > 0 )) || { ops_log ERROR "every configured alert channel failed for: $FULL"; exit 1; }
ops_log INFO "alert delivered to $delivered of $configured channel(s): $FULL"
