// NFR01 maintainability checks. The cases are in
// docs/Final Submission/ENSF607/6. Software quality/cases/nfr/NFR01-maintainability.md
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.join(__dirname, '..', '..', '..');
const src = path.join(root, 'backend', 'src');
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

const SERVICES = ['user', 'request', 'notification', 'reward', 'cleanup'];
const SHARED = ['messaging', 'api'];

// Every source file under a folder, skipping dependencies and build output.
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['node_modules', '.next'].includes(entry.name) ? [] : sourceFiles(full);
    return /\.(c|m)?(j|t)sx?$/.test(entry.name) ? [full] : [];
  });
}

// The module names a file imports: require('x'), import ... from 'x', import('x').
function imports(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:require\(|import\(|from\s+)\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

test('NFR01-P1: each part named in NFR01 is its own component', () => {
  const services = YAML.parse(fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8')).services;

  for (const name of SERVICES) {
    const service = services[name];
    assert.ok(service, `Compose has no "${name}" service`);
    const entry = service.command?.[1] ?? '';
    assert.match(entry, new RegExp(`^src/${name}/index\\.(js|ts)$`), `"${name}" does not start its own entry point`);
    assert.ok(fs.existsSync(path.join(root, 'backend', entry)), `${entry} does not exist`);
  }

  const frontendContext = services.frontend?.build?.context;
  assert.strictEqual(frontendContext, './frontend', 'the frontend builds from frontend/');

  const sql = sourceFilesSql(path.join(root, 'db')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const schemas = new Set([...sql.matchAll(/CREATE SCHEMA(?: IF NOT EXISTS)?\s+(\w+)/gi)].map((m) => m[1]));
  for (const schema of ['users', 'requests', 'notifications', 'rewards', 'cleanup']) {
    assert.ok(schemas.has(schema), `no CREATE SCHEMA for "${schema}" under db/`);
  }
});

function sourceFilesSql(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesSql(full);
    return entry.name.endsWith('.sql') ? [full] : [];
  });
}

test("NFR01-P2: no service imports another service's code", () => {
  const found = [];
  for (const service of SERVICES) {
    for (const file of sourceFiles(path.join(src, service))) {
      for (const spec of imports(file).filter((s) => s.startsWith('.'))) {
        const target = path.relative(src, path.resolve(path.dirname(file), spec)).split(path.sep)[0];
        if (target !== service && !SHARED.includes(target)) found.push(`${service} -> ${target}: ${rel(file)} '${spec}'`);
      }
    }
  }

  const frontend = path.join(root, 'frontend');
  for (const file of sourceFiles(frontend)) {
    for (const spec of imports(file).filter((s) => s.startsWith('.'))) {
      if (path.relative(frontend, path.resolve(path.dirname(file), spec)).startsWith('..')) {
        found.push(`frontend -> outside frontend/: ${rel(file)} '${spec}'`);
      }
    }
  }

  assert.deepStrictEqual(found, [], `imports that reach into another component:\n${found.join('\n')}`);
});

test("NFR01-P4: each external service's library is used in one place", () => {
  // Library -> the one folder allowed to import it.
  const owners = {
    amqplib: 'backend/src/messaging/',
    'firebase-admin': 'backend/src/user/',
    '@imagekit/nodejs': 'backend/src/request/',
  };
  // Known exception: the request relay opens its own broker connection.
  // (not adopted): one shared relay behind the messaging module.
  const exceptions = ['backend/src/request/messaging/publisher.ts amqplib'];

  const found = [];
  for (const file of sourceFiles(src)) {
    for (const spec of imports(file)) {
      for (const [library, folder] of Object.entries(owners)) {
        const isLibrary = spec === library || spec.startsWith(`${library}/`);
        if (isLibrary && !rel(file).startsWith(folder) && !exceptions.includes(`${rel(file)} ${library}`)) {
          found.push(`${library} outside ${folder}: ${rel(file)}`);
        }
      }
    }
  }
  assert.deepStrictEqual(found, [], `libraries used outside their one place:\n${found.join('\n')}`);
});
