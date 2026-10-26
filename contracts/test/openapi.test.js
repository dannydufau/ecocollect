const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openapi, asyncapi, validator, inline, responseBody } = require('./helpers');

const created = '2026-10-28T16:15:00Z';
const expires = '2026-11-27T16:15:00Z';
const window = { date: '2026-10-30', startHour: 14 };
const body = (extra = {}) => ({
  items: [{ categoryId: 'laptops', quantity: 2 }],
  windows: [window],
  safetyAcknowledged: true,
  ...extra,
});

const operations = Object.entries(openapi.paths).flatMap(([route, methods]) =>
  Object.entries(methods).map(([method, op]) => ({ route, method, op, name: `${method.toUpperCase()} ${route}` })),
);

test('only the Oct 28 endpoints are in the spec', () => {
  assert.deepEqual(operations.map((o) => o.name).sort(), [
    'DELETE /api/session',
    'GET /api/events',
    'GET /api/requests',
    'POST /api/requests',
    'POST /api/session',
  ]);
});

test('operation ids are unique', () => {
  const ids = operations.map((o) => o.op.operationId);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.ok(id, 'every operation needs an operationId'));
});

test('every call behind the gateway can answer 401', () => {
  for (const { name, op } of operations.filter((o) => !o.route.endsWith('/session'))) {
    assert.ok(op.responses['401'], `${name} has no 401`);
  }
});

test('only the session calls skip authentication', () => {
  for (const { route, op, name } of operations) {
    const open = Array.isArray(op.security) && op.security.length === 0;
    assert.equal(open, route === '/api/session', `${name}: security is ${JSON.stringify(op.security)}`);
  }
});

test('the event stream uses the cookie and everything else uses the bearer token', () => {
  const schemes = (name) => operations.find((o) => o.name === name).op.security.flatMap(Object.keys);
  assert.deepEqual(schemes('GET /api/events'), ['sessionCookie']);
  assert.deepEqual(schemes('POST /api/requests'), ['bearerAuth']);
  assert.deepEqual(schemes('GET /api/requests'), ['bearerAuth']);
});

test('create request: a complete body is accepted', () => {
  const valid = validator(openapi, 'CreateRequests');
  assert.ok(valid(body()));
  assert.ok(valid(body({ notes: 'Back door', items: [{ categoryId: 'tvs', quantity: 1, description: 'Old CRT' }] })));
  const three = [window, { ...window, date: '2026-10-31' }, { ...window, date: '2026-11-01' }];
  assert.ok(valid(body({ windows: three })));
});

test('create request: bad bodies are rejected', () => {
  const valid = validator(openapi, 'CreateRequests');
  const bad = {
    'no items': body({ items: [] }),
    'items missing': { windows: [window], safetyAcknowledged: true },
    'zero quantity': body({ items: [{ categoryId: 'laptops', quantity: 0 }] }),
    'fractional quantity': body({ items: [{ categoryId: 'laptops', quantity: 1.5 }] }),
    'quantity as text': body({ items: [{ categoryId: 'laptops', quantity: '2' }] }),
    'no category': body({ items: [{ quantity: 2 }] }),
    'no windows': body({ windows: [] }),
    'four windows': body({ windows: Array.from({ length: 4 }, (_, i) => ({ ...window, date: `2026-11-0${i + 1}` })) }),
    'bad hour': body({ windows: [{ date: '2026-10-30', startHour: 24 }] }),
    'safety false': body({ safetyAcknowledged: false }),
    'safety as text': body({ safetyAcknowledged: 'true' }),
    'safety missing': { items: body().items, windows: [window] },
  };
  for (const [name, value] of Object.entries(bad)) assert.ok(!valid(value), `should reject: ${name}`);
});

test('create request: the weight and the address are not something the caller sends', () => {
  const props = openapi.components.schemas.CreateRequests.properties;
  const itemProps = props.items.items.properties;
  for (const key of ['estimatedWeightKg', 'street', 'address', 'postalCode']) {
    assert.ok(!(key in props) && !(key in itemProps), `${key} must not be in the request body`);
  }
});

test('create request: the 201 body lists what was created and is always Open', () => {
  const valid = inline(openapi, responseBody('post', '/api/requests', '201'));
  const one = {
    requestId: '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11',
    categoryId: 'laptops',
    quantity: 2,
    estimatedWeightKg: 5,
    status: 'Open',
    createdAt: created,
    expiresAt: expires,
  };
  assert.ok(valid({ requests: [one] }));
  assert.ok(!valid({ requests: [{ ...one, status: 'Assigned' }] }));
  assert.ok(!valid({ requests: [{ ...one, expiresAt: undefined }] }));
  assert.ok(!valid({ requests: [{ ...one, requestId: 'r_123' }] }), 'ids are uuids in the database');
  assert.ok(!valid({}));
});

