# Local development

## Requirements

- Node.js 24 or newer
- A MongoDB **replica set** (a free MongoDB Atlas cluster is enough; money movements use transactions)
- Redis (optional locally: without `REDIS_URL` an in-memory cache is used)
- Docker, if you want a local Redis: `docker run -d --name minigame-redis -p 127.0.0.1:6379:6379 redis:7-alpine`
- Cocos Creator 3.8.8 only if you change the game

## First run

```bash
npm install
cp .env.example .env        # then fill in MONGODB_URI (use a database name just for development) and REDIS_URL
npm run build               # dashboard + SDK
npm start                   # http://localhost:3000  (API + dashboard + games + docs)
```

Open http://localhost:3000, sign up (you get 10,000 demo credits and your API key), buy **Lucky Wheel 77**, press **Customize**.

Use a different database name per environment (`minigame_dev`, `minigame_studio`, ...) so development never touches production data.

## Everyday commands

| Command | What it does |
|---|---|
| `npm start` | Run the server (`tsx`, no build step) |
| `npm run dev -w server` | Run the server and restart on changes |
| `npm run dev -w dashboard` | Next dev server on :5173 (forwards API calls to :3000) |
| `npm run build -w dashboard` | Rebuild the dashboard into `server/public/app` (restart the server afterwards) |
| `npm run build:games` | Rebuild the game with Cocos Creator (about 1-2 min) |
| `npm run typecheck -w server` / `-w dashboard` | Type checks |
| `npx tsc --noEmit -p cocos` | Type check the game scripts without opening Creator |
| `npm test` | Server tests (see [testing](testing.md)) |
| `npm run seed` | Demo data: two differently customized games with players and settled rounds (takes about a minute; **never run it against production**) |

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `MONGODB_URI` | required | MongoDB connection string (replica set) |
| `REDIS_URL` | empty | Redis connection string. Empty = in-memory cache (single instance only) |
| `PORT` | `3000` | HTTP port |
| `PUBLIC_URL` | `http://localhost:$PORT` | Address clients reach this server on. It is used inside the play links |
| `DATA_DIR` | `server/data` | Signing secret and uploaded images. Relative paths are relative to the repository root |
| `SESSION_SECRET` | generated into `DATA_DIR/secret.key` | Token signing secret (set it explicitly when you run several instances) |
| `HOST_PORT` | `3000` | docker compose only: port published on 127.0.0.1 |

`.env` is read from the repository root and is git-ignored. Never commit it.

## Sample client website

A tiny site that embeds a game the right way (the API key stays on its server):

```bash
cd samples/client-website
MINIGAME_API_KEY=mgs_... MINIGAME_GAME_ID=lic_... MINIGAME_HOST=http://localhost:3000 node server.mjs    # http://localhost:4000
```
