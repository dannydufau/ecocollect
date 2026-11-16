// Checks the toolchain itself: Node runs .ts, imports the shared CommonJS
// outbox, and Kysely turns a query into plain SQL without a database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kysely, PostgresAdapter, DummyDriver, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import outbox from '../../src/messaging/outbox.js';

test('the shared CommonJS outbox can be imported', () => {
  assert.equal(typeof outbox.startOutboxPublisher, 'function');
});

test('Kysely compiles a query to SQL with no database connection', () => {
  // DummyDriver: Kysely builds SQL but never connects. export-sql will use the same trick.
  const db = new Kysely<{ item_category: { category_id: string; name: string } }>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });

  const query = db.selectFrom('item_category').select(['category_id', 'name']).orderBy('name').compile();

  assert.equal(query.sql, 'select "category_id", "name" from "item_category" order by "name"');
});
