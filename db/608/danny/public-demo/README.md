# public-demo: fallback demo for #76 (push_subscription, cleanup_record)

These files run the #76 tables against the **app's existing `public` schema** (the Oct 28 tables in `db/init/001_schema.sql`), not the shared `ecocollect608` schema.

Use them to demo #76 if the combined `ecocollect608` build isn't working yet. They show the same tables, constraints and queries; the only difference is which existing tables they link to.

| | `public-demo/` (this folder) | `db/608/danny/` (main files) |
|---|---|---|
| Schema | `public` (the app's) | `ecocollect608` (shared 608 schema) |
| Accounts | `profiles(uid)`, e.g. `demo-volunteer-1` | Satyam's `account(account_id)`, e.g. `volunteer1` |
| Request status and expiry | Stored columns on `pickup_request` | Derived (latest `status_change`, `created_at` + 30 days) |

## Prerequisites

Run everything from the repository root.

1. **`.env` exists** (copy `.env.example`). Docker Compose checks the whole file, so `NEXT_PUBLIC_FIREBASE_API_KEY` must have a value, even if you only start Postgres. Any placeholder works if you are not building the frontend.

2. **Postgres is running:**
   ```bash
   docker compose up -d postgres
   docker compose ps          # postgres should show "healthy"
   ```

3. **The app schema is loaded.** `db/init/` scripts only run on an empty volume, so an older volume may not have the tables. Check:
   ```bash
   docker compose exec -T postgres psql -U ecocollect -d ecocollect -c "\dt"
   ```
   If `pickup_request` and `profiles` are missing, load the schema by hand (no data is lost):
   ```bash
   docker compose exec -T postgres psql -U ecocollect -d ecocollect < db/init/001_schema.sql
   ```

4. **The demo accounts exist in `profiles`.** The push seed uses `demo-volunteer-1`, `demo-volunteer-2` and `demo-resident-5`; the cleanup demo uses `demo-resident-1` and the `monitors` category. Check:
   ```bash
   docker compose exec -T postgres psql -U ecocollect -d ecocollect -c "SELECT uid FROM profiles ORDER BY uid;"
   ```
   If they are missing, run the main seed against the **Firebase Auth emulator** (no real Firebase project or demo password needed):
   ```bash
   # once, in the repo root: minimal emulator config (local only, don't commit)
   cat > firebase.json <<'EOF'
   { "emulators": { "auth": { "port": 9099 }, "ui": { "enabled": false } } }
   EOF

   # terminal 1: start the Auth emulator (needs Java 11+)
   npx firebase-tools emulators:start --only auth --project ecocollect-uofc

   # terminal 2: run the seed against the emulator
   cd scripts/seed && npm ci
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run seed
   ```
   The emulator's accounts disappear when it stops, but the `profiles` rows stay in Postgres, which is all this demo needs.

## Run the demo

```bash
docker compose exec -T postgres psql -U ecocollect -d ecocollect < db/608/danny/public-demo/tables.sql
docker compose exec -T postgres psql -U ecocollect -d ecocollect < db/608/danny/public-demo/seed.sql
docker compose exec -T postgres psql -U ecocollect -d ecocollect < db/608/danny/public-demo/queries.sql
docker compose exec -T postgres psql -U ecocollect -d ecocollect < db/608/danny/public-demo/cleanup_demo.sql
```

### Expected output

| File | Expected |
|---|---|
| `tables.sql` | Two `DROP TABLE` notices (harmless on a first run), then `CREATE TABLE`, `CREATE INDEX`, `CREATE TABLE` |
| `seed.sql` | `INSERT 0 4` the first time, `INSERT 0 0` on reruns |
| `queries.sql` | Push query: **2 rows** (vol1-phone, vol1-laptop). Cleanup query: **0 rows** (nothing cleaned up for real) |
| `cleanup_demo.sql` | Final SELECT shows **1 row**: request `…00aa`, status `Expired`, a timestamp. Then `ROLLBACK` |

Confirm the cleanup demo left nothing behind (should print **0**):
```bash
docker compose exec -T postgres psql -U ecocollect -d ecocollect \
  -c "SELECT count(*) FROM pickup_request WHERE request_id = '10000000-0000-4000-8000-0000000000aa';"
```

## Notes

- **`scheduled_cleanup.sql` is not part of the demo.** It is the real version the backend's expiration scheduler would run, and it commits changes. On demo data nothing is overdue, so it changes nothing; use `cleanup_demo.sql` to see the cleanup work.
- **`cleanup_demo.sql` is safe to rerun.** It creates its own overdue request, runs the cleanup steps, shows the result, and ends with `ROLLBACK`.
- **`tables.sql` only drops this ticket's two tables**, never the app's.
- **To reset the whole local database**, use `docker compose down -v` and then `docker compose up -d postgres`. This deletes all local data; only do it on a disposable database.

## Troubleshooting

| Error | Cause / fix |
|---|---|
| `required variable NEXT_PUBLIC_FIREBASE_API_KEY is missing a value` | Add it to `.env` (see Prerequisites 1) |
| `relation "pickup_request" does not exist` / `"profiles" does not exist` | App schema not loaded (Prerequisites 3) |
| `violates foreign key constraint … profiles` | Demo accounts missing (Prerequisites 4) |
| `Set DEMO_PASSWORD for real Firebase demo users` | The seed isn't pointed at the emulator; set `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` |
| First line of output is `SET`, then "does not exist" errors | A file still has `SET search_path TO ecocollect608;`; files in this folder must use `public` (or no `SET` line) |