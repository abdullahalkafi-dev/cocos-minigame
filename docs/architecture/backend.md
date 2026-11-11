# Backend architecture

Express 5 + TypeScript, organized by **feature module**. Everything lives in `server/src`.

```
server/src/
  server.ts            starts everything: env, MongoDB, cache, container, workers, HTTP
  app.ts               builds the Express app: middleware order, which module owns which routes
  container.ts         composition root: creates every service and wires dependencies
  config/              env.ts (validated environment), constants.ts
  infra/               mongo.ts (connection, transactions), cache.ts (Redis or in-memory)
  common/
    errors.ts          AppError and helpers (badRequest, unauthorized, ...)
    http/              bearer.ts, express.d.ts (what middleware puts on the request)
    middleware/        validate, rate-limit, security-headers, error-handler
    utils/             crypto (ids, tokens, passwords), rng, object helpers
  modules/
    auth/              sign-up and sign-in of buyers, auth middleware
    users/             the buyer account and its demo wallet
    api-keys/          the account's secret API key
    store/             what can be bought, buying
    catalog/           game definitions: defaults + manifest + validation of customizations
    games/             games a buyer owns: config, settings, cache
    uploads/           media upload validation and storage
    players/           end players of a game
    ledger/            every balance change (the only place money moves)
    wallet/            the client's wallet API: credit, debit, balance, transactions (idempotent)
    webhooks/          signed notifications to the client's server: outbox, delivery, retries, worker
    results/           per-round results for the dashboard, statistics, CSV
    sessions/          server-to-server API: list games, create play sessions for a client-named player
    play/              what every game needs: bootstrap, player login, auth of the running game
    lucky-wheel/       the wheel game: rules engine, rounds, bets, settlement, worker
    system/            health check and static files (games, sdk, docs, dashboard, uploads)
  scripts/             one-off tools (migrate-from-sqlite.ts)
  test/                shared test harness and integration tests
```

## Layers inside a module

A module contains only the files it needs, named `<feature>.<layer>.ts`:

| File | Responsibility | May import |
|---|---|---|
| `*.model.ts` | Mongoose schema + the TypeScript record type | mongoose |
| `*.repository.ts` | Database access: queries and writes, nothing else | its own model |
| `*.service.ts` | Business rules. Created by a factory `createXService(deps)` so dependencies are explicit | repositories and services of other modules (via `deps`) |
| `*.middleware.ts` | Express middleware of the feature (authentication) | services |
| `*.routes.ts` | URL, middleware chain, request in, response out. No business logic | `Container` |
| `*.schemas.ts` | zod request schemas | zod |

Rules:

1. **Routes never touch a model.** They call a service. **Services never touch Express** (`req`, `res`).
2. **Only repositories import models.** Another module that needs data calls the owning module's repository or service.
3. **Dependencies come from the container.** A service receives what it needs as arguments; it does not import another module's singleton. This keeps modules testable and replaceable.
4. **Errors are thrown, not returned.** Throw an `AppError` (`badRequest`, `notFound`, ...). Express 5 forwards rejected promises from handlers and middleware to the error handler, so no `try/catch` wrappers are needed.
5. **One error format:** `{ "error": "human message", "code": "machine_code" }`.

## Request pipeline

```
securityHeaders → cors → compression → json body
  → module routers (each: rate limit → authentication → validation → handler)
  → static files (system) → notFoundHandler → errorHandler
```

- **Authentication middleware** (`auth`, `play`): `requireUser`, `requireApiKey`, `requireOwnedGame`, `requireSession`, `requirePlayer(slug)`. They attach `req.user`, `req.account`, `req.game`, `req.session`, `req.player`.
- **Validation:** `validateBody(zodSchema)` rejects bad input with the first problem as a 400.
- **Rate limiting:** `c.limit(max, windowMs)`. Counters are shared through Redis. The key is the caller's token when there is one (players behind one shared IP do not throttle each other), otherwise the IP.

## Money

Every balance change goes through `ledger.post(entry, session)` inside a MongoDB transaction:

- the player's balance is changed with one atomic update that refuses to go below zero,
- an immutable ledger entry records `delta`, `balanceAfter`, `kind` and an optional `reference` (idempotency key, unique per game).

A player's balance always equals the sum of their ledger entries; the integration tests assert this after bets, wins and concurrent requests.

## The shared round clock (Lucky Wheel)

- A round is created lazily by whichever request first needs it; the unique index `(gameId, no)` makes a race harmless.
- The current round is cached in Redis until it ends, so polling does not hit MongoDB during betting and the spin.
- Settlement claims the round with `updateOne({ settled: false }) → settled: true` **inside the transaction** that pays everyone. Only one caller can win the claim, so a round is paid exactly once however many servers, tabs or workers ask. A background worker (with a Redis lock) settles rounds nobody is polling.

## Cache

`infra/cache.ts` exposes `getJson / setJson / del / lock`. Redis in production, an in-memory map when `REDIS_URL` is empty. Cache failures are treated as misses: the cache can never break a request. Currently cached: game records (invalidated on every change), the current round, the history ribbon, the ranking (3 s).

## How to add a module

1. Create `modules/<name>/` with the layers you need (model → repository → service → routes).
2. Create the service in `container.ts` and add it to the returned object.
3. Mount `<name>Routes(container)` in `app.ts`.
4. Add an integration test in `test/` (see [`../guides/testing.md`](../guides/testing.md)).

## Conventions

- ES modules with `.js` suffixes in imports (TypeScript `Bundler` resolution), run with `tsx`.
- IDs are strings with a readable prefix (`usr_`, `lic_`, `ply_`, `wr_`, `rnd_`).
- Timestamps are milliseconds since the epoch (numbers).
- `npm run typecheck -w server` must pass.
