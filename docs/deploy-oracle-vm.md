# Deploying EcoCollect to an Oracle Cloud VM

How to run the whole Compose stack on a free Oracle Cloud VM with a public HTTPS address. Tested on Ubuntu 26.04 (ARM). The same steps work for any copy of the app: the demo VM, a staging VM, and so on. Each copy needs its own Oracle, Firebase, ImageKit and DuckDNS setup.

What you end up with: `https://<name>.duckdns.org`, served by Caddy with a real Let's Encrypt certificate, and every service from `docker-compose.yml` running on one VM.

## What you need first

- An **Oracle Cloud** account, upgraded to **Pay As You Go** (see step 1)
- A **Firebase** project with **Email/Password** sign-in turned on (Authentication → Sign-in method)
- An **ImageKit** account
- A **DuckDNS** account (free, sign in with GitHub or Google)
- An SSH key pair on your laptop
- Read access to the GitHub repo

## 1. Oracle account

- Your **home region** is fixed at sign-up. Always Free resources only exist there.
- **Upgrade to Pay As You Go** (Billing → Upgrade). It stays free as long as you stay inside the Always Free limits. Without it, Oracle can reclaim a VM that's idle for 7 days (a demo app is idle most of the time), and "out of capacity" errors are more common.
- **Add a budget alert** (Billing → Budgets), for example $1, so you get an email if anything ever starts costing money.

## 2. Create the VM

Compute → Instances → Create instance:

| Setting | Value |
|---|---|
| Image | Canonical Ubuntu 26.04, **aarch64** build |
| Shape | Ampere `VM.Standard.A1.Flex`, **2 OCPU, 12 GB** (marked "Always Free-eligible") |
| Networking | New VCN with a **public subnet**, assign a public IPv4 address |
| SSH key | Upload your public key (or download the generated private key) |
| Boot volume | Default size is fine (50–100 GB). Keep the default performance setting. |
| In-transit encryption | Leave it on (free) |

Notes:
- The cost estimate on this page shows the boot volume at list price (about $2–3/month). That's expected, and it's covered by the 200 GB Always Free storage.
- **"Out of host capacity"**: try another availability domain, a smaller shape, or try again later.

### If the VM has no public IP

Instance → Networking → Attached VNICs → click the VNIC → IP administration → `⋯` on the private IP → Edit → **Ephemeral public IP**.

If that option is greyed out, the subnet is private. The subnet must be public, and its route table needs a rule `0.0.0.0/0 → Internet Gateway`.

## 3. Open ports 80 and 443

There are **two firewalls**, and both must allow the traffic.

### a) Oracle security list (in the web console)

Networking → your VCN → Security Lists → Default → **Add Ingress Rules**, one for each port:

| Source CIDR | Protocol | Source port | Destination port |
|---|---|---|---|
| 0.0.0.0/0 | TCP | *(empty, means All)* | **80** |
| 0.0.0.0/0 | TCP | *(empty, means All)* | **443** |

The port goes in **Destination** port range. Source port must stay empty. Port 22 is already open by default.

Don't open 5432 (Postgres) or 15672 (RabbitMQ). Compose keeps them on the VM's localhost.

### b) iptables inside the VM (step 5, after you SSH in)

## 4. SSH in

On your laptop:

```bash
mv ~/Downloads/ssh-key-*.key ~/.ssh/ecocollect-oracle.key   # if Oracle generated the key
chmod 600 ~/.ssh/ecocollect-oracle.key
```

Add to `~/.ssh/config`:

```
Host ecocollect
    HostName <public-ip>
    User ubuntu
    IdentityFile ~/.ssh/ecocollect-oracle.key
```

Then `ssh ecocollect`.

**VS Code:** install the **Remote - SSH** extension, press `Cmd+Shift+P` → *Remote-SSH: Connect to Host* → `ecocollect`, then open `/home/ubuntu/ecocollect`. You can drag files from your laptop into its Explorer panel, and forward port 15672 in the Ports tab to see the RabbitMQ UI.

## 5. Prepare the VM

The Oracle Ubuntu image is minimal, so install the basics first:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates iptables-persistent postgresql-client
```

`postgresql-client` is needed by the User Service's database script, which runs `psql` on the VM itself.

### iptables

```bash
sudo iptables -L INPUT -n --line-numbers
```

Find the line number of the `REJECT` rule (usually 6) and insert the new rules **above** it:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Log out and back in, then check with `docker run --rm hello-world`.

## 6. Domain (DuckDNS)

Create a subdomain on duckdns.org (for example `ecocollect-staging`) and set it to the VM's public IP. Check it from the VM:

```bash
getent hosts <name>.duckdns.org
```

## 7. Firebase and ImageKit

**Firebase** (your own project):
- Authentication → Sign-in method → turn on **Email/Password**.
- Authentication → Settings → **Authorized domains** → add `<name>.duckdns.org`. Without this, sign-in fails on the site.
- Project settings → General → Your apps → add a **Web app**. Its config goes into the `NEXT_PUBLIC_FIREBASE_*` values.
- Project settings → Service accounts → **Generate new private key**. This file becomes `secrets/firebase-admin.json`.

**ImageKit:** Developer options → API keys, for the `IMAGEKIT_*` values.

## 8. Get the code

For a private repo, give the VM a read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -C "ecocollect-vm" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub     # add on GitHub: repo → Settings → Deploy keys (no write access)
cat >> ~/.ssh/config <<'EOF'
Host github.com
    IdentityFile ~/.ssh/github_deploy
EOF
git clone git@github.com:<org>/<repo>.git ~/ecocollect
cd ~/ecocollect
git checkout <branch>     # the branch this VM should run
```

