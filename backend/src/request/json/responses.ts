// Read-function rows -> response bodies in openapi.yaml's shape.
import type { CategoryRow, FacilityRow } from '../domain/types.ts';

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
