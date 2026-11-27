const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const { openConnection, socketOptions } = require('../src/messaging/connection');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// A stand-in CA file: socketOptions only reads the bytes, it doesn't parse them.
const caFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'ca.pem');
fs.writeFileSync(caFile, 'test CA');

test('an amqps URL with a CA file trusts only that CA; otherwise nothing changes', () => {
  assert.deepStrictEqual(socketOptions('amqps://u:p@rabbitmq:5671', caFile), { ca: [Buffer.from('test CA')] });
  assert.deepStrictEqual(socketOptions('amqp://u:p@rabbitmq:5672', caFile), {});
  assert.deepStrictEqual(socketOptions('amqps://u:p@rabbitmq:5671', undefined), {});
});

test('openConnection passes the CA to amqplib', async () => {
  let options;
  const fake = { on() {} };
  await openConnection('amqps://u:p@rabbitmq:5671', {
    name: 'test', onClose() {}, caFile, connect: async (_url, opts) => { options = opts; return fake; },
  });
  assert.deepStrictEqual(options, { ca: [Buffer.from('test CA')] });
});

test('the TLS override moves only the Notification Service to amqps on 5671, with our CA', () => {
  const override = YAML.parse(read('docker-compose.tls.yml')).services;
  assert.deepStrictEqual(Object.keys(override).sort(), ['notification', 'rabbitmq']);

  const { environment, volumes } = override.notification;
  assert.match(environment.RABBITMQ_URL, /^amqps:\/\/.+@rabbitmq:5671$/);
  assert.ok(volumes.some((v) => v.endsWith(`:${environment.RABBITMQ_CA_FILE}:ro`)), 'the CA is mounted where it is read');

  // RabbitMQ loads tls.conf from conf.d and finds the certificates where tls.conf expects them.
  const mounts = override.rabbitmq.volumes;
  assert.ok(mounts.includes('./infra/rabbitmq/tls.conf:/etc/rabbitmq/conf.d/20-tls.conf:ro'));
  assert.ok(mounts.includes('./infra/rabbitmq/certs:/etc/rabbitmq/certs:ro'));
  const conf = read('infra/rabbitmq/tls.conf');
  assert.match(conf, /^listeners\.tcp\.default = 5672$/m, 'the other services keep the plain listener');
  assert.match(conf, /^listeners\.ssl\.default = 5671$/m);
  assert.match(conf, /^ssl_options\.certfile\s+= \/etc\/rabbitmq\/certs\/server\.pem$/m);
});
