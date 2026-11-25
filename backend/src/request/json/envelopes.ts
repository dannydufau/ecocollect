// Outbox row -> event envelope (contract 10.1-10.3, asyncapi.yaml).
// The database stores each event as plain columns; the JSON is built only here,
// at send time.
import type { OutboxRow } from '../domain/types.ts';

type PickupWindow = { windowId: string; date: string; startHour: number };

export type EventEnvelope = {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  producer: 'request-service';
  traceId: string | null;
  data: Record<string, unknown>;
};

// A column the event's CHECK requires. NULL here means the row and this code
// disagree: a bug, so it throws instead of sending an envelope that breaks the contract.
function need<T>(value: T | null, column: string, row: OutboxRow): T {
  if (value === null) {
    throw new Error(`outbox ${row.event_id} (${row.event_type}): ${column} is null`);
  }
  return value;
}

// Timestamps go out as ISO 8601 in UTC with a Z (common.yaml Timestamp).
function iso(value: Date): string {
  return value.toISOString();
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function requestSnapshot(row: OutboxRow) {
  return {
    requestId: row.pickup_request_id,
    requestSeq: Number(row.request_seq),
    transitionId: row.transition_id,
    status: row.status,
    residentUid: row.resident_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    wasteType: row.waste_type,
    quantity: row.quantity,
    estimatedWeightKg: Number(row.estimated_weight_kg),
    postalCode: row.postal_code,
    // The three arrays line up (outbox_windows_ck), so index i is one window.
    windows: row.window_ids.map((windowId, i): PickupWindow => ({
      windowId,
      date: need(row.window_dates[i] ?? null, 'window_dates', row),
      startHour: need(row.window_start_hours[i] ?? null, 'window_start_hours', row),
    })),
    createdAt: iso(row.request_created_at),
    expiresAt: iso(row.expires_at),
  };
}

function assignmentSnapshot(row: OutboxRow) {
  return {
    assignmentId: need(row.assignment_id, 'assignment_id', row),
    volunteerUid: need(row.volunteer_id, 'volunteer_id', row),
    window: {
      windowId: need(row.assignment_window_id, 'assignment_window_id', row),
      date: need(row.assignment_window_date, 'assignment_window_date', row),
      startHour: need(row.assignment_window_start_hour, 'assignment_window_start_hour', row),
    },
    acceptedAt: iso(need(row.accepted_at, 'accepted_at', row)),
    collectedAt: isoOrNull(row.collected_at),
    endedAt: isoOrNull(row.ended_at),
    endReason: row.end_reason,
  };
}

// data for each event type: `request` always, then the fields of contract 10.3.
function eventData(row: OutboxRow): Record<string, unknown> {
  const request = requestSnapshot(row);
  switch (row.event_type) {
    case 'RequestCreated': // E1
      return {
        request,
        matchedVolunteerUids: need(row.matched_volunteer_ids, 'matched_volunteer_ids', row),
        rescheduledFromRequestId: row.rescheduled_from_request_id,
      };
    case 'RequestUpdated': // E2: `changed` only when edited
      return {
        request,
        reason: need(row.reason, 'reason', row),
        ...(row.changed === null ? {} : { changed: row.changed }),
        matchedVolunteerUids: need(row.matched_volunteer_ids, 'matched_volunteer_ids', row),
      };
    case 'RequestAssigned': // E3
    case 'RequestAssignmentCollected': // E4
      return { request, assignment: assignmentSnapshot(row) };
    case 'RequestAssignmentDelivered': // E5
      return {
        request,
        assignment: assignmentSnapshot(row),
        facility: {
          facilityId: need(row.facility_id, 'facility_id', row),
          name: need(row.facility_name, 'facility_name', row),
        },
        deliveredAt: iso(need(row.delivered_at, 'delivered_at', row)),
      };
    case 'RequestAssignmentCancelledResident': // E6
      return {
        request,
        assignment: assignmentSnapshot(row),
        cancelledAt: iso(need(row.cancelled_at, 'cancelled_at', row)),
        outsideCancellationWindow: need(row.outside_cancellation_window, 'outside_cancellation_window', row),
      };
    case 'RequestAssignmentCancelledVolunteer': // E7
      return {
        request,
        assignment: assignmentSnapshot(row),
        cancelledAt: iso(need(row.cancelled_at, 'cancelled_at', row)),
      };
    case 'RequestAssignmentMissed': // E8
      return {
        request,
        assignment: assignmentSnapshot(row),
        reportedAt: iso(need(row.reported_at, 'reported_at', row)),
        rescheduledAsRequestId: row.rescheduled_as_request_id,
      };
    case 'RequestCancelled': // E9: the resident's reason, or null
      return { request, reason: row.reason };
    case 'RequestExpired': // E10
      return { request, trigger: need(row.expiry_trigger, 'expiry_trigger', row) };
    default:
      throw new Error(`outbox ${row.event_id}: unknown event type ${row.event_type}`);
  }
}

export function buildEnvelope(row: OutboxRow): EventEnvelope {
  return {
    eventId: row.event_id,
    type: row.event_type,
    version: row.event_version,
    occurredAt: iso(row.occurred_at),
    producer: 'request-service',
    traceId: row.trace_id,
    data: eventData(row),
  };
}
