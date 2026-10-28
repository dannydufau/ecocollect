# Demo seed script

Seeds ten Firebase accounts and the matching PostgreSQL rows. Five accounts have resident role, five have volunteer role, and `demo-resident-5` has **both** roles (still 10 distinct accounts). Categories and preferred postal codes are also seeded. The script is repeatable: existing records are updated, and each run uses one PostgreSQL transaction.

## Setup

1. At the repository root, copy .env.example to .env. Set your own POSTGRES_PASSWORD and make sure the same password is used in DATABASE_URL. The database username, name, and host port must also match your Docker setup. When using the Firebase Auth Emulator, DEMO_PASSWORD is optional because the seed script uses a local default. For real Firebase, set DEMO_PASSWORD in your private .env file. Never commit .env.
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

## Troubleshooting PostgreSQL Password Errors

If the seed script fails with:

`password authentication failed for user "ecocollect"`

Check the following:

1. Open the repository-root `.env` file.
2. Make sure `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` match.
3. Check `docker-compose.yml` to confirm the PostgreSQL username, database name, and port.
4. Make sure `DATABASE_URL` uses the correct host port. For example, if `POSTGRES_PORT=5433`, the URL should use `localhost:5433`.
5. Run `docker compose ps` to confirm PostgreSQL is running.
6. If the passwords match in .env but authentication still fails,PostgreSQL may have been initialized with an older password. Check the existing database credentials before changing anything.

Example for a new local development setup (replace the sample password with your own):

```env
POSTGRES_USER=ecocollect
POSTGRES_PASSWORD=EcoCollectLocal123
POSTGRES_DB=ecocollect
POSTGRES_PORT=5433
DATABASE_URL=postgres://ecocollect:EcoCollectLocal123@localhost:5433/ecocollect
```

These are example values only. Each team member can use a different password.

Important: PostgreSQL stores its initial password when the Docker database volume is first created. If the database was initialized with a different password, changing `.env` alone will not update the existing PostgreSQL user password.

For an existing database, update the PostgreSQL user's password to match the configuration, or use the existing password in `DATABASE_URL`.

Do not run `docker compose down -v` to fix a password error, because it deletes database volumes and can cause data loss.

Never commit real passwords to GitHub.
