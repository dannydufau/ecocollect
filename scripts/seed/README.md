# Seed script

Creates the demo users in Firebase Auth (with a `roles` claim) and saves the matching rows in Postgres, all from one file (`data.js`). Because both sides read the same data, Firebase and the database cannot disagree. This replaces registration for the demo.

It creates:
- 5 residents and 5 volunteers (`demo-resident-1..5`, `demo-volunteer-1..5`)
- Resident 1 and Volunteer 1 share postal code `T2P1J9`; Resident 2 and Volunteer 2 share `T3A0B1`
- Volunteer preferred postal codes
- The item categories with standard weights

All demo users have the password in `data.js` (`PASSWORD`). Emails look like `riley@demo.ecocollect.test`.

## Before you run it

1. Docker Desktop is running and the database is healthy:

        docker compose up -d postgres
        docker compose ps

2. The Firebase service account key is saved as `secrets/firebase-admin.json` (Firebase console, Project settings, Service accounts, Generate new private key). The `secrets/` folder is git-ignored. Never commit or share this file.

3. Dependencies are installed (once):

        cd scripts/seed
        npm install

## Run it

    cd scripts/seed
    npm run seed

It is safe to run again and again. Existing users are updated, existing rows are replaced with the same data, and nothing is duplicated. At the end it checks that every Firebase user has exactly one profile row with the same uid and roles.

## Settings (optional)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgres://ecocollect:change_me@localhost:5432/ecocollect` | Postgres connection. The seed does not read `.env`, so if you changed `POSTGRES_PASSWORD`, export `DATABASE_URL` with your password first (see `db/README.md`). |
| `DEMO_PASSWORD` | `Demo1234!` | Password of every demo user. Demo only, delete the users after the course demo. |
| `GOOGLE_APPLICATION_CREDENTIALS` | `secrets/firebase-admin.json` | Firebase key file |
| `FIREBASE_AUTH_EMULATOR_HOST` | not set | If set (for example `127.0.0.1:9099`), the script uses the Firebase emulator instead of the real project |

## Change the demo data

Edit `data.js` (users, password, categories) and run `npm run seed` again. Keep `uid` values unchanged for existing users.

Note: removing a user from `data.js` does not delete them from Firebase or the database.

## Start from scratch

Reset the database (this deletes all its data), then seed again:

    docker compose down -v
    docker compose up -d postgres
    cd scripts/seed && npm run seed

## Troubleshooting

- `Seed failed: connect ECONNREFUSED`: the database is not running. Start Docker Desktop and run `docker compose up -d postgres`.
- `Seed failed: ... firebase-admin.json`: the key file is missing or in the wrong place.
- `email address is already in use`: another Firebase user already has that email. Delete that user in the Firebase console or change the email in `data.js`.
