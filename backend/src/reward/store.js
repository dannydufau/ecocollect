'use strict';

// Reward Service data access: saving awards (contract 15.1 to 15.4) and the R1 to R3 reads (15.5).
// Awards live in the 608 course tables until integration, then in "rewards".

const COURSE = 'ecocollect608';
const ROLE_TABLE = { volunteer: 'volunteer_award', resident: 'resident_award' };

// Runs work(db) in a transaction.
async function inTransaction(pool, work) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

// Saves the processed event, the awards with their role rows, and the outgoing event.
// An award the assignment already has for that role is skipped (15.4).
// Returns false for an event that was already processed.
function saveResult(pool, eventId, result) {
  return inTransaction(pool, async (db) => {
    const processed = await db.query(
      'INSERT INTO rewards.processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [eventId],
    );
    if (processed.rowCount === 0) return false;
    if (!result) return true;

    let saved = 0;
    for (const award of result.awards) {
      const roleTable = `${COURSE}.${ROLE_TABLE[award.earnedAs]}`;
      const existing = await db.query(
        `SELECT 1 FROM ${COURSE}.ecopoints_award a JOIN ${roleTable} r USING (ecopoints_award_id)
         WHERE a.assignment_id = $1`,
        [result.assignmentId],
      );
      if (existing.rowCount > 0) continue;

      await db.query(
        `INSERT INTO ${COURSE}.ecopoints_award (ecopoints_award_id, assignment_id, points, formula) VALUES ($1, $2, $3, $4)`,
        [award.awardId, result.assignmentId, award.points, award.formula],
      );
      await db.query(`INSERT INTO ${roleTable} (ecopoints_award_id) VALUES ($1)`, [award.awardId]);
      saved += 1;
    }

    if (saved > 0) {
      await db.query(
        `INSERT INTO rewards.outbox (event_id, event_type, routing_key, payload) VALUES ($1, $2, $3, $4)`,
        [result.event.eventId, result.event.type, result.routingKey, result.event],
      );
    }
    return true;
  });
}

// Every award with its role, recipient, assignment, request and category (contract 8 read paths).
const AWARDS = `
  SELECT a.ecopoints_award_id, a.assignment_id, a.points, a.formula,
         CASE WHEN v.ecopoints_award_id IS NULL THEN 'resident' ELSE 'volunteer' END AS earned_as,
         CASE WHEN v.ecopoints_award_id IS NULL THEN rta.account_id ELSE vta.account_id END AS account_id,
         CASE WHEN asg.end_reason = 'Resident_Cancelled' THEN 'CANCELLATION' ELSE 'DELIVERY' END AS kind,
         asg.ended_at, pr.pickup_request_id, pr.quantity, pr.estimated_weight_kg,
         ic.name AS category_name, ic.waste_type
  FROM ${COURSE}.ecopoints_award a
  LEFT JOIN ${COURSE}.volunteer_award v ON v.ecopoints_award_id = a.ecopoints_award_id
  JOIN ${COURSE}.assignment asg ON asg.assignment_id = a.assignment_id
  JOIN ${COURSE}.terms_acceptance vta ON vta.terms_acceptance_id = asg.terms_acceptance_id
  JOIN ${COURSE}.pickup_window pw ON pw.pickup_window_id = asg.pickup_window_id
  JOIN ${COURSE}.pickup_request pr ON pr.pickup_request_id = pw.pickup_request_id
  JOIN ${COURSE}.terms_acceptance rta ON rta.terms_acceptance_id = pr.terms_acceptance_id
  JOIN ${COURSE}.item_category ic ON ic.category_id = pr.category_id`;

// R1: the account's totals and awards, newest first.
async function getEcopoints(pool, accountId) {
  const totals = await pool.query(
    `SELECT COALESCE(SUM(points), 0) AS total,
            COALESCE(SUM(points) FILTER (WHERE earned_as = 'resident'), 0) AS as_resident,
            COALESCE(SUM(points) FILTER (WHERE earned_as = 'volunteer'), 0) AS as_volunteer
     FROM (${AWARDS}) aw WHERE account_id = $1`,
    [accountId],
  );
  const { rows } = await pool.query(
    `SELECT * FROM (${AWARDS}) aw WHERE account_id = $1 ORDER BY ended_at DESC NULLS LAST, ecopoints_award_id`,
    [accountId],
  );
  const t = totals.rows[0];
  return {
    total: Number(t.total),
    asResident: Number(t.as_resident),
    asVolunteer: Number(t.as_volunteer),
    awards: rows.map((r) => {
      const delivery = r.kind === 'DELIVERY';
      return {
        awardId: r.ecopoints_award_id,
        kind: r.kind,
        earnedAs: r.earned_as,
        points: Number(r.points),
        formula: r.formula,
        requestId: r.pickup_request_id,
        assignmentId: r.assignment_id,
        categoryName: delivery ? r.category_name : null,
        quantity: delivery ? r.quantity : null,
        estimatedWeightKg: delivery ? Number(r.estimated_weight_kg) : null,
        awardedAt: r.ended_at ? r.ended_at.toISOString() : null,
      };
    }),
  };
}

// R2: community statistics. One volunteer delivery award is one delivery.
async function getPublicStats(pool) {
  const { rows } = await pool.query(
    `SELECT waste_type, COUNT(*)::int AS deliveries, SUM(quantity)::int AS items, SUM(estimated_weight_kg) AS weight
     FROM (${AWARDS}) aw WHERE earned_as = 'volunteer' AND kind = 'DELIVERY'
     GROUP BY waste_type ORDER BY waste_type`,
  );
  const totals = await pool.query(
    `SELECT COALESCE(SUM(points), 0) AS points, now() AS updated_at FROM ${COURSE}.ecopoints_award`,
  );
  // Weights are added in hundredths so the total stays exact.
  const sum = (toNumber) => rows.reduce((total, r) => total + toNumber(r), 0);
  return {
    deliveries: sum((r) => r.deliveries),
    itemsDelivered: sum((r) => r.items),
    estimatedWeightKgDelivered: sum((r) => Math.round(Number(r.weight) * 100)) / 100,
    ecopointsAwarded: Number(totals.rows[0].points),
    byWasteType: rows.map((r) => ({
      wasteType: r.waste_type,
      deliveries: r.deliveries,
      itemsDelivered: r.items,
      estimatedWeightKgDelivered: Number(r.weight),
    })),
    updatedAt: totals.rows[0].updated_at.toISOString(),
  };
}

// R3: the account's EcoPoints, 0 for an unknown account.
async function getProfileStats(pool, accountId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(points), 0) AS ecopoints FROM (${AWARDS}) aw WHERE account_id = $1`,
    [accountId],
  );
  return { accountId, ecopoints: Number(rows[0].ecopoints) };
}

module.exports = { saveResult, getEcopoints, getPublicStats, getProfileStats };