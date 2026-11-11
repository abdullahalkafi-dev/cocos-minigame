# Architecture overview

MiniGame Studio lets a **buyer** (a company that wants mini games in its own website or app) buy a game, customize it, and embed it. The buyer's own system decides who the players are. We run the game logic and keep the results.

## The parts

```
                 buyer's browser                    buyer's server                      player's phone / site
                      │                                  │                                      │
                      ▼                                  ▼                                      ▼
              ┌──────────────┐                  ┌────────────────┐                     ┌────────────────┐
              │  Dashboard   │                  │  POST /api/v1/ │  playUrl            │   Game client  │
              │  (Next.js)   │                  │  sessions      │ ─────────────────▶  │ (Cocos, in an  │
              └──────┬───────┘                  └───────┬────────┘                     │ iframe/WebView)│
                     │ /api/* (dashboard token)         │ API key                      └───────┬────────┘
                     ▼                                  ▼                                      │ /api/play/* (player token)
              ┌─────────────────────────────────────────────────────────────────────────────────▼──────┐
              │                         Server  (Express + TypeScript, feature modules)                 │
              └───────────────┬─────────────────────────────────────────────────┬──────────────────────┘
                              ▼                                                 ▼
                       MongoDB (Atlas)                                      Redis
                 users, games, players, ledger,                 cache, shared rate limits, locks
                 rounds, bets, results
```

| Part | Folder | Technology | Role |
|---|---|---|---|
| Server | `server/` | Node.js 24, Express 5, TypeScript, Mongoose | HTTP API, game rules, the shared round clock, money ledger, file hosting |
| Database | MongoDB (Atlas) | replica set, transactions | All state. Money movements run in transactions |
| Cache | Redis (Docker) | ioredis | Game record cache, shared rate limits, locks. Everything in it can be rebuilt |
| Dashboard | `dashboard/` | Next.js 15 static export, React 19, TypeScript | Buyer: store, asset studio with live preview, API key, players and results |
| Game client | `cocos/` | Cocos Creator 3.8, TypeScript, WebGL2 | The playable game. Renders what the server says |
| Embed SDK | `sdk/` | plain JavaScript | `minigames.js` for websites |
| Live push | `server/src/modules/lucky-wheel/` | WebSocket (`ws`) | The game receives the room state about once a second instead of asking for it ([realtime.md](realtime.md)) |
| Integration guide | `server/public/docs/` | static HTML | What a client's developer reads |
| AI bundles | `/llms.txt`, `/llms-full.txt`, `/openapi.json`, `docs/ai/` | generated text | What a client's AI assistant reads ([ai/README.md](../ai/README.md)) |

## Three kinds of caller, three kinds of credential

| Caller | Credential | Used for | Where it is checked |
|---|---|---|---|
| Buyer in the dashboard | Dashboard token (`t:'u'`, 7 days) | Buying, customizing, reading stats | `requireUser` middleware |
| Buyer's server | Account API key (`mgs_...` live or `mgs_test_...` for test games, hashed at rest) | Creating play sessions, wallet, rooms, leaderboards | `requireApiKey` middleware |
| Player's game | Session token (`t:'s'`, 15 minutes) then player token (`t:'p'`, 12 hours) | Playing | `requireSession` / `requirePlayer` middleware |

The API key never reaches a player: the buyer's server exchanges it for a short-lived play link.

## Life of a play session

1. The buyer's server calls `POST /api/v1/sessions` with the API key and a `gameId` (and optionally the player's name).
2. The server returns a `playUrl` with a 15-minute session token.
3. The buyer's page or app opens `playUrl` in an iframe or WebView. The Cocos game boots and calls `GET /api/play/bootstrap`, which returns the buyer's customized configuration (odds are removed) and the player.
4. The game opens a WebSocket (`/ws`) and the server pushes the state of its room about once a second (HTTP polling is the fallback). Bets go to `POST /api/play/wheel/bet`.
5. When a round's spin ends, the server settles it in batches: winnings are credited through the ledger (or sent to the client's own wallet in seamless mode) and one result row per player is written for the dashboard and the leaderboards. The client's server gets a signed `round.settled` webhook.

## Principles

- **The server is authoritative.** Clients only render. Outcomes are drawn with a cryptographic RNG when a round is created and are hidden until betting closes. The game never receives the odds.
- **One place for money.** Balances change only through the ledger service, inside a database transaction, and every change leaves an immutable entry.
- **Feature modules.** Each backend feature owns its routes, service, repository and model. See [`backend.md`](backend.md).
- **Everything customizable is data.** A game declares a manifest; the dashboard form, the server validation and the media rules are generated from it.
- **Static where possible.** The dashboard is a static export served by the API server, so the whole product is one container plus MongoDB and Redis.
