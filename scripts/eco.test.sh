#!/usr/bin/env bash
# Tests for the parts of ./eco that don't need Docker: creating and checking .env.
# Run with ./eco test eco, or directly with bash scripts/eco.test.sh.

set -o errexit -o nounset -o pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# Sourcing eco only loads its functions, it doesn't run a command.
# shellcheck source=../eco
source "$REPO/eco"

passed=0
failed=0
check() { # description, then a command that should succeed
  local description=$1
  shift
  if "$@" >/dev/null 2>&1; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $description"
  fi
}

# Each test works in its own folder with a copy of .env.example, like a fresh checkout.
fresh_checkout() {
  WORK=$(mktemp -d)
  cp "$REPO/.env.example" "$WORK/.env.example"
  cd "$WORK"
}

# --- random_word -------------------------------------------------------------

word=$(random_word)
check "random_word is 20 characters" test "${#word}" -eq 20
check "random_word is letters and numbers only" bash -c '[[ "$1" =~ ^[A-Za-z0-9]+$ ]]' _ "$word"
check "random_word is different each time" test "$word" != "$(random_word)"

# --- env_get and env_set -----------------------------------------------------

fresh_checkout
printf '# a comment\nA=1\n# B=old\nC=3\n' > .env
env_set A 2
env_set B new
check "env_set changes an existing key" test "$(env_get A)" = "2"
check "env_set adds a missing key, even when a commented one exists" test "$(env_get B)" = "new"
check "env_set leaves other keys alone" test "$(env_get C)" = "3"
check "env_set leaves comments alone" grep -q '^# B=old$' .env
check "env_get of a missing key is empty" test -z "$(env_get NOPE)"

# --- creating .env -----------------------------------------------------------

fresh_checkout
ensure_env_file
check "a missing .env is created" test -f .env
check "the Postgres password is random, not change_me" test "$(env_get POSTGRES_PASSWORD)" != "change_me"
check "the RabbitMQ password is random, not change_me" test "$(env_get RABBITMQ_PASSWORD)" != "change_me"
check "the two passwords are different" test "$(env_get POSTGRES_PASSWORD)" != "$(env_get RABBITMQ_PASSWORD)"
check "DATABASE_URL uses the new Postgres password" grep -q "^DATABASE_URL=postgres://ecocollect:$(env_get POSTGRES_PASSWORD)@localhost:5432/ecocollect$" .env
check "RABBITMQ_URL uses the new RabbitMQ password" grep -q "^RABBITMQ_URL=amqp://ecocollect:$(env_get RABBITMQ_PASSWORD)@localhost:5672$" .env
check "the other lines of .env.example are kept" grep -q '^NEXT_PUBLIC_FIREBASE_PROJECT_ID=ecocollect-uofc$' .env

before=$(cat .env)
ensure_env_file
check "an existing .env is never touched" test "$(cat .env)" = "$before"

# --- the Firebase web API key ------------------------------------------------

fresh_checkout
cp .env.example .env
NEXT_PUBLIC_FIREBASE_API_KEY=from-the-environment ensure_firebase_web_config </dev/null
check "a key from the environment is saved to .env" test "$(env_get NEXT_PUBLIC_FIREBASE_API_KEY)" = "from-the-environment"

fresh_checkout
cp .env.example .env
env_set NEXT_PUBLIC_FIREBASE_API_KEY from-the-file
NEXT_PUBLIC_FIREBASE_API_KEY=from-the-environment ensure_firebase_web_config </dev/null
check "a key already in .env wins over the environment" test "$(env_get NEXT_PUBLIC_FIREBASE_API_KEY)" = "from-the-file"

fresh_checkout
cp .env.example .env
check "no key and no terminal to ask in is an error" bash -c "source '$REPO/eco'; cd '$WORK'; unset NEXT_PUBLIC_FIREBASE_API_KEY; ! (ensure_firebase_web_config) </dev/null"

# --- checking .env -----------------------------------------------------------

fresh_checkout
ensure_env_file
check "a freshly created .env passes the check" bash -c "source '$REPO/eco'; check_passwords"

env_set POSTGRES_PASSWORD 'pa@ss'
check "a password with @ is rejected, it would break the URL" bash -c "source '$REPO/eco'; ! (check_passwords)"
env_set POSTGRES_PASSWORD 'ok_pass-1'
check "underscore and dash are allowed" bash -c "source '$REPO/eco'; check_passwords"
env_set RABBITMQ_PASSWORD ''
check "an empty password is rejected" bash -c "source '$REPO/eco'; ! (check_passwords)"

echo "eco script tests: $passed passed, $failed failed"
test "$failed" -eq 0
