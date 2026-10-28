# Demo seed script

Seeds ten Firebase accounts and the matching PostgreSQL rows. Five accounts have resident role, five have volunteer role, and `demo-resident-5` has **both** roles (still 10 distinct accounts). Categories and preferred postal codes are also seeded. The script is repeatable: existing records are updated, and each run uses one PostgreSQL transaction.

## Setup

1. At the repository root copy `.env.example` to `.env`; set `POSTGRES_PASSWORD` and `DEMO_PASSWORD` (do not commit `.env`).
2. Start Postgres with `docker compose up -d postgres` and check `docker compose ps`.
3. Run `cd scripts/seed`, then `npm ci` and `npm test`.
4. Prefer the Firebase Auth Emulator (`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`). For a **real** Firebase project, put your private admin key at `secrets/firebase-admin.json` or configure `GOOGLE_APPLICATION_CREDENTIALS`. Never commit or share this key.
5. Run `npm run seed` from `scripts/seed`.

## Configuration

The seed reads the repository-root `.env` for missing settings, without overriding exported environment variables. You can explicitly set `DATABASE_URL`; otherwise it builds a localhost URL from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT`. For real Firebase users, you **must** set `DEMO_PASSWORD`. The emulator can use a development-only default if it is unset.

If a container runs the seed, use its network hostname and port in `DATABASE_URL` (for example host `postgres`, port `5432`). The `POSTGRES_PORT` setting is for scripts on the host computer.

Do not share demo credentials or use them for real users. These are demonstration accounts in Firebase Auth, not the isolated Demo Mode of the final app; remove them from a real Firebase project after the class demo. Re-seeding overwrites the selected demo accounts' passwords and custom claims. Use a disposable development Firebase project whenever possible.

## Verification

`npm test` runs built-in Node tests without requiring Firebase, Docker, or PostgreSQL. It checks demo data, configuration, transaction usage, repeatability SQL clauses, and rollback. These are not a replacement for integration testing against a real database. Satyam previously manually verified the DB seed. Run `npm run seed` against a disposable database and inspect its output before requesting final approval.

**Warning:** `docker compose down -v` permanently deletes Docker database-volume data. Only use it on a disposable test database.

Removing a user from `data.js` does not delete them from PostgreSQL or Firebase Auth.
