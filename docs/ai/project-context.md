# Project context (a compact briefing for an AI assistant)

Paste this as the first message when you ask an assistant to work on this repository, then add `AGENTS.md`.

## What it does
A platform that sells customizable mini games. A buyer buys a game in the dashboard, customizes it (images, video, sounds, texts, odds), and embeds it
in its own site/app. The buyer's server creates play sessions with an API key and names the player; the player plays a Cocos Creator (WebGL) game in an
iframe/WebView. We run the rules and the shared round clock, keep results and (optionally) coins, and notify the buyer with webhooks.

## Runtime shape
- One Node.js process (`server/src/server.ts`): Express API + static files (dashboard export, game builds, docs, uploads) + WebSocket (`/ws`) + background workers
  (round settlement, webhooks, seamless-wallet retries).
- MongoDB (replica set; transactions are required) and Redis (cache, shared rate limits, locks, presence). Without `REDIS_URL` an in-memory cache is used.
- Three credentials: dashboard token (buyer in the browser), API key (buyer's server), player/session token (the running game).

## The core flows
1. **Session:** `POST /api/v1/sessions {gameId, playerId, displayName?, room?}` → upserts the player, assigns a room, returns `playUrl`.
2. **Play:** the game calls `GET /api/play/bootstrap` (config for the room), opens a WebSocket (`/ws`, first message `{t:'auth', token}`), receives `{t:'state'}`
   about once a second, and bets with `POST /api/play/wheel/bet`. If the socket fails it polls `GET /api/play/wheel/state`.
3. **Bet:** one MongoDB transaction: check the room limit, debit through the ledger (managed/demo) or ask the buyer's wallet first (seamless), insert the bet.
4. **Round end:** `settleRound` leases the round, pays winners in batches of 100 (each batch one transaction, idempotent by `win:<round>:<player>` reference),
   writes result rows, queues the `round.settled` webhook with a fixed id, marks the round settled, tells the hub.
5. **Wallet APIs:** managed `credit/debit` (idempotent by `reference`), seamless requests to the buyer's endpoint (stored operations retried until acknowledged).

## Invariants (never break)
- A player's balance equals the sum of their ledger deltas (demo/managed). Money changes only via `ledger.post` inside a transaction.
- A round is paid exactly once (lease + unique payment references).
- The outcome of a round is never sent before betting closes; the odds are never sent to the client.
- A client-facing error always carries a stable `code`.
- The public contract (`/openapi.json`) matches the routes (tested).

## Where to look
`server/src/container.ts` (wiring) · `server/src/modules/<feature>/` (code) · `server/src/test/` (behavior as tests) · `docs/architecture/` (why).
