// Row types of the database functions the service calls, as node-postgres
// delivers them through createPool (db/pool.ts): DATE as 'YYYY-MM-DD',
// TIMESTAMPTZ as Date, BIGINT and NUMERIC as string.

// One row of requests.outbox, as requests.req_outbox_claim returns it.
// Which of the nullable columns are set depends on event_type; the outbox_eN_ck
// CHECKs in 020_request_ops.sql say which (contract 10.3).
export type OutboxRow = {
  // Envelope (contract 10.1)
  event_id: string;
  event_type: string;
  event_version: number;
  routing_key: string;
  occurred_at: Date;
  trace_id: string | null;

  // Request snapshot (contract 10.2), the request after the change
  pickup_request_id: string;
  request_seq: string;                 // BIGINT
  transition_id: string;
  status: string;
  resident_id: string;
  category_id: string;
  category_name: string;
  waste_type: string;
  quantity: number;
  estimated_weight_kg: string;         // NUMERIC
  postal_code: string;
  window_ids: string[];                // active windows, parallel arrays
  window_dates: string[];
  window_start_hours: number[];
  request_created_at: Date;
  expires_at: Date;

  // Assignment snapshot (E3-E8)
  assignment_id: string | null;
  volunteer_id: string | null;
  assignment_window_id: string | null;
  assignment_window_date: string | null;
  assignment_window_start_hour: number | null;
  accepted_at: Date | null;
  collected_at: Date | null;
  ended_at: Date | null;
  end_reason: string | null;

  // Event-specific fields (contract 10.3)
  facility_id: string | null;          // E5
  facility_name: string | null;        // E5
  delivered_at: Date | null;           // E5
  cancelled_at: Date | null;           // E6, E7
  outside_cancellation_window: boolean | null; // E6
  reported_at: Date | null;            // E8
  rescheduled_as_request_id: string | null;    // E8 (optional)
  rescheduled_from_request_id: string | null;  // E1 (optional)
  matched_volunteer_ids: string[] | null;      // E1, E2
  changed: string[] | null;            // E2 'edited'
  reason: string | null;               // E2, E9 (optional)
  expiry_trigger: string | null;       // E10

  // Publishing state
  enqueued_at: Date;
  claimed_until: Date | null;
  published_at: Date | null;
};

// One row of requests.req_list_categories (Q1).
export type CategoryRow = {
  category_id: string;
  name: string;
  waste_type: string;
  standard_weight_kg: string;          // NUMERIC
};

// One row of requests.req_list_facilities (Q2).
export type FacilityRow = {
  facility_id: string;
  name: string;
  street: string;
  postal_code: string;
  special_instructions: string | null;
  accepted_category_ids: string[];
};

// The values requests.req_create_requests takes (Q4), already shape-checked.
// Items are parallel arrays: element i of each is one item; an item without a
// photo has null in both photo arrays. Windows the same: dates[i] + hours[i].
export type CreateRequestsInput = {
  residentId: string;
  idempotencyKey: string | null;       // null when the header is absent
  termsDocumentId: string;             // a well-formed UUID (checked before the call)
  categoryIds: string[];
  quantities: number[];
  photoFileIds: (string | null)[];
  photoPaths: (string | null)[];
  dates: string[];                     // 'YYYY-MM-DD'
  hours: number[];
  notes: string | null;
  demo: boolean;
  traceId: string | null;
};

// The one row requests.req_create_requests returns.
export type CreateRequestsRow = {
  result_code: 'ok' | 'replayed' | 'forbidden' | 'terms_outdated' | 'validation_failed';
  error_fields: string[];              // paired with error_messages, element by element
  error_messages: string[];
  created_request_ids: string[] | null; // set for 'ok' and 'replayed'
};

// One row of requests.req_get_requests (the Q4 201 body, one per request).
export type GetRequestsRow = {
  request_id: string;
  category_id: string;
  category_name: string;
  waste_type: string;
  quantity: number;
  estimated_weight_kg: string;         // NUMERIC
  status: string;
  created_at: Date;
  expires_at: Date;
};
