import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const compose = YAML.parse(readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8'));
const caddy = readFileSync(new URL('../../../infra/caddy/Caddyfile', import.meta.url), 'utf8');

test('Compose runs the User Service internally from the existing backend image', () => {
  const user = compose.services.user;
  assert.deepEqual(user.build, compose.services.backend.build);
  assert.deepEqual(user.command, ['node', 'src/user/index.ts']);
  assert.equal(user.ports, undefined);
  assert.equal(user.environment.PORT, '80');
  assert.equal(user.environment.DATABASE_URL, '${USER_DATABASE_URL:-}');
  assert.ok(user.healthcheck.test.join(' ').includes('/health'));
  assert.equal(compose.services.caddy.depends_on.user.condition, 'service_healthy');
});

test('only the User Service mounts the Firebase key', () => {
  const owners = Object.entries(compose.services).filter(([, service]) => service.secrets?.includes('firebase-admin.json')).map(([name]) => name).sort();
  assert.deepEqual(owners, ['user']);
});

test('gateway uses User auth and preserves routing priority and production isolation', () => {
  assert.match(caddy, /forward_auth user/);
  assert.match(caddy, /handle @session-paths\s*\{\s*reverse_proxy user/);
  assert.ok(caddy.indexOf('handle @reward-public-paths') < caddy.indexOf('handle @user-public-paths'));
  assert.match(caddy, /handle @user-paths\s*\{\s*import verify-auth\s*reverse_proxy user/);
  assert.equal(caddy.includes('/api/demo/session'), false);
  assert.match(caddy, /handle @verify-path\s*\{\s*error "Not found" 404/);
});
