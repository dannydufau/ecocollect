// Read-function rows -> response bodies in openapi.yaml's shape.
import type {
  CategoryRow, FacilityRow, GetDetailRow, GetRequestsRow, ListAvailableRow, ListMineRow,
} from '../domain/types.ts';

// Q1, CategoryWithWeight. NUMERIC arrives as a string; the contract wants a number.
export function category(row: CategoryRow) {
  return {
    categoryId: row.category_id,
    name: row.name,
    wasteType: row.waste_type,
    standardWeightKg: Number(row.standard_weight_kg),
  };
}

// Q2, Facility.
export function facility(row: FacilityRow) {
  return {
    facilityId: row.facility_id,
    name: row.name,
    street: row.street,
    postalCode: row.postal_code,
    specialInstructions: row.special_instructions,
    acceptedCategoryIds: row.accepted_category_ids,
  };
}

// Q4, CreatedRequest. Timestamps as ISO 8601 in UTC with a Z (common.yaml Timestamp).
export function createdRequest(row: GetRequestsRow) {
  return {
    requestId: row.request_id,
    category: { categoryId: row.category_id, name: row.category_name, wasteType: row.waste_type },
    quantity: row.quantity,
    estimatedWeightKg: Number(row.estimated_weight_kg),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

// Q5, MyRequest: CreatedRequest's fields plus hasPhoto (the photo itself is in Q8).
export function myRequest(row: ListMineRow) {
  return { ...createdRequest(row), hasPhoto: row.has_photo };
}

// Q6, AvailableRequest: no street, notes, photo or resident (NFR03). The SQL
// returns the windows as three arrays that line up; index i is one PickupWindow.
export function availableRequest(row: ListAvailableRow) {
  return {
    requestId: row.request_id,
    category: { categoryId: row.category_id, name: row.category_name, wasteType: row.waste_type },
    quantity: row.quantity,
    estimatedWeightKg: Number(row.estimated_weight_kg),
    postalCode: row.postal_code,
    windows: row.window_ids.map((windowId, i) => ({
      windowId,
      date: row.window_dates[i],
      startHour: row.window_hours[i],
    })),
    expiresAt: row.expires_at.toISOString(),
    hasPhoto: row.has_photo,
  };
}

// Q8 (and later Q9-Q15), RequestDetail. A field the viewer may not see is left
// out (README 5.2 visibility table); a field they may see but that has no value
// is null. Photo URLs are null (item) and absent (evidence) until ImageKit
// signing is wired in; the SQL already returns the paths for the viewers who may
// see them.
export function requestDetail(row: GetDetailRow) {
  const window = (windowId: string, date: string, startHour: number) => ({ windowId, date, startHour });
  const body: Record<string, unknown> = {
    requestId: row.request_id,
    status: row.status,
    category: { categoryId: row.category_id, name: row.category_name, wasteType: row.waste_type },
    quantity: row.quantity,
    estimatedWeightKg: Number(row.estimated_weight_kg),
    postalCode: row.postal_code,
    windows: row.window_ids.map((id, i) => window(id, row.window_dates[i]!, row.window_hours[i]!)),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    photoUrl: null,
  };

  // street is NOT NULL in the model, so a null street means "hidden", while a
  // null notes can also mean "no notes".
  if (row.street !== null) {
    body.notes = row.notes;
    body.address = { street: row.street, postalCode: row.postal_code };
  }
  if (row.resident_id !== null) {
    body.resident = { accountId: row.resident_id, publicName: row.resident_public_name };
  }

  // The owner and the linked volunteer get assignment and delivery (null when
  // there is none); a volunteer looking at an Open request gets neither.
  if (row.viewer !== 'volunteer') {
    body.assignment = row.assignment_id === null ? null : {
      assignmentId: row.assignment_id,
      volunteer: { accountId: row.assignment_volunteer_id, publicName: row.assignment_volunteer_name },
      window: window(row.assignment_window_id!, row.assignment_window_date!, row.assignment_window_hour!),
      status: row.assignment_status,
      acceptedAt: row.assignment_accepted_at!.toISOString(),
      collectedAt: row.assignment_collected_at?.toISOString() ?? null,
      endedAt: row.assignment_ended_at?.toISOString() ?? null,
      endReason: row.assignment_end_reason,
      outsideCancellationWindow: row.assignment_outside_window,
    };
    body.delivery = row.delivered_at === null ? null : {
      facility: { facilityId: row.delivery_facility_id, name: row.delivery_facility_name },
      deliveredAt: row.delivered_at.toISOString(),
    };
  }

  if (row.viewer === 'owner') {
    body.rescheduledFrom = row.rescheduled_from_id === null ? null : { requestId: row.rescheduled_from_id };
    body.rescheduledAs = row.rescheduled_as_id === null ? null : { requestId: row.rescheduled_as_id };
    body.statusHistory = (row.history_at ?? []).map((at, i) => ({
      status: row.history_status![i],
      changedAt: at.toISOString(),
      reason: row.history_reason![i] ?? null,
    }));
  }

  body.viewer = row.viewer;
  body.allowedActions = row.allowed_actions;
  body.refreshAt = row.refresh_at?.toISOString() ?? null;
  return body;
}
