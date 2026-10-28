const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compose = YAML.parse(read('docker-compose.yml'));
const caddyfile = read('infra/caddy/Caddyfile');

// Every name another container can use: the services and their network aliases.
const names = new Set(Object.keys(compose.services));
for (const service of Object.values(compose.services)) {
  for (const network of Object.values(service.networks ?? {})) (network?.aliases ?? []).forEach((a) => names.add(a));
}

// [host, port] for each `reverse_proxy host[:port]` in the Caddyfile. No port means 80.
const upstreams = [...caddyfile.matchAll(/reverse_proxy\s+([\w-]+)(?::(\d+))?/g)].map((m) => [m[1], m[2] ?? '80']);

// The notification service comes with #25, until then Caddy answers 502 for /api/events.
const notYetBuilt = ['notification'];

test('every upstream in the Caddyfile is a service or an alias in Compose', () => {
  assert.ok(upstreams.length >= 4, 'expected auth, pickup, notification and frontend');
  for (const [host] of upstreams.filter(([host]) => !notYetBuilt.includes(host))) {
    assert.ok(names.has(host), `Caddy proxies to "${host}" but Compose has no service or alias with that name`);
  }
});

test('the backend answers to auth and pickup, on the port Caddy uses', () => {
  const backend = compose.services.backend;
  assert.strictEqual(backend.build.context, './backend');
  assert.deepStrictEqual(backend.networks.default.aliases.sort(), ['auth', 'pickup']);
  for (const host of ['auth', 'pickup']) {
    const [, port] = upstreams.find(([h]) => h === host);
    assert.strictEqual(String(backend.environment.PORT), port, `${host} is proxied to port ${port}`);
  }
});

test('the frontend is reachable as "frontend" on the port Caddy uses', () => {
  const [, port] = upstreams.find(([host]) => host === 'frontend');
  assert.strictEqual(compose.services.frontend.build.context, './frontend');
  assert.strictEqual(port, '3000');
});

test('the backend finds Postgres and RabbitMQ by service name, and waits for them', () => {
  const { environment, depends_on: dependsOn } = compose.services.backend;
  assert.match(environment.DATABASE_URL, /@postgres:5432\//);
  assert.match(environment.RABBITMQ_URL, /@rabbitmq:5672$/);
  for (const dependency of ['postgres', 'rabbitmq']) {
    assert.strictEqual(dependsOn[dependency].condition, 'service_healthy');
  }
});

test('the Firebase key reaches the backend as a secret at the path it is told to read', () => {
  const { environment, secrets } = compose.services.backend;
  const mounted = `/run/secrets/${secrets[0]}`;
  assert.strictEqual(environment.GOOGLE_APPLICATION_CREDENTIALS, mounted);
  assert.strictEqual(compose.secrets[secrets[0]].file, './secrets/firebase-admin.json');
});

test('nothing is published beyond this machine, and only Caddy publishes the app', () => {
  for (const [name, service] of Object.entries(compose.services)) {
    for (const port of service.ports ?? []) {
      assert.match(port, /^127\.0\.0\.1:/, `${name} publishes ${port} on every network interface`);
    }
  }
  for (const name of ['backend', 'frontend']) {
    assert.strictEqual(compose.services[name].ports, undefined, `${name} should only be reached through Caddy`);
  }
  assert.ok(compose.services.caddy.ports.some((p) => p.endsWith(':443')), 'Caddy serves https');
});

test('Caddy mounts the Caddyfile that is in the repo', () => {
  const mount = compose.services.caddy.volumes.find((v) => v.endsWith('/etc/caddy/Caddyfile:ro'));
  assert.ok(mount, 'Caddyfile is not mounted');
  assert.ok(fs.existsSync(path.join(root, mount.split(':')[0])));
});

test('the frontend gets every NEXT_PUBLIC_ value as a build arg, in Compose and in its Dockerfile', () => {
  const wanted = [...read('frontend/.env.example').matchAll(/^(NEXT_PUBLIC_\w+)=/gm)].map((m) => m[1]).sort();
  assert.ok(wanted.length >= 6);
  assert.deepStrictEqual(Object.keys(compose.services.frontend.build.args).sort(), wanted);
  const inRootEnv = [...read('.env.example').matchAll(/^(NEXT_PUBLIC_\w+)=/gm)].map((m) => m[1]).sort();
  assert.deepStrictEqual(inRootEnv, wanted, 'the root .env.example should list them for Compose');
  const declared = [...read('frontend/Dockerfile').matchAll(/^ARG (NEXT_PUBLIC_\w+)/gm)].map((m) => m[1]).sort();
  assert.deepStrictEqual(declared, wanted);
});

test('the backend image uses a Node version the backend supports', () => {
  const { engines } = JSON.parse(read('backend/package.json'));
  const minimum = Number(engines.node.match(/\d+/)[0]);
  const major = Number(read('backend/Dockerfile').match(/^FROM node:(\d+)/m)[1]);
  assert.ok(major >= minimum, `image is Node ${major}, engines asks for ${engines.node}`);
});

test('the compose file asks for the .env values it needs instead of guessing', () => {
  const text = read('docker-compose.yml');
  for (const name of ['POSTGRES_PASSWORD', 'RABBITMQ_PASSWORD', 'NEXT_PUBLIC_FIREBASE_API_KEY']) {
    assert.match(text, new RegExp(`\\$\\{${name}:\\?`), `${name} should be required`);
  }
});
