#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
cd "$(dirname "$0")"
COMPOSE_CMD="docker compose -p ecocollect-gateway-test -f compose.test.yml"
BASE_URL="https://localhost:3030"
VERBOSE=${VERBOSE:-0}   # 1 = print every response; set it with: VERBOSE=1 ./test.sh
SSE_COMPOSE_CMD="$COMPOSE_CMD -f compose.sse.yml"

# on exit(error), cleanup docker and discard any output
trap '$COMPOSE_CMD down -v --remove-orphans >/dev/null 2>&1' EXIT

docker run --rm -v "$PWD/../Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 \
  caddy validate --config /etc/caddy/Caddyfile

$COMPOSE_CMD up -d
curl -sk --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null "$BASE_URL/"

PASS=0; FAIL=0
show_response() {   # indent text by 4 spaces so it stands out under the ok/FAIL line
  sed 's/^/    /' <<<"$1"
}

expect_status() {   # name, expected, then any curl args
  local name=$1 expected=$2; shift 2
  local got ok
  got=$(curl -sk -o /dev/null -w '%{http_code}' "$@" || true)
  if [[ $got == "$expected" ]]; then ok=yes; PASS=$((PASS+1)); echo "ok   $name"
  else ok=no; FAIL=$((FAIL+1)); echo "FAIL $name (expected $expected, got $got)"; fi
  if [[ $ok == yes && $VERBOSE == 1 ]]; then show_response "$got"; fi
}

expect_body_contains() { # name, needle, expected, curl-args
    local name=$1 needle=$2 expected=$3; shift 3
    local got found ok
    # -s: silent mode, -k: accepts the self-signed cert
    got=$(curl -sk "$@" || true)
    # -q: quiet, -i: ignore case, -F: fixed string
    if grep -qiF -- "$needle" <<<"$got"; then found=yes; else found=no; fi
    if [[ $found == "$expected" ]]; then ok=yes; PASS=$((PASS+1)); echo "ok   $name"
    else 
      ok=no;
      FAIL=$((FAIL+1)); echo "FAIL $name (expected $expected, found $found)"
    fi
    if [[ $ok == no || $VERBOSE == 1 ]]; then show_response "$got"; fi
}

expect_body_matches() { # name, regex, curl-args
  local name=$1 regex=$2; shift 2
  local got ok
  got=$(curl -sk "$@" || true)
  # -E: extended regex
  if grep -qiE -- "$regex" <<<"$got"; then ok=yes; PASS=$((PASS+1)); echo "ok   $name"
  else ok=no; FAIL=$((FAIL+1)); echo "FAIL $name (no match for /$regex/)"; fi
  if [[ $ok == no || $VERBOSE == 1 ]]; then show_response "$got"; fi
}

expect_sse_events() { # name, min-events, curl-args
  local name=$1 min=$2; shift 2
  local out count ok
  #-s: silent mode, -N disable's curl's buffering, --max-time to timeout the stream
  out=$(curl -sk -N --max-time 7 "$@" || true)
  count=$(grep -c '^event: notification' <<<"$out" || true)
  if [[ $count -ge $min ]]; then ok=yes; PASS=$((PASS+1)); echo "ok   $name"
  else 
    ok=no; FAIL=$((FAIL+1)); echo "FAIL $name (min-events $min, got $count)"
  fi
  if [[ $ok == no || $VERBOSE == 1 ]]; then show_response "$out"; fi
}

echo "== Headers Stripping  =="
expect_body_contains "/ with 'X-User-Roles: admin' -> no admin in header (stripped)" "X-User-Roles: admin" no -i -H "X-User-Roles: admin" "$BASE_URL/"
expect_body_contains "/ with 'X-Request-Id: mine' -> mine not in header (stripped)" "X-Request-Id: mine" no -i -H "X-Request-Id: mine" "$BASE_URL/"

# echo "== Routing =="
# echo "== Routing (Request Service) =="
# expect_status "unknown api route -> 404" 404 -H "Authorization: Bearer good-resident" "$BASE_URL/api/invalid-path"
# expect_body_contains "/api/categories -> Name: request" "Name: request" yes -H "Authorization: Bearer good-resident" "$BASE_URL/api/categories"
# expect_body_contains "/api/requests -> Name: request" "Name: request" yes -H "Authorization: Bearer good-resident" "$BASE_URL/api/requests"
# expect_body_contains "/api/profile -> Name: request" "Name: request" yes -H "Authorization: Bearer good-resident" "$BASE_URL/api/profile"

# echo "== Routing (Notification Service) =="
# expect_body_contains "/api/events -> Name: notification" "Name: notification" yes -H "Authorization: Bearer good-resident" "$BASE_URL/api/events"
# expect_body_contains "/api/notifications -> Name: notification" "Name: notification" yes -H "Authorization: Bearer good-resident" "$BASE_URL/api/notifications"
# expect_body_contains "/api/push/subscriptions -> Name: notification" "Name: notification" yes -H "Authorization: Bearer good-resident" "$BASE_URL/api/push/subscriptions"


