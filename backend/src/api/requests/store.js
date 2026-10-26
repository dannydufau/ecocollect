const { randomUUID } = require('node:crypto');

// A problem with what the caller asked for. The router turns it into a 400.
class RequestError extends Error {}

async function inTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function loadCategories(db, items) {
  const ids = [...new Set(items.map((i) => i.categoryId))];
  const { rows } = await db.query(
    'SELECT category_id, name, standard_weight_kg::float8 AS weight FROM categories WHERE category_id = ANY($1) AND is_active',
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.category_id, r]));
  const missing = ids.find((id) => !byId.has(id));
  if (missing) throw new RequestError(`unknown category: ${missing}`);
  return byId;
}

// Volunteers who saved this postal code, snapshotted now so later changes don't touch the event.
async function matchVolunteers(db, postalCode, residentUid) {
  const { rows } = await db.query(
    'SELECT DISTINCT uid FROM volunteer_preferred_postal_codes WHERE postal_code = $1 AND uid <> $2 ORDER BY uid',
    [postalCode, residentUid],
  );
  return rows.map((r) => r.uid);
}

async function insertRequest(db, { uid, profile, item, category, windows, notes }) {
  const { rows } = await db.query(
    `INSERT INTO pickup_request
       (resident_uid, category_id, quantity, estimated_weight_kg, item_description,
        pickup_street, pickup_postal_code, notes, safety_acknowledged)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
     RETURNING request_id, estimated_weight_kg::float8 AS weight, created_at, expires_at`,
    [uid, item.categoryId, item.quantity, item.quantity * category.weight, item.description ?? null,
      profile.street, profile.postal_code, notes ?? null],
  );
  const row = rows[0];
  for (const [i, w] of windows.entries()) {
    await db.query(
      'INSERT INTO pickup_window (request_id, window_no, window_date, start_hour) VALUES ($1, $2, $3, $4)',
      [row.request_id, i + 1, w.date, w.startHour],
    );
  }
  await db.query("INSERT INTO status_change (request_id, change_no, status) VALUES ($1, 1, 'Open')", [row.request_id]);
  return row;
}

// The event goes into the outbox in the same transaction as the request, so it can't be lost.
async function insertEvent(db, { uid, profile, item, category, windows, row, volunteers }) {
  const eventId = randomUUID();
  const event = {
    eventId,
    type: 'RequestCreated',
    version: 1,
    occurredAt: row.created_at.toISOString(),
    data: {
      requestId: row.request_id,
      residentUid: uid,
      categoryId: item.categoryId,
      categoryName: category.name,
      quantity: item.quantity,
      estimatedWeightKg: row.weight,
      postalCode: profile.postal_code,
      windows,
      expiresAt: row.expires_at.toISOString(),
      matchedVolunteerUids: volunteers,
    },
  };
  await db.query(
    `INSERT INTO outbox (event_id, event_type, event_version, routing_key, aggregate_id, payload)
     VALUES ($1, 'RequestCreated', 1, 'request.created', $2, $3)`,
    [eventId, row.request_id, event],
  );
}

function createStore(pool) {
  // One request per item, all or nothing.
  async function createRequests({ uid, items, windows, notes }) {
    return inTransaction(pool, async (db) => {
      const { rows } = await db.query('SELECT street, postal_code FROM profiles WHERE uid = $1', [uid]);
      if (!rows[0]) throw new RequestError('this account has no profile yet');
      const profile = rows[0];
      const categories = await loadCategories(db, items);
      const volunteers = await matchVolunteers(db, profile.postal_code, uid);

      const created = [];
      for (const item of items) {
        const category = categories.get(item.categoryId);
        const row = await insertRequest(db, { uid, profile, item, category, windows, notes });
        await insertEvent(db, { uid, profile, item, category, windows, row, volunteers });
        created.push({
          requestId: row.request_id,
          categoryId: item.categoryId,
          quantity: item.quantity,
          estimatedWeightKg: row.weight,
          status: 'Open',
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        });
      }
      return created;
    });
  }

  return { createRequests };
}

module.exports = { createStore, RequestError };
