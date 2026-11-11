# Deploying

The whole product is **one Node.js process** (API + dashboard + game builds + docs + uploads) with a **SQLite file** and an **uploads folder** in one data directory. Nothing else is required.

## What you need on the server

- Node.js 24 or newer (for `node:sqlite`), **or** Docker
- A persistent folder for data (`DATA_DIR`)
- A public https address (reverse proxy such as nginx / Caddy) → set `PUBLIC_URL` to it

## Option A: Docker (recommended)

```bash
git clone <repo> && cd <repo>
PUBLIC_URL=https://games.example.com docker compose up -d --build
```

Data lives in the `minigames-data` volume (`/data` in the container). Back up that volume.

## Option B: plain Node on a VM

```bash
npm ci
npm run build                                # dashboard + sdk (game builds are already in server/public/games)
export PUBLIC_URL=https://games.example.com
export DATA_DIR=/var/lib/minigames
export PORT=3000
node --import tsx server/src/index.ts        # run under systemd / pm2
```

Example systemd unit:

```ini
[Unit]
Description=MiniGame Studio
After=network.target

[Service]
WorkingDirectory=/opt/minigames
Environment=PUBLIC_URL=https://games.example.com DATA_DIR=/var/lib/minigames PORT=3000 NODE_ENV=production
ExecStart=/usr/bin/node --import tsx server/src/index.ts
Restart=always
User=minigames

[Install]
WantedBy=multi-user.target
```

## Reverse proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name games.example.com;
  # ssl_certificate ... (Let's Encrypt)
  client_max_body_size 3m;                     # image uploads are limited to 2 MB
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

The server trusts `X-Forwarded-*` headers (needed for correct rate limiting behind a proxy).

## After deploying: smoke test

```bash
curl https://games.example.com/api/health          # {"ok":true,...}
# (do not run the seed script on production; it creates a demo account)
```

Open the printed play link in a phone browser, and the dashboard at the root URL.

## What to hand to a client

1. The production URL (the dashboard) and the integration guide at `<URL>/docs/`.
2. They sign up (the API key is shown once), buy a game, copy its game ID, create sessions from their backend with the key and the game ID, and embed `playUrl` in their site/app.

## Updating

- Dashboard/server code: pull, `npm run build`, restart.
- Games: `npm run build:games` on a machine with Cocos Creator, commit `server/public/games`, redeploy.
- The database schema is created automatically on first start.

## This deployment (minigame.joura.info)

| Item | Value |
|---|---|
| Server | Ubuntu VPS `72.60.26.180` (shared with other projects, nothing else was touched) |
| Code | `/opt/minigame-studio` (git clone of this repo, branch `main`) |
| Runtime | One Docker Compose project `minigame-studio`, container published on `127.0.0.1:3057` only |
| Data | Docker volume `minigame-studio_minigames-data` mounted at `/data` (database, signing secret, uploads) |
| Config | `/opt/minigame-studio/.env` (`PUBLIC_URL`, `HOST_PORT`), not in git |
| Reverse proxy | nginx site file `/etc/nginx/sites-enabled/minigame.joura.info` with its own Let's Encrypt certificate (auto-renewed by certbot) |

**Update to the latest code**

```bash
ssh root@72.60.26.180
cd /opt/minigame-studio && git pull && docker compose up -d --build
```

**Logs / restart / status**

```bash
docker logs -f minigame-studio-minigames-1
docker compose -f /opt/minigame-studio/docker-compose.yml restart
docker compose -f /opt/minigame-studio/docker-compose.yml ps
```

**Back up the data**

```bash
docker run --rm -v minigame-studio_minigames-data:/data -v $PWD:/backup alpine tar czf /backup/minigames-data.tgz -C /data .
```

Do not run `npm run seed` against production: it creates a demo account. Real buyers just sign up in the dashboard.