echo "== Routing (User Service) =="
echo "== Public Paths =="
expect_body_contains "POST /api/accounts -> Name: user" "Name: user" yes -X POST "$BASE_URL/api/accounts"
expect_body_contains "GET /api/terms -> Name: user" "Name: user" yes -X GET "$BASE_URL/api/terms"
expect_body_contains "GET /api/public/profiles/dhole -> Name: user" "Name: user" yes -X GET "$BASE_URL/api/public/profiles/dhole"

echo "== Cookie Setup (Public) =="
expect_body_contains "POST /api/session -> Set-Cookie" "set-cookie: session=good-resident" yes -X POST -i "$BASE_URL/api/session"
expect_status "DELETE /api/session -> 204" 204 -X DELETE "$BASE_URL/api/session"

echo "== Protected Paths =="
expect_body_contains "GET /api/profile -> Name: user" "Name: user" yes -H "Authorization: Bearer good-resident" -X GET "$BASE_URL/api/profile"
expect_body_contains "PATCH /api/profile -> Name: user" "Name: user" yes -H "Authorization: Bearer good-volunteer" -X PATCH "$BASE_URL/api/profile"

echo "== Routing (Reward Service) =="
echo "== Public Paths =="
expect_body_contains "GET /api/public/profiles/dhole/stats -> Name: reward" "Name: reward" yes -X GET "$BASE_URL/api/public/profiles/dhole/stats"
expect_body_contains "GET /api/public/stats -> Name: reward" "Name: reward" yes -X GET "$BASE_URL/api/public/stats"


# echo "== Routing (Frontend Service) =="
# expect_body_contains "/home -> Name: frontend" "Name: frontend" yes -H "Authorization: Bearer good-resident" "$BASE_URL/home"

echo "== User check in /verify =="

# only internal access for /verify
expect_status "/verify -> 404" 404 -H "Authorization: Bearer good-resident" "$BASE_URL/verify"

expect_status "/api/categories with no token -> 401" 401 "$BASE_URL/api/categories"

expect_body_contains "/api/categories with Authorization: Bearer good-volunteer -> X-User-Roles: volunteer" "X-User-Roles: volunteer" yes -H "Authorization: Bearer good-volunteer" "$BASE_URL/api/categories"

expect_body_contains "/api/events with Cookie: session=good-resident -> X-User-Roles: resident" "X-User-Roles: resident" yes -H "Cookie: session=good-resident" "$BASE_URL/api/events"

echo "== Autogenerated Request id =="
UUID_RE='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

expect_body_matches "/ without X-Request-Id -> gateway adds a UUID" \
  "^X-Request-Id: $UUID_RE" "$BASE_URL/"

expect_body_matches "/ with 'X-Request-Id: mine' -> replaced by a UUID" \
  "^X-Request-Id: $UUID_RE" -H "X-Request-Id: mine" "$BASE_URL/"

# echo "== Spoofing =="
# -i is used to see inspect headers

# expect_status "X-User-Roles: admin with no token -> 401" 401 -H "X-User-Roles: admin" "$BASE_URL/api/requests"

# expect_body_contains "/api/categories with 'X-User-Roles: admin' and 'Authorization: Bearer good-volunteer' -> X-User-Roles: volunteer" "X-User-Roles: volunteer" yes -H "Authorization: Bearer good-volunteer" -H "X-User-Roles: admin" "$BASE_URL/api/categories"

# expect_body_contains "/ with 'X-User-Roles: admin' -> frontend (not 404)" "Name: frontend" yes -i -H "X-User-Roles: admin" "$BASE_URL/"

# expect_body_contains "/api/requests with 'X-Request-Id: mine' -> mine not in header (stripped)" "X-Request-Id: mine" no -i -H "X-Request-Id: mine" -H "Authorization: Bearer good-resident" "$BASE_URL/api/requests"

# echo "== SSE =="
# $SSE_COMPOSE_CMD up -d --no-deps notification
# sleep 2
# if [[ -z $($SSE_COMPOSE_CMD ps -q --status running notification) ]]; then
#   echo "SSE stub is not running:"; $SSE_COMPOSE_CMD logs notification; exit 1
# fi


# expect_sse_events "/api/events streams 2 events in 7 seconds" 2 -H "Cookie: session=good-volunteer" "$BASE_URL/api/events"

# sleep 3

# expect_sse_events "/api/events with gzip 2 events in 7 seconds" 2 -H "Cookie: session=good-volunteer" -H "Accept-Encoding: gzip" "$BASE_URL/api/events"

# expect_status "/api/events without cookie -> 401" 401 --max-time 5 "$BASE_URL/api/events"

echo "$PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]