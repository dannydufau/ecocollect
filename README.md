# EcoCollect

EcoCollect connects Calgary residents who have recyclable items with volunteers who pick them up and deliver them to a recycling facility. Residents post pickup requests with a few time windows. Volunteers browse open requests near their preferred postal codes, accept one, collect it and record the delivery. Both earn EcoPoints.

The system is a set of services run with Docker Compose: a Next.js frontend, a Caddy gateway, five backend services (User, Request, Notification, Reward, Cleanup), PostgreSQL and RabbitMQ.

The source code is on GitHub at <https://github.com/dannydufau/ecocollect>. A hosted copy runs at <https://ecocollect.duckdns.org> if you want to look at it without setting anything up. The steps below run your own copy on your machine.

## 1. What you need

| Tool | Version | Why |
|---|---|---|
| Docker Desktop (or Docker Engine with the Compose plugin) | Compose v2 | Builds and runs every service, the database and the broker |
| `psql` (PostgreSQL client) | 15 or newer | The User Service's database script runs it on your machine |
| Bash | any | The database scripts are Bash scripts. On Windows, use WSL 2 |

Check what you have with `docker compose version` and `psql --version`. If `psql` is missing or older than 15, install it:

- macOS: `brew install libpq`, then add it to your PATH: `echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc` and open a new terminal
- Ubuntu / WSL: `sudo apt install postgresql-client`

You don't need Node.js: everything is built inside Docker.

Ports 80, 443, 5432, 5672 and 15672 must be free on your machine. Stop a local PostgreSQL first if one is running.

## 2. Configuration

The submitted folder already contains the two files that hold the configuration and keys. They are not in the Git repository.

| File | What it holds |
|---|---|
| `.env` | Database and broker passwords, one database login per service, the Firebase web config, the ImageKit keys (photo uploads) and the Web Push keys. Every setting is described in [.env.example](./.env.example) |
| `secrets/firebase-admin.json` | The Firebase Admin key. Only the User Service gets it |

Check that both are there:

```bash
ls .env secrets/firebase-admin.json
```

Don't change `.env` for a local run. If you start from a clone of the [GitHub repository](https://github.com/dannydufau/ecocollect) instead, copy `.env.example` to `.env` and create your own Firebase project, ImageKit keys and Web Push keys as in steps 7 and 9 of [docs/deploy-oracle-vm.md](./docs/deploy-oracle-vm.md).

## 3. Run it

Run every command from the project folder (the one with this README).

1. Start the database and the message broker, and wait until both are healthy:

   ```bash
   docker compose up -d --wait postgres rabbitmq
   ```

2. Create the database objects and the service logins (section 4 explains what this does):

   ```bash
   backend/scripts/request/load-db.sh
   backend/scripts/reward/load-db.sh
   backend/scripts/notification/load-db.sh
   backend/scripts/cleanup/load-db.sh

   set -a; . ./.env; set +a
   bash backend/scripts/user/load-db.sh
   ```

   The `set -a` line loads `.env` into your shell, because the User script reads `DATABASE_URL` and `USER_DB_PASSWORD` from there.

3. Build and start everything. The first build takes a few minutes:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

   Every service should show `Up`, and all but `caddy`, `frontend` and `cleanup` also `(healthy)`.

4. Open <https://localhost>. Caddy makes its own HTTPS certificate, so the browser warns you the first time: accept it to continue. Push notifications need a trusted certificate. To trust Caddy's, copy it out with `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ~/caddy-root.crt` and add it to your system's trusted certificates.

To stop: `docker compose down`. Your data is kept. To start again later, run `docker compose up -d`. Steps 1 and 2 are only needed the first time.

To start over with an empty database: `docker compose down -v`, then steps 1 to 3 again.

## 4. The database

Every service uses one PostgreSQL 16 database, `ecocollect`. Each service has its own schema and its own login: it writes only its own tables and can read the others. Full details are in [db/README.md](./db/README.md).

| Schema | Owner | Main tables |
|---|---|---|
| `users` | User Service | `account`, `resident`, `volunteer`, `volunteer_preferred_postal_code`, `terms_document`, `terms_acceptance` |
| `requests` | Request Service | `item_category`, `pickup_request`, `pickup_window`, `status_change`, `assignment`, `photo`, `delivery`, `recycling_facility`, `facility_accepts` |
| `rewards` | Reward Service | `ecopoints_award`, `resident_award`, `volunteer_award` |
| `notifications` | Notification Service | `notification`, `request_notification`, `award_notification`, `push_subscription` |
| `cleanup` | Cleanup Service | `expiry_job`, `daily_run` |

### How it's created

1. **Tables.** The first time Postgres starts on an empty volume (step 1 above), it runs the SQL files in [db/init/](./db/init/) in filename order. They create the schemas and tables.
2. **Functions, procedures and logins.** The `load-db.sh` scripts (step 2 above) add the rest from `db/request/`, `db/reward/`, `db/notification/` and `db/init/`, and set each service's password from `.env`. They are safe to run again.

### How it's populated

