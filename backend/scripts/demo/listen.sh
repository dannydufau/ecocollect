#!/usr/bin/env bash
# A pretend browser tab: bash scripts/demo/listen.sh <uid> [port]
#bash scripts/demo/listen.sh res1      # terminal 2: the resident
#bash scripts/demo/listen.sh vol1      # terminal 3: the volunteer

uid="${1:?usage: listen.sh <uid> [port]}"
port="${2:-3002}"
echo "== tab for $uid =="
curl -sN -H "X-User-Id: $uid" "localhost:$port/api/events" |
while IFS= read -r line; do
  case "$line" in
    ': ping') ;;                                      # keep-alive comment, hide it
    'data: '*) echo 'data:'; jq . <<< "${line#data: }" ;;
    *) echo "$line" ;;
  esac
done