// Known values from the seed the test database is built from:
//   docs/Final Submission/ENSF608/4. Physical model/seed.sql (loaded by load-db.sh).
// The database tests compare the API's answers with these exact values, so a
// wrong query can't pass just by returning something.
//
// If seed.sql changes:
//   1. Update the constant here; the comment above each says where in seed.sql
//      it comes from.
//   2. Rebuild the test database: backend/scripts/request/load-db.sh ecocollect_request_test
//   3. Run the tests (see db.ts).
// To test with other seed data, change only this file, not the tests.

/** Rows in `INSERT INTO item_category`. */
export const SEED_CATEGORY_COUNT = 9;

/** A `category_id` from `INSERT INTO item_category` that is in `INSERT INTO facility_accepts`. */
export const SEED_CATEGORY_ID = 'phones';

/** Rows of `INSERT INTO facility_accepts` with `SEED_CATEGORY_ID`. */
export const SEED_FACILITIES_FOR_CATEGORY = 2;

/** An `account_id` in `INSERT INTO volunteer`. */
export const SEED_VOLUNTEER_ID = 'volunteer1';

/** An `account_id` in `INSERT INTO resident` and not in `INSERT INTO volunteer`. */
export const SEED_RESIDENT_ONLY_ID = 'resident1';

/** The `terms_document_id` in `INSERT INTO terms_document` with the latest `published_at` (the current terms). */
export const SEED_CURRENT_TERMS_ID = '00000001-0000-4000-8000-000000000002';

/** A `pickup_request_id` of `SEED_RESIDENT_ONLY_ID` whose last `status_change` is `Open`. */
export const SEED_OPEN_REQUEST_ID = '00000003-0000-4000-8000-000000000001';

/** A `pickup_request_id` of `SEED_RESIDENT_ONLY_ID` whose last `status_change` is `Delivered`. */
export const SEED_DELIVERED_REQUEST_ID = '00000003-0000-4000-8000-000000000004';
