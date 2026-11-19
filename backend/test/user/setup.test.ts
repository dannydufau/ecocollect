import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const compose = YAML.parse(readFileSync('../docker-compose.yml', 'utf8'));
const caddy = readFileSync('../infra/caddy/Caddyfile', 'utf8');

test('Compose runs the User Service internally from the existing backend image', () => {
  const user = compose.services.user;
  assert.deepEqual(user.build, compose.services.backend.build);
  assert.deepEqual(user.command, ['node', 'src/user/index.ts']);
  assert.equal(user.ports, undefined);
  assert.equal(user.environment.PORT, '80');
  assert.ok(user.healthcheck.test.join(' ').includes('/health'));
  assert.equal(compose.services.caddy.depends_on.user.condition, 'service_healthy');
});

test('only the backend and User Service mount the Firebase key during the transition', () => {
  const owners = Object.entries(compose.services).filter(([, service]) => service.secrets?.includes('firebase-admin.json')).map(([name]) => name).sort();
  assert.deepEqual(owners, ['backend', 'user']);
});

test('gateway keeps legacy auth and preserves routing priority and production isolation', () => {
  assert.match(caddy, /forward_auth auth/);
  assert.match(caddy, /handle @session-paths\s*\{\s*reverse_proxy auth/);
  assert.ok(caddy.indexOf('handle @reward-public-paths') < caddy.indexOf('handle @user-public-paths'));
  assert.match(caddy, /handle @user-paths\s*\{\s*import verify-auth\s*reverse_proxy user/);
  assert.equal(caddy.includes('/api/demo/session'), false);
  assert.match(caddy, /handle @verify-path\s*\{\s*error "Not found" 404/);
});
