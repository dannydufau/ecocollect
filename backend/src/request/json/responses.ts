// Read-function rows -> response bodies in openapi.yaml's shape.
import type { CategoryRow, FacilityRow, GetRequestsRow, ListMineRow } from '../domain/types.ts';

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
