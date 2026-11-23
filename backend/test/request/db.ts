// The Request Service's database tests run against a scratch database built with
// backend/scripts/request/load-db.sh --test (ecocollect_request_test), never the
// Compose database the services use. Without REQUEST_TEST_DATABASE_URL they are skipped.
// Its own name, not TEST_DATABASE_URL: `npm test` runs these and the shared tests
// together, and TEST_DATABASE_URL points the shared ones at "ecocollect".
//   REQUEST_TEST_DATABASE_URL=postgres://ecocollect:change_me@localhost:5432/ecocollect_request_test npm test
export const testDatabaseUrl = process.env.REQUEST_TEST_DATABASE_URL ?? '';
// The admin login, only for moveIntoPast: it changes rows the service itself may
// not (users.terms_acceptance). Then REQUEST_TEST_DATABASE_URL can be the service
// login, ecocollect_request, so the tests run with its real grants. Without it,
// moveIntoPast uses REQUEST_TEST_DATABASE_URL, which then has to be the admin.
//   REQUEST_TEST_ADMIN_DATABASE_URL=postgres://ecocollect:change_me@localhost:5432/ecocollect_request_test
export const testAdminDatabaseUrl = process.env.REQUEST_TEST_ADMIN_DATABASE_URL || testDatabaseUrl;
export const skipDb = testDatabaseUrl ? false : 'set REQUEST_TEST_DATABASE_URL to run the database tests';