## 9. `.env` and the Firebase key

Copy `.env.example` to `.env` on the VM and fill it in:

```bash
cp .env.example .env
nano .env
```

| Setting | Value |
|---|---|
| Every `*_PASSWORD` | A new random value: run `openssl rand -hex 24` once for each. Put the **same** value inside the matching URL: `POSTGRES_PASSWORD` → `DATABASE_URL`, `USER_DB_PASSWORD` → `USER_DATABASE_URL`, and so on, `RABBITMQ_PASSWORD` → `RABBITMQ_URL`. |
| `NEXT_PUBLIC_FIREBASE_*` | **All six** from your web app config, including `AUTH_DOMAIN` and `PROJECT_ID`. Compose falls back to the main team project's values if these two are missing. |
| `IMAGEKIT_*` | Your ImageKit keys and URL endpoint |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | One key pair for push notifications: `docker run --rm node:22.18-alpine npx --yes web-push generate-vapid-keys`. Keep it: new keys break every browser's push subscription. Compose won't run without them. |
| `VAPID_SUBJECT` | `mailto:` followed by your email address |
| `NEXT_PUBLIC_VAPID_KEY` | The **same** value as `VAPID_PUBLIC_KEY` |
| `SITE_ADDRESS` | `<name>.duckdns.org` |
| `COMPOSE_FILE` | Uncomment it: `docker-compose.yml:docker-compose.prod.yml` |

Set the passwords **before** the first `docker compose up`. Postgres only reads `POSTGRES_PASSWORD` when it creates its database the first time.

`COMPOSE_FILE` makes a plain `docker compose ...` use the production override too. That override opens 80 and 443 to the internet and tells Caddy the domain. Add it on the VM only, never on a laptop.

Put the Firebase key at `secrets/firebase-admin.json` (drag it in with VS Code, or `scp` it), then set permissions:

```bash
chmod 600 .env
chmod 644 secrets/firebase-admin.json
```

The key must be `644`, not `600`. The User Service container runs as uid 1000, while `ubuntu` on this image is uid 1001. With `600` the service can't read the key and keeps restarting (`EACCES: permission denied`). The home folder (`750`) still keeps other users out.

## 10. First start

Check the setup first:

```bash
docker compose config caddy | awk '/^  caddy:/{f=1;next} /^  [a-z]/{f=0} f' | grep -A9 ports
```

Caddy should list only ports 80 and 443, with no `host_ip: 127.0.0.1`.

Start the database and broker, then load each service's database objects:

```bash
docker compose up -d postgres rabbitmq
docker compose ps                     # wait for both to show (healthy)

backend/scripts/request/load-db.sh
backend/scripts/reward/load-db.sh
backend/scripts/notification/load-db.sh
backend/scripts/cleanup/load-db.sh

set -a; . ./.env; set +a              # the User script reads DATABASE_URL and USER_DB_PASSWORD from the shell
bash backend/scripts/user/load-db.sh
```

Build and start everything:

```bash
docker compose up -d --build          # first build takes a few minutes
docker compose ps
docker compose logs caddy | grep -i certificate   # "certificate obtained successfully"
```

Open `https://<name>.duckdns.org`.

## Updating after a merge

```bash
cd ~/ecocollect
git pull
docker compose up -d --build
```

If the pull added settings to `.env.example`, add them to `.env` before running any `docker compose` command. If it brought new files in `db/`, rerun the matching `load-db.sh` scripts before `up`. They are safe to run again.

**First update that includes the Notification Service:** add `NOTIFICATION_DB_PASSWORD`, `NOTIFICATION_DATABASE_URL`, the three `VAPID_*` values and `NEXT_PUBLIC_VAPID_KEY` to `.env` (step 9), then run `backend/scripts/notification/load-db.sh` before `up`. The loader creates the Reward tables it needs if they are missing.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `dependency failed to start: container ecocollect-user-1 is unhealthy` | Caddy waits for the User Service. Check `docker compose logs user --tail 50`. |
| User log: `EACCES ... /run/secrets/firebase-admin.json` | `chmod 644 secrets/firebase-admin.json` |
| User log: `password authentication failed for user "ecocollect_user"` | Rerun the User load-db step. Check that `USER_DB_PASSWORD` matches the password in `USER_DATABASE_URL`. |
| `up -d` still fails instantly after a fix (`0.0s`) | The container is still marked unhealthy from before: `docker compose up -d --force-recreate user`, then `docker compose up -d`. |
| Caddy can't get a certificate (timeouts) | Port 80 or 443 is blocked: check the security list (Destination port, not Source) and iptables. Check that DuckDNS points at the current IP. |
| Site loads but sign-in fails (`auth/unauthorized-domain`) | Add the domain to Firebase Authorized domains. |
| Caddy only listens on 127.0.0.1 | `COMPOSE_FILE` is missing from `.env`, or you ran `docker compose` from another folder. |
| `git`, `curl` or `netfilter-persistent` not found | Minimal image: install them as in step 5. |
| Disk filling up after many rebuilds | `docker image prune` |

## Useful commands

```bash
docker compose ps                        # status of every service
docker compose logs <service> --tail 50  # recent log lines
docker compose logs <service> -f         # follow the log (Ctrl+C to stop)
docker compose restart <service>
docker compose down                      # stop everything; data is kept
```

Never run `docker compose down -v` on a VM whose data you want to keep: `-v` deletes the database volume.