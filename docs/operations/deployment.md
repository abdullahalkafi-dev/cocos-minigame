# Deploying

The product is **one Node.js container** (API + dashboard + game builds + docs + uploads) plus **MongoDB** and **Redis**.

| Piece | Where | Notes |
|---|---|---|
| App | Docker container built from this repo | Serves everything on one port |
| MongoDB | MongoDB Atlas (managed replica set) | Needs transactions. Use a separate database per environment |
| Redis | Docker container in the same compose project | Not published to the host; only the app can reach it. Holds nothing precious |
| Files | Docker volume `/data` | Signing secret (`secret.key`) and uploaded images |
| HTTPS | A reverse proxy (nginx, Caddy) in front | Sets `X-Forwarded-*`; the app trusts one proxy |

## Configuration

Copy `.env.example` to `.env` next to `docker-compose.yml` (never commit it):

```bash
PUBLIC_URL=https://games.example.com
HOST_PORT=3057                       # published on 127.0.0.1 only
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/minigame_studio?retryWrites=true&w=majority
```

`REDIS_URL` is set by `docker-compose.yml` to the internal Redis service.

**Atlas network access:** add the server's public IP address to the Atlas **Network Access** list, or the app cannot connect. Create a database user with read/write on the one database.

## Option A: Docker Compose (recommended)

```bash
git clone <repo> && cd <repo>
cp .env.example .env && nano .env
docker compose up -d --build
```

## Option B: plain Node

```bash
npm ci
npm run build                                # dashboard + sdk (game builds are committed in server/public/games)
node --import tsx server/src/server.ts       # run under systemd / pm2, with the same variables in the environment
```

## Reverse proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name games.example.com;
  # ssl_certificate ... (Let's Encrypt)
  client_max_body_size 13m;                    # uploads are limited to 12 MB (videos up to 10 MB)
  location / {
    proxy_pass http://127.0.0.1:3057;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Smoke test

```bash
curl https://games.example.com/api/health      # {"ok":true,"cache":"redis",...}
```

`"cache":"redis"` confirms Redis is connected. Never run `npm run seed` against production.

## Updating

```bash
cd /opt/minigame-studio && git pull && docker compose up -d --build
```

- Server or dashboard changes: this is all that is needed (the dashboard is built inside the image).
- Game changes: run `npm run build:games` on a machine with Cocos Creator, commit `server/public/games`, then deploy as above.
- MongoDB creates collections and indexes on first start; there is no migration step for schema changes that only add fields.

## Backups

- **Database:** use Atlas backups (or `mongodump` with the connection string).
- **Files:** `docker run --rm -v minigame-studio_minigames-data:/data -v $PWD:/backup alpine tar czf /backup/minigames-data.tgz -C /data .`

## Moving data from the old SQLite version

Older deployments kept everything in a SQLite file (`/data/app.db`). To move it into MongoDB:

```bash
# 1. back up first
docker run --rm -v minigame-studio_minigames-data:/data -v $PWD:/backup alpine cp /data/app.db /backup/app.db.bak
# 2. run the migration inside the new container (it refuses to run if the target database already has users)
docker compose run --rm minigames node --import tsx server/src/scripts/migrate-from-sqlite.ts /data/app.db
```

Moved: buyers, their demo wallet history, games (with customizations), players with balances (each gets one ledger entry so the balance stays explained) and round results. Not moved: a round that was running at that moment. Uploaded images stay in the volume and keep working.

## This deployment (minigame.joura.info)

| Item | Value |
|---|---|
| Server | Ubuntu VPS `72.60.26.180`, shared with other projects (nothing else is touched) |
| Code | `/opt/minigame-studio` (git clone, branch `main`) |
| Runtime | Docker Compose project `minigame-studio`: `minigames` (published on `127.0.0.1:3057`) and `redis` (internal) |
| Database | MongoDB Atlas, database `minigame_studio` |
| Files | Docker volume `minigame-studio_minigames-data` at `/data` |
| Config | `/opt/minigame-studio/.env` (`PUBLIC_URL`, `HOST_PORT`, `MONGODB_URI`), not in git |
| Proxy | nginx site `/etc/nginx/sites-enabled/minigame.joura.info`, Let's Encrypt certificate renewed by certbot |

```bash
docker logs -f minigame-studio-minigames-1
docker compose -f /opt/minigame-studio/docker-compose.yml ps
docker compose -f /opt/minigame-studio/docker-compose.yml restart
```
