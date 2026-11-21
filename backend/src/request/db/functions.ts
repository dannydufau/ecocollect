// One typed wrapper per database function the service calls. Each is a single
// pool.query: one function call that PostgreSQL commits on its own.
import type pg from 'pg';
import type {
  AcceptInput, AcceptRow, CancelInput, CancelRow, CategoryRow, ConfirmCollectedInput, ConfirmCollectedRow, CreateRequestsInput,
  CreateRequestsRow, FacilityRow, GetDetailRow, GetRequestsRow, ListAvailableRow, ListMineRow,
  RecordDeliveryInput, RecordDeliveryRow,
} from '../domain/types.ts';

export async function listCategories(pool: pg.Pool): Promise<CategoryRow[]> {
  const { rows } = await pool.query<CategoryRow>(
    'SELECT * FROM requests.req_list_categories()');
  return rows;
}

// categoryId null = every facility.
export async function listFacilities(pool: pg.Pool, categoryId: string | null): Promise<FacilityRow[]> {
  const { rows } = await pool.query<FacilityRow>(
    'SELECT * FROM requests.req_list_facilities($1)', [categoryId]);
  return rows;
}

// Q4. One call creates every request, its events and the idempotency key, or
// nothing. SELECT * FROM, never SELECT (f(...)).*: the second form can run the
// function once per output column, repeating the writes. The casts say which
// array type each parameter is: pg sends JS arrays as untyped array text.
export async function createRequests(pool: pg.Pool, input: CreateRequestsInput): Promise<CreateRequestsRow> {
  const { rows } = await pool.query<CreateRequestsRow>(
    `SELECT * FROM requests.req_create_requests(
       $1, $2, $3::uuid, $4::text[], $5::int[], $6::text[], $7::text[],
       $8::date[], $9::smallint[], $10, $11, $12)`,
    [input.residentId, input.idempotencyKey, input.termsDocumentId,
    input.categoryIds, input.quantities, input.photoFileIds, input.photoPaths,
    input.dates, input.hours, input.notes, input.demo, input.traceId]);
  // a function with OUT parameters always returns exactly one row, so the ! (not-null assertion) is safe.
  return rows[0]!;
}

// Q4 201 body: the viewer's own requests among requestIds, in that order. An id
// that doesn't exist or isn't the viewer's gives no row, so fewer rows than ids
// means a bug in the caller. The cast makes pg send the JS array as uuid[].
export async function getRequests(pool: pg.Pool, requestIds: string[], viewerId: string): Promise<GetRequestsRow[]> {
  const { rows } = await pool.query<GetRequestsRow>(
    'SELECT * FROM requests.req_get_requests($1::uuid[], $2)', [requestIds, viewerId]);
  return rows;
}

// Q5: the resident's own requests, newest first. statuses null = every status;
// the cast makes pg send the JS array as text[].
export async function listMine(pool: pg.Pool, residentId: string, statuses: string[] | null): Promise<ListMineRow[]> {
  const { rows } = await pool.query<ListMineRow>(
    'SELECT * FROM requests.req_list_mine($1, $2::text[])', [residentId, statuses]);
  return rows;
}

// Q6: the Open requests any volunteer can accept, newest first. postalCodes
// null = every code.
export async function listAvailable(pool: pg.Pool, postalCodes: string[] | null): Promise<ListAvailableRow[]> {
  const { rows } = await pool.query<ListAvailableRow>(
    'SELECT * FROM requests.req_list_available($1::text[])', [postalCodes]);
  return rows;
}

// Q8: one request as the viewer may see it. Always one row; result_code
// 'request_unavailable' covers both "no such request" and "not yours to see".
// requestId must be a well-formed UUID (checked before the call).
export async function getDetail(pool: pg.Pool, requestId: string, viewerId: string): Promise<GetDetailRow> {
  const { rows } = await pool.query<GetDetailRow>(
    'SELECT * FROM requests.req_get_detail($1::uuid, $2)', [requestId, viewerId]);
  // a function with OUT parameters always returns exactly one row, so the ! (not-null assertion) is safe.
  return rows[0]!;
}

// Q11. One call locks the request, checks it, and writes the assignment and its
// RequestAssigned event, or expires an overdue request (also committed).
export async function accept(pool: pg.Pool, input: AcceptInput): Promise<AcceptRow> {
  const { rows } = await pool.query<AcceptRow>(
    'SELECT * FROM requests.req_accept($1::uuid, $2, $3::uuid, $4::uuid, $5)',
    [input.requestId, input.volunteerId, input.windowId, input.termsDocumentId, input.traceId]);
  // a function with OUT parameters always returns exactly one row, so the ! (not-null assertion) is safe.
  return rows[0]!;
}

// Q13. One call locks the request, checks that the caller is its owner and that
// it is Assigned, and writes collected_at, the status change and the
// RequestAssignmentCollected event.
export async function confirmCollected(pool: pg.Pool, input: ConfirmCollectedInput): Promise<ConfirmCollectedRow> {
  const { rows } = await pool.query<ConfirmCollectedRow>(
    'SELECT * FROM requests.req_confirm_collected($1::uuid, $2, $3)',
    [input.requestId, input.residentId, input.traceId]);
  // a function with OUT parameters always returns exactly one row, so the ! (not-null assertion) is safe.
  return rows[0]!;
}

export async function cancel(pool: pg.Pool, input: CancelInput): Promise<CancelRow> {
  const { rows } = await pool.query<CancelRow>(
    'SELECT * FROM requests.req_cancel($1::uuid, $2, $3, $4)',
    [input.requestId, input.residentId, input.reason, input.traceId]);
  // a function with OUT parameters always returns exactly one row, so the ! (not-null assertion) is safe.
  return rows[0]!;
}

export async function recordDelivery(pool: pg.Pool, input: RecordDeliveryInput): Promise<RecordDeliveryRow> {
  const { rows } = await pool.query<RecordDeliveryRow>(
    'SELECT * FROM requests.req_record_delivery($1::uuid, $2, $3::uuid, $4, $5, $6)',
    [input.requestId, input.volunteerId, input.facilityId, input.fileId, input.filePath, input.traceId]);
  // a function with OUT parameters always returns exactly one row, so the ! (not-null assertion) is safe.
  return rows[0]!;
}