test('list requests: view is required and is mine or available', () => {
  const view = openapi.paths['/api/requests'].get.parameters.find((p) => p.name === 'view');
  assert.equal(view.required, true);
  assert.deepEqual(view.schema.enum, ['mine', 'available']);
});

test('list requests: both views can be an empty list, which happens all the time', () => {
  const valid = inline(openapi, responseBody('get', '/api/requests', '200'));
  assert.ok(valid([]), 'an empty list has to be a valid answer');
});

test('list requests: a resident sees their own requests', () => {
  const valid = inline(openapi, responseBody('get', '/api/requests', '200'));
  const mine = {
    requestId: '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11',
    category: 'Computers/Laptops',
    quantity: 2,
    estimatedWeightKg: 5,
    status: 'Open',
    createdAt: created,
    expiresAt: expires,
  };
  assert.ok(valid([mine, { ...mine, status: 'Collected' }]));
  assert.ok(!valid([{ ...mine, status: 'Done' }]));
  assert.ok(!valid([{ ...mine, createdAt: undefined }]));
});

test('list requests: a volunteer sees the area and the windows but never the street', () => {
  const valid = inline(openapi, responseBody('get', '/api/requests', '200'));
  const open = {
    requestId: '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11',
    category: 'Computers/Laptops',
    quantity: 2,
    estimatedWeightKg: 5,
    postalCode: 'T2P1J9',
    windows: [window],
    expiresAt: expires,
  };
  assert.ok(valid([open]));
  for (const leak of ['street', 'address', 'residentUid', 'residentName']) {
    assert.ok(!valid([{ ...open, [leak]: 'x' }]), `${leak} must not be allowed in the volunteer list`);
  }
  assert.ok(!valid([{ ...open, postalCode: 'T2P' }]), 'only the full postal code');
});

test('list requests: the filters belong to their own view', () => {
  const params = Object.fromEntries(openapi.paths['/api/requests'].get.parameters.map((p) => [p.name, p]));
  assert.match(params.status.description, /view=mine/);
  assert.match(params.postalCodes.description, /view=available/);
  assert.ok(openapi.paths['/api/requests'].get.responses['400'], 'a wrong filter is a 400');
});

test('both roles are told apart: wrong role is a 403', () => {
  assert.ok(openapi.paths['/api/requests'].post.responses['403']);
  assert.ok(openapi.paths['/api/requests'].get.responses['403']);
});

test('the example on the event stream is a signal the other spec accepts', () => {
  const example = openapi.paths['/api/events'].get.responses['200'].content['text/event-stream'].example;
  const lines = Object.fromEntries(example.trim().split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
  assert.equal(lines.event, 'signal');
  assert.deepEqual(Object.keys(lines), ['event', 'data'], 'nothing is stored, so there is no id line');
  assert.ok(validator(asyncapi, 'SseSignalPayload')(JSON.parse(lines.data)));
});

test('session: the token comes in the body and the cookie comes back', () => {
  const post = openapi.paths['/api/session'].post;
  assert.deepEqual(post.requestBody.content['application/json'].schema.required, ['idToken']);
  assert.ok(post.responses['204'].headers['Set-Cookie']);
  for (const status of ['400', '401']) assert.ok(post.responses[status], `POST /api/session has no ${status}`);
  assert.ok(openapi.paths['/api/session'].delete.responses['204']);
});

test('create request: "other electronics" needs a description, because the database insists', () => {
  const valid = validator(openapi, 'CreateRequests');
  const other = (extra) => body({ items: [{ categoryId: 'other-electronics', quantity: 1, ...extra }] });
  assert.ok(valid(other({ description: 'Old label printer' })));
  assert.ok(!valid(other({})), 'no description');
  assert.ok(!valid(other({ description: '' })), 'empty description');
  assert.ok(!valid(other({ description: '   ' })), 'blank description');
  assert.ok(valid(body()), 'other categories still do not need one');
});

test('session: a Firebase failure is a 500, not a 401, so the frontend does not log the user out', () => {
  assert.ok(openapi.paths['/api/session'].post.responses['500']);
  assert.match(openapi.info.description, /500/);
});
