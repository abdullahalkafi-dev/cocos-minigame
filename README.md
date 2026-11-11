# MiniGame Studio

A reusable platform for selling customizable mini games:

- **Lucky Wheel 77**: a live betting-wheel game built with Cocos Creator 3.8, where every visual (image, SVG, video, sound), rule, odd, chip and text is a dynamic setting
- **Buyer dashboard** (Next.js): sign up, buy games with demo credits, customize them in an asset studio with live preview, see players and results
- **One API key per account + a game ID per game**: a buyer's server creates short-lived play links for any game they own; the game runs in any website or mobile app
- **Embed SDK** for websites; WebView instructions for Flutter / Android / iOS

**Stack:** Node.js 24 · Express 5 · TypeScript · MongoDB (Mongoose) · Redis · Next.js 15 · Cocos Creator 3.8

> Documentation index: [`docs/`](docs/README.md). Client-facing integration guide (also served at `/docs/`): [`server/public/docs/index.html`](server/public/docs/index.html).

## The idea in one picture

```
 Buyer (your client's customer)                     This system                                    Player
 ─────────────────────────────                     ───────────                                    ──────
 1. signs up, buys a game with demo credits ─────▶  dashboard + wallet + store
 2. gets ONE secret API key for the whole account (shown at sign-up, rotatable); each game has a game ID
 3. customizes images / prizes / currency  ─────▶  stored per game
 4. buyer's backend: POST /api/v1/sessions ─────▶  returns a 15-minute playUrl
       (Authorization: Bearer <API key>, body { gameId })
 5. buyer's site/app opens playUrl in iframe/WebView ───────────────────────────────────────────▶  plays
                                                    every round is decided + saved on the server
 6. buyer opens "Players & results" ◀────────────   players, rounds, wins, payout rate, CSV export
```

The API key never reaches a player; one key serves every game the account owns.

## Repository layout

| Folder | What |
|---|---|
| `server/` | Backend: Express + TypeScript feature modules ([architecture](docs/architecture/backend.md)); also serves `public/games` (game build), `public/defaults` (default artwork), `public/app` (dashboard build), `public/sdk`, `public/docs` |
| `dashboard/` | Buyer dashboard: Next.js static export, organized by feature ([architecture](docs/architecture/dashboard.md)) |
| `cocos/` | The Cocos Creator project: `scripts/core` (reusable game library) and `scripts/games/<game>/` ([architecture](docs/architecture/game-client.md)) |
| `sdk/` | Web embed script `minigames.js` |
| `samples/client-website` | A sample "client website" that embeds a game the right way |
| `scripts/` | Build, seed and end-to-end test scripts |
| `docs/` | Architecture, guides, game docs, operations, roadmap |

## Run it locally

Requirements: Node.js 24+, a MongoDB replica set (a free Atlas cluster works), optionally Redis. Full guide: [`docs/guides/local-development.md`](docs/guides/local-development.md).

```bash
npm install
cp .env.example .env     # set MONGODB_URI (and REDIS_URL if you run Redis)
npm run build            # dashboard + SDK
npm start                # http://localhost:3000   (API + dashboard + games + docs)
```

Open http://localhost:3000, create an account (10,000 demo credits), buy a game, press **Customize**.

## Tests

```bash
npm test                 # 8 server tests against an in-memory MongoDB replica set
```

Headless-browser end-to-end scripts (`scripts/e2e-*.mjs`) are described in [`docs/guides/testing.md`](docs/guides/testing.md).

## Learn more

- How it is built: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- Add a game: [`docs/guides/adding-a-game.md`](docs/guides/adding-a-game.md)
- What a game contains (present it to a client): [`docs/games/lucky-wheel.md`](docs/games/lucky-wheel.md)
- Deploy and operate: [`docs/operations/deployment.md`](docs/operations/deployment.md)
- What is planned next: [`docs/roadmap.md`](docs/roadmap.md)

## Known limits (by design, for now)

- Wallet currency is demo credits; there is no payment provider. Connecting a client's own coin economy is the first item on the [roadmap](docs/roadmap.md).
- Wheel art must have the same number of wedges as the wheel layout in the rules.
- Players poll the round state once a second: fine for hundreds of concurrent players; thousands need push updates (roadmap).
