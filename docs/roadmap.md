# Roadmap

Status of the plan and what is left. Items marked **done** are built, tested and live.

## Done

- **Identity** (done): the client's server names the player (`playerId`); guest login is an explicit per-game switch, off by default.
- **Wallets** (done): `demo`, `managed` (credit/debit with idempotent references, history) and `seamless` (we call the client's wallet endpoint; stakes synchronous, wins stored and retried, rollbacks). See [architecture/wallets.md](architecture/wallets.md).
- **Signed webhooks** (done): `round.settled`, `player.needs_coins`, `wallet.operation_failed`, `webhook.test`; HMAC + timestamp, retries, delivery log and retry button; secret encrypted at rest.
- **Rooms** (done): capacity, automatic placement with overflow copies, presets (chips, max bet, timing), presence, API and dashboard. **Leaderboards** (done): day/week/month/all, four metrics, per room, `me` rank.
- **Scale** (done for one process): in-memory room hub with WebSocket push, batched resumable payouts, measured by a load test (see [operations/load-testing.md](operations/load-testing.md)).
- **API platform** (done): OpenAPI 3.1 at `/openapi.json` (tested against the real routes), Postman collection, test/live keys and games, standard error codes.
- **AI-friendly docs** (done): `AGENTS.md`, `docs/ai/`, `/llms.txt`, `/llms-full.txt`.

## Next (not built)

1. **Scale out the live side**: Redis pub/sub between app processes (or sticky routing by room) so more than one process can serve the same room. Today run one process and scale it up. A stronger MongoDB tier matters more than anything else past a few thousand betting players.
2. **Match games** (Ludo, cards): a second room type with turn state, reconnects and matchmaking. The room, wallet and webhook layers are reusable as they are.
3. **API versioning policy**: the paths are already `/api/v1`; define deprecation rules before a v2 exists. Add a client SDK generated from the OpenAPI document (TypeScript, Python, Java, PHP, Dart).
4. **Per-game webhook addresses** (today one address per account) and a webhook replay by event type.
5. **Operations**: backups and alerts on `/api/metrics`, a staging environment, repository switched to private with a deploy key (see [operations/deployment.md](operations/deployment.md)).
6. **A coin conversion rate** between a client's currency and game coins (today amounts are the client's own integers).
7. **More games** at the same quality as Lucky Wheel 77, using the manifest-driven pipeline ([guides/adding-a-game.md](guides/adding-a-game.md)).
