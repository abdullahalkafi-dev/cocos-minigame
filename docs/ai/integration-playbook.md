# Integration playbook (for AI assistants helping a client integrate)

You are helping a developer put the **MiniGame Studio** game into *their own* website or app. Read this whole file before writing code.
Everything here is exact. If something is not written here, do not invent it: ask the developer, or read `/openapi.json`.

## 1. The model in five sentences

1. The developer's **own system** logs their users in and owns the user accounts. We never see passwords and never check logins.
2. Their **backend** (never the browser or the mobile app) calls our API with a **secret API key** to create a **play session** for one player and gets a short-lived `playUrl` (valid 15 minutes).
3. Their front-end shows the `playUrl` in an **iframe** (web) or a **WebView** (Flutter, Android, iOS). The player lands straight in the game.
4. **Coins** are handled in one of three ways (chosen per game in the dashboard): *demo* (we give a starting balance), *managed* (their server calls `credit`/`debit`), *seamless* (the coins stay in their database; we call an endpoint they implement).
5. We tell their server what happened with **signed webhooks** (for example after each round).

## 2. Facts you can rely on

- Base URL: the host serving this document (for example `https://minigame.joura.info`). Send `Authorization: Bearer <API key>` to every `/api/v1/*` call. Bodies are JSON.
- Keys: live key `mgs_...`, test key `mgs_test_...`. A **test game** only answers to the test key; a live game only to the live key (`403 wrong_environment` otherwise).
- A game has a **game ID** `lic_...` (not secret). One API key works for all the account's games.
- A **player id** is the developer's own id for a person: 1-64 characters from `A-Z a-z 0-9 _ . : @ -`. The same person must always get the same id. Never use a password or a secret as a player id.
- Amounts are **whole numbers** from 1 to 1,000,000,000,000.
- Every error is `{ "error": "<message>", "code": "<machine_code>" }`. Branch on `code`, show `error` to humans.
- Rate limits: 300 session creations/min, 600 wallet calls/min, 300 room/leaderboard/history reads/min per key. `429 rate_limited` with a `Retry-After` header (seconds) when exceeded. An address that sends 120 wrong keys or tokens in a minute is blocked for the rest of the minute.
- `POST /api/v1/sessions` accepts `startingBalance` (managed games only): coins for a player that call creates; the answer has `playerCreated`.

## 3. Decide before coding (ask the developer if unclear)

| Question | If yes |
|---|---|
| Do they sell or hold coins in their own system? | Use **managed** (simple) or **seamless** (coins must stay in their database) wallet. Otherwise **demo** |
| Must the coins stay in the developer's own database, with us never holding the balance? | **Seamless** wallet |
| Do they want several tables / VIP rooms / one huge event? | Use **rooms** (`room` in the session request) |
| Do they want to show a ranking in their app? | Use the **leaderboard** endpoint |
| Do they want to react to results on their server? | Implement a **webhook** receiver |

## 4. Steps (do them in this order)

### Step 1 — backend endpoint that creates a session

The developer's endpoint (for example `POST /game-session`) must:
1. Check that the caller is logged in **to the developer's own system**. If not, answer 401. (This is the whole security model: we trust the player id because only their server can send it.)
2. Call `POST /api/v1/sessions` with `{ "gameId": "lic_...", "playerId": "<their user id>", "displayName": "<name>", "room": "auto" }`.
3. Return our JSON answer (or just `playUrl`) to their front-end.

```http
POST /api/v1/sessions
Authorization: Bearer mgs_...
Content-Type: application/json

{ "gameId": "lic_AbC123xYz", "playerId": "user-8841", "displayName": "Maria", "room": "auto" }
→ 200 { "playUrl": "https://.../g/lucky-wheel/?session=...", "sessionToken": "...", "expiresIn": 900,
        "gameId": "lic_AbC123xYz", "game": "lucky-wheel", "playerId": "user-8841", "room": "main" }
```

