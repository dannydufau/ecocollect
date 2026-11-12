const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openapi, asyncapi, validator, inline } = require('./helpers');

const METHODS = ['get', 'post', 'patch', 'put', 'delete'];
const operations = Object.entries(openapi.paths).flatMap(([route, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({ route, method: m, op: item[m] })));
const find = (method, route) => openapi.paths[route]?.[method];

// README section 5.2: Request Service.
const README_REQUEST_SERVICE = [
  ['Q1', 'get', '/api/categories'], ['Q2', 'get', '/api/facilities'], ['Q3', 'post', '/api/uploads'],
  ['Q4', 'post', '/api/requests'], ['Q5, Q6, Q7', 'get', '/api/requests'], ['Q8', 'get', '/api/requests/{id}'],
  ['Q9', 'patch', '/api/requests/{id}'], ['Q10', 'post', '/api/requests/{id}/cancel'],
  ['Q11', 'post', '/api/requests/{id}/assignment'], ['Q12', 'post', '/api/requests/{id}/assignment/cancel'],
  ['Q13', 'post', '/api/requests/{id}/assignment/collected'], ['Q14', 'post', '/api/requests/{id}/assignment/missed'],
  ['Q15', 'post', '/api/requests/{id}/assignment/delivery'],
];

test('every Request Service call in the README is in the spec, with its method and path', () => {
  for (const [id, method, route] of README_REQUEST_SERVICE) {
    const op = find(method, route);
    assert.ok(op, `${id}: ${method.toUpperCase()} ${route} is missing`);
    assert.equal(op['x-readme-id'], id);
  }
});

test('every call behind the gateway can answer 401, and only the session calls skip authentication', () => {
  for (const { route, method, op } of operations) {
    const open = Array.isArray(op.security) && op.security.length === 0;
    if (route === '/api/session') assert.ok(open, `${method} ${route} must not need a token`);
    else {
      assert.ok(!open, `${method} ${route} must be authenticated`);
      assert.ok(op.responses['401'], `${method} ${route} has no 401`);
    }
  }
  assert.deepEqual(find('get', '/api/events').security, [{ sessionCookie: [] }], 'EventSource sends the cookie');
});

test('every example in the spec is valid against its schema', () => {
  let count = 0;
  for (const { route, method, op } of operations) {
    const media = [
      ['request body', op.requestBody?.content?.['application/json']],
      ...Object.entries(op.responses).map(([status, r]) => [status, r.content?.['application/json']]),
    ];
    for (const [where, m] of media) {
      if (!m?.example) continue;
      const valid = inline(openapi, m.schema);
      assert.ok(valid(m.example), `${method} ${route} ${where}: ${JSON.stringify(valid.errors)}`);
      count++;
    }
  }
  assert.ok(count >= 8, 'the examples are there');
});

test('every 4xx answer has the shared error body, { error: { code, message } }', () => {
  const responses = openapi.components.responses;
  for (const { route, method, op } of operations) {
    for (const [status, r] of Object.entries(op.responses)) {
      if (!status.startsWith('4') || route === '/api/session') continue;
      const resolved = r.$ref ? responses[r.$ref.split('/').pop()] : r;
      const schema = JSON.stringify(resolved.content?.['application/json']?.schema ?? {});
      assert.match(schema, /common\.yaml#\/Error/, `${method} ${route} ${status}`);
    }
  }
});

test('lists never carry a street address, notes or a photo URL, and the available list is closed (NFR03)', () => {
  const schemas = openapi.components.schemas;
  for (const name of ['MyRequest', 'AvailableRequest', 'VolunteerAssignment', 'CreatedRequest']) {
    for (const key of Object.keys(schemas[name].properties)) {
      assert.doesNotMatch(key, /street|address|notes|photoUrl|resident/i, `${name}.${key}`);
    }
  }
  assert.equal(schemas.AvailableRequest.additionalProperties, false);
});

test('operation ids are unique', () => {
  const ids = operations.map((o) => o.op.operationId);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.ok(id, 'every operation needs an operationId'));
});

test('the example on the event stream starts with the ready event, then a notification the other spec accepts', () => {
  const example = openapi.paths['/api/events'].get.responses['200'].content['text/event-stream'].example;
  const parse = (message) => Object.fromEntries(message.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
  const [ready, notification] = example.trim().split('\n\n').map(parse);
  assert.equal(ready.event, 'ready', 'the first thing on the wire, so the browser opens the stream right away');
  assert.deepEqual(Object.keys(ready), ['event', 'data']);
  assert.ok(validator(asyncapi, 'SseReadyPayload')(JSON.parse(ready.data)));
  assert.equal(notification.event, 'notification');
  assert.equal(notification.id, JSON.parse(notification.data).notificationId, 'the id line is the notification id');
  assert.ok(validator(asyncapi, 'SseNotificationPayload')(JSON.parse(notification.data)));
});

test('session: the token comes in the body and the cookie comes back', () => {
  const post = openapi.paths['/api/session'].post;
  assert.deepEqual(post.requestBody.content['application/json'].schema.required, ['idToken']);
  assert.ok(post.responses['204'].headers['Set-Cookie']);
  for (const status of ['400', '401']) assert.ok(post.responses[status], `POST /api/session has no ${status}`);
  assert.ok(openapi.paths['/api/session'].delete.responses['204']);
});

test('session: a Firebase failure is a 500, not a 401, so the frontend does not log the user out', () => {
  assert.ok(openapi.paths['/api/session'].post.responses['500']);
  assert.match(openapi.info.description, /500/);
});
