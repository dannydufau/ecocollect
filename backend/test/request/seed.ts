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

/** The `file_path` in `INSERT INTO photo` of `SEED_DELIVERED_REQUEST_ID`'s `photo_file_id` (also `SEED_OPEN_REQUEST_ID`'s). */
export const SEED_DELIVERED_PHOTO_PATH = '/sample/items/laptops.jpg';

/** The `file_path` in `INSERT INTO photo` of the `evidence_photo_file_id` in `INSERT INTO delivery` for `SEED_DELIVERED_REQUEST_ID`. */
export const SEED_DELIVERED_EVIDENCE_PATH = '/sample/deliveries/4.jpg';

/** A `pickup_request_id` whose last `status_change` is `Open`, with a `pickup_postal_code` other than `SEED_OPEN_REQUEST_ID`'s. */
export const SEED_OPEN_REQUEST_2_ID = '00000003-0000-4000-8000-000000000008';

/** The `pickup_postal_code` of `SEED_OPEN_REQUEST_2_ID`. */
export const SEED_OPEN_REQUEST_2_POSTAL_CODE = 'T2T4M3';

/** An `account_id` in `INSERT INTO resident`, not in `INSERT INTO volunteer`, other than `SEED_RESIDENT_ONLY_ID`. */
export const SEED_OTHER_RESIDENT_ONLY_ID = 'resident2';

/** A `pickup_request_id` whose last `status_change` is `Assigned`. */
export const SEED_ASSIGNED_REQUEST_ID = '00000003-0000-4000-8000-000000000002';

/** The volunteer (`terms_acceptance.account_id`) of an `assignment` on `SEED_ASSIGNED_REQUEST_ID` with `end_reason` `Volunteer_Cancelled`. */
export const SEED_CANCELLED_VOLUNTEER_ID = 'volunteer3';

/** An `account_id` in `INSERT INTO volunteer` other than `SEED_VOLUNTEER_ID`. */
export const SEED_OTHER_VOLUNTEER_ID = 'volunteer2';

/** A `pickup_request_id` whose last `status_change` is `Open`, used by no other test: the Q11 test accepts it. */
export const SEED_ACCEPT_REQUEST_ID = '00000003-0000-4000-8000-00000000000b';

/** The `pickup_window_id` of `SEED_ACCEPT_REQUEST_ID` in `INSERT INTO pickup_window` (active, 3 days after the load). */
export const SEED_ACCEPT_WINDOW_ID = '00000004-0000-4000-8000-00000000000b';
