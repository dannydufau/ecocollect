// topology.js must declare the consumer queues exactly as contracts/asyncapi.yaml
// says. If someone changes one and not the other, this test fails.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const topology = require('../src/messaging/topology');

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'contracts', 'asyncapi.yaml'), 'utf8'));

test('every consumer queue has the name, bindings and arguments the contract gives it', () => {
  // The contract's queue channels, e.g. notification.events.
  const fromContract = Object.values(spec.channels)
    .filter((c) => c.bindings?.amqp?.is === 'queue')
    .map((c) => ({
      name: c.address,
      bindings: c['x-bindings'],
      arguments: c['x-queue-arguments'],
      deadLetterQueue: c['x-dead-letter-queue'],
    }));

  // The same queue facts, from topology.js.
  const ours = Object.values(topology.queues).map((q) => ({
    name: q.name,
    bindings: q.bindings,
    arguments: topology.queueArguments(q.name),
    deadLetterQueue: topology.deadLetterQueueName(q.name),
  }));

  const byName = (a, b) => a.name.localeCompare(b.name);
  assert.deepStrictEqual(ours.sort(byName), fromContract.sort(byName));
});
