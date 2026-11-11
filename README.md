# MiniGame Studio

A demo product for selling reusable, customizable mini games:

- **Lucky Wheel 77**: a live betting-wheel game built with Cocos Creator 3.8, where every visual (image, SVG, video, sound), rule, odd, chip and text is a dynamic setting
- **Buyer dashboard**: sign up, buy games with demo credits, customize them in an asset studio with live preview, see players and results
- **One API key per account + a game ID per game**: a buyer's server creates short-lived play links for any game they own; the game runs in any website or mobile app
- **Embed SDK** for websites; WebView instructions for Flutter / Android / iOS

> What each game uses, in plain language and in technical detail: [`docs/GAMES.md`](docs/GAMES.md).
> Integration guide for buyers (also served at `/docs/`): [`server/public/docs/index.html`](server/public/docs/index.html).
> Deploying: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## The idea in one picture

```
 Buyer (your client's customer)                     Your server (this repo)                        Player
 ─────────────────────────────                     ───────────────────────                        ──────
 1. signs up, buys a game with demo credits ─────▶  dashboard + wallet + store
 2. gets ONE secret API key for the whole account (shown at sign-up, rotatable); each game has a game ID
 3. customizes images / prizes / currency  ─────▶  stored as JSON per license
 4. buyer's backend: POST /api/v1/sessions ─────▶  returns a 15-minute playUrl
       (Authorization: Bearer <API key>, body { gameId })
 5. buyer's site/app opens playUrl in iframe/WebView ───────────────────────────────────────────▶  picks a username, plays
                                                    game build loads *that buyer's* config
                                                    every round is decided + saved on the server
 6. buyer opens "Players & Results" ◀────────────   players, rounds, wins, payout rate, CSV export
```

The API key never reaches a player. They only ever see the temporary session link. One key serves every game the account owns, so a client with 20 games manages one secret.

## Repository layout

| Folder | What |
|---|---|
| `cocos/` | The Cocos Creator project. `assets/scripts/core` is the reusable game library (dynamic media loader, sound, particles, UI kit, API client); `assets/scripts/games` holds the game |
| `server/` | Backend (Fastify + SQLite) and everything it serves: `public/games` (game build), `public/defaults` (default artwork), `public/app` (dashboard build), `public/sdk`, `public/docs` |
| `dashboard/` | Buyer dashboard (React + Vite) |
| `sdk/` | Web embed script `minigames.js` |
| `samples/client-website` | A sample "client website" that embeds a game the right way (key stays on its server) |
| `scripts/` | Build, seed and end-to-end test scripts |
| `docs/` | Technical docs |

## Run it locally

Requirements: Node.js 24+, and (only to rebuild the games) Cocos Creator 3.8.8.

```bash
npm install
npm run build          # dashboard + SDK
npm start              # http://localhost:3000   (API + dashboard + games + docs)
```

Open http://localhost:3000, create an account (you get 10,000 demo credits), buy a game, press **Customize**.

Quick demo data (two differently customized copies of Lucky Wheel 77, with players and settled rounds):

```bash
npm run seed           # prints the buyer login, the account API key and the game IDs / play links (takes about a minute: it plays real rounds)
```

Try the sample client website with one of those keys:

```bash
cd samples/client-website
MINIGAME_API_KEY=mgs_... MINIGAME_GAME_ID=lic_... MINIGAME_HOST=http://localhost:3000 node server.mjs    # http://localhost:4000
```

### Rebuilding the games (Cocos Creator)

The built games are already committed in `server/public/games/`. After changing anything in `cocos/`:

```bash
npm run build:games    # runs Cocos Creator headlessly (~1-2 min), post-processes, copies to server/public/games
```

Set `COCOS_CREATOR_DIR` if Creator is not at `C:\ProgramData\cocos\editors\Creator\3.8.8`. You can also open the `cocos/` folder in the Cocos Creator editor.

### Tests

```bash
npm test                                       # server: round flow + payout math, odds simulation, isolation, validation, uploads
node scripts/e2e-wheel.mjs   <host> <apiKey> <gameId>      # headless-browser play-through of every phase, screenshots in tmp/
node scripts/e2e-popups.mjs  <host> <apiKey> <gameId>      # every popup
node scripts/e2e-media.mjs   <host> <email> <password> <gameId> <apiKey>   # video / SVG / sprite sheet / audio end to end
node scripts/e2e-full.mjs    <host>            # signup -> buy x2 -> customize -> two client sites -> live round -> dashboard
node scripts/e2e-dashboard.mjs <host> <email> <password> <licenseId>      # screenshots of every dashboard screen
```

## Adding a new game

1. **Cocos**: add `cocos/assets/scripts/games/MyGame.ts` (extend `Game`; use `ctx.stage`, `ctx.cfg`, `ctx.api`, `ctx.hud`, `ctx.fx` and `spawnMedia()` for every asset) and register its slug in `games/index.ts`.
2. **Server**: add an entry to `server/src/catalog.ts` (slug, price, defaults, and a **manifest** listing the editable fields; asset fields declare their kind) and, if the game needs server-side logic, a module like `server/src/wheel.ts` plus routes in `app.ts`.
3. `npm run build:games`. The dashboard form for the new game appears automatically from the manifest.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `PUBLIC_URL` | `http://localhost:$PORT` | Address clients reach this server on. It is used inside the play links |
| `DATA_DIR` | `server/data` | SQLite database, signing secret and uploaded images (keep on a persistent volume) |
| `SESSION_SECRET` | generated into `DATA_DIR/secret.key` | Token signing secret (set it explicitly if you run several instances) |

## Known limits of this demo (by design)

- Wallet currency is demo credits; there is no payment provider.
- Wheel art must have the same number of wedges as the wheel layout in the rules.
- SQLite is perfect for a demo and small deployments; use Postgres if you expect heavy concurrent load.