- **Reference data** is added automatically with the tables: item categories, recycling facilities and which categories each accepts ([011_request_seed.sql](./db/init/011_request_seed.sql)), and the current terms document ([031_user_seed.sql](./db/init/031_user_seed.sql)).
- **Everything else** (accounts, requests, assignments, deliveries, EcoPoints and notifications) is created by using the app (section 5).
- **Sample data for SQL testing.** A separate test database with sample accounts, requests and awards can be built from the [ENSF 608 physical model](./docs/Final%20Submission/ENSF608/4.%20Physical%20model/README.md) instructions. Its sample accounts aren't in Firebase, so they can't sign in to the app.

### How to use it

Open a SQL prompt inside the database container:

```bash
docker compose exec postgres psql -U ecocollect -d ecocollect
```

```sql
\dn                                  -- list the schemas
\dt requests.*                       -- list one schema's tables
SELECT name, waste_type, standard_weight_kg FROM requests.item_category ORDER BY name;
SELECT account_id, public_name, created_at FROM users.account;
-- the current status of each request
SELECT DISTINCT ON (pickup_request_id) pickup_request_id, status, changed_at
FROM requests.status_change ORDER BY pickup_request_id, changed_at DESC;
\q                                   -- quit
```

The course queries and operations, with example runs, are in [ENSF 608 database operations and queries](./docs/Final%20Submission/ENSF608/5.%20Database%20operations%20and%20queries/README.md).

## 5. Using the app

The easiest way to see a full pickup is with two accounts: a resident in one browser window and a volunteer in a private window.

1. **Create a resident account.** On the login page select **Create an account**, choose the Resident role, fill in your details (18 or older) with a Calgary address such as postal code `T2N 1N4`, accept the terms, and sign in.
2. **Create a pickup request.** Select **New request**, choose a category and quantity, optionally add a photo, offer one or more pickup windows in the future, and submit. The request shows as **Open** under **My requests**.
3. **Create a volunteer account** in the private window, with the resident's postal code as one of the preferred postal codes (up to three).
4. **Accept the request.** The volunteer sees it under **Available**, opens it, picks one of the windows and accepts. It becomes **Assigned**, and the resident's page updates live.
5. **Confirm the collection.** As the resident, open the request and confirm it was collected. It becomes **Collected**.
6. **Record the delivery.** As the volunteer, open the request under **Assignments**, choose a facility that accepts the category, add a photo as evidence, and submit. It becomes **Delivered**, and both accounts earn EcoPoints (the resident gets half the volunteer's points).

Also try:

- **Notifications** (the bell): in-app updates for every step. For push notifications, go to **Profile**, select **Turn on device notifications** under Notifications, and allow them when the browser asks (this needs the trusted certificate from section 3, step 4).
- **EcoPoints** and **Community stats** (in the Account menu).
- **Profile**: edit your details and preferred postal codes, or select **Become a volunteer** / **Become a resident** to add the other role. An account with both roles picks its role per tab.
- Editing or cancelling an Open request, cancelling an assignment, and reporting a missed pickup after the selected window has passed.

## Services

| Service | What it is | Reach it at |
|---|---|---|
| `caddy` | The gateway, the only way in. Checks the login, routes `/api/*` and serves the frontend | <https://localhost> |
| `frontend` | The Next.js app | through Caddy |
| `user` | Accounts, profiles, terms, and the login check Caddy calls. The only service with the Firebase key | through Caddy |
| `request` | Pickup requests from creation to delivery, their photos (ImageKit) and their events | through Caddy |
| `notification` | Turns events into stored notifications, live updates and Web Push | through Caddy |
| `reward` | EcoPoints and public statistics | through Caddy |
| `cleanup` | Request expiry and the daily notification cleanup | no HTTP |
| `postgres` | The database | Not a web page: use `psql` as in section 4 (port `5432` on your machine) |
| `rabbitmq` | The message broker between the services | management UI <http://localhost:15672> (user and password from `.env`) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `required variable ... is missing a value` | `.env` is missing or incomplete. Check section 2 |
| `request` stays unhealthy, or requests fail | The database scripts haven't run. Run step 2 of section 3, then `docker compose up -d` |
| `User database setup requires psql 15 or newer` | Install `psql` as in section 1 |
| `port is already allocated` | Another program uses that port. Stop it (often a local PostgreSQL on 5432) |
| `user` keeps restarting with `EACCES` or `resource deadlock avoided` | The Firebase key can't be read. On macOS, move the folder out of iCloud Drive (Desktop or Documents with "Optimize Mac Storage" on) |
| Sign-in fails | Check that the browser can reach the internet: sign-in goes through Firebase |
| A service fails after a change | `docker compose logs <service> --tail 50` |

## More documentation

- [docs/Final Submission/](./docs/Final%20Submission/): the course deliverables (requirements, design, database models, software quality)
- [contracts/README.md](./contracts/README.md): every API, event and message between the components
- [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md): running and testing one part on its own
- [db/README.md](./db/README.md): the database files and how to change them
- [docs/deploy-oracle-vm.md](./docs/deploy-oracle-vm.md): deploying to a cloud VM with a public HTTPS address