Node/Express skeleton (adapt to the developer's language):

```js
app.post('/game-session', requireLogin, async (req, res) => {
  const r = await fetch(`${process.env.MINIGAME_HOST}/api/v1/sessions`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MINIGAME_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: process.env.MINIGAME_GAME_ID, playerId: String(req.user.id), displayName: req.user.name }),
  });
  res.status(r.status).json(await r.json());
});
```

**Never** put the API key in front-end code, a mobile app, a repository or a log. Environment variable only.

### Step 2 — show the game

- Web: `<iframe src="PLAY_URL" width="480" height="760" style="border:0" allow="autoplay; fullscreen">` or the SDK `<script src="{HOST}/sdk/minigames.js">` with `MiniGames.mount('#game', { sessionEndpoint: '/game-session', onEvent })`.
- Flutter/Android/iOS: a WebView loading `playUrl`. Flutter: `webview_flutter`, add a JavaScript channel named `MiniGames` to receive events.
- Create a **new session each time the player opens the game**. Never cache a `playUrl` for more than a few minutes.

Events the game sends to the page/app (`{ source: "minigames", type, data }`): `login`, `ready`, `round`, `needCoins`, `exit`.
On `needCoins` open the developer's coin shop. On `exit` close the game.

### Step 3 — coins (skip for demo wallets)

**Managed wallet** (switch the game to *Managed by my server* in the dashboard first; otherwise `409 wallet_not_enabled`):

```http
POST /api/v1/games/{gameId}/players/{playerId}/credit   { "amount": 100000, "reference": "order-1001", "note": "bought 100k" }
POST /api/v1/games/{gameId}/players/{playerId}/debit    { "amount": 40000,  "reference": "cashout-77" }
GET  /api/v1/games/{gameId}/players/{playerId}           → { playerId, displayName, balance, ... }
GET  /api/v1/games/{gameId}/players/{playerId}/transactions?limit=50&before=<nextBefore>   (bets and wins have `room` and `round`)
GET  /api/v1/games/{gameId}/players/{playerId}/rounds?limit=50&before=<nextBefore>&room=   (finished rounds: room, round, result, bet, win, net, bets by option, time; the history screen without storing webhooks)
→ credit/debit 200: { "playerId", "balance", "transactionId", "duplicate": false }
```

Rules that matter:
- `reference` is **required** and must be **unique per operation** (use the developer's order id / payout id). Repeating a call with the **same reference returns the first answer** (`"duplicate": true`) and never moves coins twice. Reusing a reference for a *different* operation → `409 reference_conflict`.
- **Retry on timeouts and 5xx with the same reference.** Do not retry other 4xx.
- `debit` with too little money → `402 insufficient_balance` (the answer includes the current `balance`), nothing moves.
- Credit **after** the developer's payment is confirmed, never before.
- A player is created automatically by `credit`, and by creating a session.

**Seamless wallet** (switch the game to *Seamless*; set the wallet address on the *API key & webhooks* page first): the developer implements **one** HTTPS endpoint. See [`prompts/integrate-seamless-wallet.md`](prompts/integrate-seamless-wallet.md) for the exact protocol. Key points: verify the signature; treat `reference` as an idempotency key; answer `200 {"balance": <integer>}`; for a debit with too little money answer `402 {"code":"insufficient_balance"}`; `rollback` undoes the debit with the same `reference` **only if it was applied**.

### Step 4 — webhooks (optional but recommended)

Set the address and copy the **signing secret** on the *API key & webhooks* page. Every request has headers `X-Minigame-Event`, `X-Minigame-Delivery`, `X-Minigame-Timestamp`, `X-Minigame-Signature` and a JSON body `{ id, type, createdAt, gameId, livemode, data }`.

**Verify like this (exactly):** `expected = "v1=" + hex( HMAC_SHA256( secret, timestamp + "." + rawBody ) )`. Use the **raw** body (before JSON parsing), compare with a **constant-time** function, reject timestamps older than 5 minutes, answer **2xx** quickly. Store `id` and ignore repeats. Event types: `round.settled`, `player.needs_coins`, `wallet.operation_failed`, `webhook.test`. Retries: 10 s, 1 min, 5 min, 30 min, 2 h, 6 h.

### Step 5 — rooms and leaderboards (optional)

```http
POST /api/v1/games/{gameId}/rooms  { "key": "vip", "name": "VIP", "capacity": 20, "auto": false, "overrides": { "chips": [100000,500000,1000000], "maxPerTarget": 2000000 } }
GET  /api/v1/games/{gameId}/rooms?limit=100&offset=0   → rooms (oldest first, `total`) with `online` player counts (for a lobby screen)
GET  /api/v1/games/{gameId}/rooms/{key}                 → one room with its `online` count
(create/update accept `metadata` {text values, up to 10: your notes, never shown to players} and `deleteWhenEmptyMinutes` (1-10080 or null). A game can have 5000 rooms. Only your server can create sessions for a room, so rooms are private by design.)
POST /api/v1/sessions { ..., "room": "vip" }            → 409 room_full when full; "auto" = first room with space, a new copy is opened when all are full
GET  /api/v1/games/{gameId}/leaderboard?room=vip&period=week&metric=winnings&limit=10&playerId=user-8841
```
`period`: `day|week|month|all` (UTC). `metric`: `winnings|net|wagered|biggest_win`. Rankings are cached 5 seconds.

## 5. Common mistakes (check your code for each)

1. API key in front-end/mobile code or in a URL. → Backend only.
2. Creating a session for a user who is not logged in to the developer's system.
3. Re-using one `playUrl` for many players or for hours.
4. Missing or non-unique `reference` on `credit`/`debit`; generating a new random reference on every retry (this defeats idempotency).
5. Treating `duplicate: true` as an error. It is a success.
6. Verifying the webhook signature against re-serialized JSON instead of the raw body; comparing with `==`; skipping the timestamp check.
7. Doing heavy work before answering the webhook (answer 2xx first, process afterwards).
8. Using the live key with a test game (or the reverse) → `wrong_environment`.
9. Sending decimals or strings as `amount`.
10. Forgetting that a player belongs to **one game**: the same user in two games has two balances.

## 6. How to verify the integration (give the developer these checks)

1. `GET /api/v1/games` with the key returns the game. (401 → wrong key.)
2. Create a session; open `playUrl` in a browser: the game loads **without a name prompt** and shows the player's `displayName`.
3. (Managed) `credit` 100000 → the open game shows the new balance within ~2 seconds; repeat the same call → `duplicate: true`, balance unchanged.
4. (Webhook) press *Send test* in the dashboard → delivery shows `delivered`; tamper with the body in a test → your endpoint answers 400.
5. Play a round → a `round.settled` webhook arrives with the player's `bet` and `win`.

## 7. Where the truth is

`/openapi.json` (machine-readable contract) · `/docs/` (human guide) · [`glossary.md`](glossary.md) · prompts in [`prompts/`](prompts).
