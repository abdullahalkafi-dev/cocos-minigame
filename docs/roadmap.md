# Roadmap

Planned work, in order, with the reasoning. Nothing here is built yet unless it says so.

## 1. Identity and wallet connection to the client's system

**Problem.** Today players pick their own username and their coins exist only in our database. A real client sells coins in its own system and owns its users.

**Principle.** We are a reusable component, not a custom build per client: one small, stable, well-documented contract that every client adapts **their** system to. End-user login, passwords and security stay on the client side; we only manage the play session.

- **Identity.** The client's server creates the session with its own immutable `playerId` (and optional `displayName`, `avatarUrl`). Because the server is authenticated by the API key, we trust the id. The free username screen stays only as an explicit guest mode (a per-game switch, off by default) and for the dashboard preview.
- **Managed wallet (default).** We hold the balance. The client's server calls `credit` after selling coins and `debit` for a cash-out, with a `reference` as idempotency key, and can read the balance and the transaction list. Foundation already built: the ledger (see [data model](architecture/data-model.md)).
- **Signed webhooks.** `round.settled` and friends, HMAC-signed with a timestamp, retried with backoff, with a delivery log and a "send test event" button in the dashboard.
- **Seamless wallet (later).** For clients that must keep the money in their own database: we call four endpoints they implement (`balance`, `debit`, `credit`, `rollback`), signed, with retry and rollback.
- **Developer experience.** Versioned API, OpenAPI spec, standard error codes (already: `{ error, code }`), sandbox keys, and examples in Node.js, Python, Java, PHP and Flutter.

## 2. Rooms and scale

**Idea.** A *room* is a separate round clock, pot, history and ranking. Small tables and one huge shared event are the same thing with different capacity.

- The engine key becomes `gameId + roomId`. The session request can ask for `room: "auto"` (first room with space) or a named room; rooms can carry presets (a beginner room with small chips, a VIP room with large ones).
- Clients get `GET /rooms` (for their own lobby screen), `POST /rooms`, and a leaderboard API (`GET /leaderboard?room=&period=&metric=`) so their app can show its own ranking.
- **Push instead of polling:** WebSocket (or SSE) per room, so thousands of players cost one broadcast per tick instead of one request each. Round state in memory, written to the database in batches; money entries stay immediate.
- A second room type for match games (Ludo, cards): 2 to 4 players, turn state, reconnects, matchmaking.
- **Measure before promising.** Add a load test with bots at 1,000, 5,000 and 10,000 players; publish only measured numbers.

## 3. Housekeeping

- Split `server/public/docs/index.html` into per-language pages once the wallet and webhook sections are added.
- Move the dashboard preview from a free username to a fixed preview player.
