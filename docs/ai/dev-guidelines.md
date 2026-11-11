# Development guidelines (humans and AI)

## How to approach a change
1. **Read first:** `AGENTS.md`, then the architecture doc of the area (`docs/architecture/*`), then the module's service and its tests.
2. **Write the test first** (or alongside). Behavior of this system is specified by `server/src/test/*.test.ts`; copy their style (`startHarness`, `buyer()`, `call()`, `age()`).
3. **Make the smallest change** that fits the existing layering. Prefer adding a function to a service over adding a parameter to five files.
4. **Run:** `npm run typecheck -w server`, `npm test`, and for UI/game changes the type checks of `dashboard` and `cocos` plus the browser scripts.
5. **Update docs in the same change** (see the checklist below).

## Patterns to follow
- **New endpoint:** route (middleware chain: rate limit → auth → handler) → service method → repository call. Add the operation to `openapi.ts` if clients use it.
- **New money operation:** goes through `ledger.post(entry, session)` in `inTransaction`; has a `reference`; is replay-safe; emits `bus.emit('balance', ...)` so open games update.
- **New background job:** a worker file next to the module, started in `server.ts`, guarded by `cache.lock(...)`, and safe to run on several servers.
- **New event for buyers:** `webhooks.enqueue(userId, gameId, type, data, {id?, livemode})`; give it a deterministic `id` if it must be sent once; document it in `openapi.ts` (`webhooks`) and the public guide.
- **New collection:** model next to its module, only the repository imports it; declare indexes in the schema; if you change an existing unique index, call `syncIndexes()` for it at start-up (see `server.ts`).
- **Errors:** `throw badRequest('Human message', 'machine_code')`. Never return error objects.
- **Config for games:** add it to the game's manifest (`modules/catalog/*.game.ts`); the dashboard form and validation follow automatically.

## Pitfalls we already hit
- Express 5 path syntax: optional params are `/:id{/:tab}`, not `/:tab?`.
- Mongoose `lean()` skips schema defaults: read new optional fields with `?? default`.
- Do not compare MongoDB `_id` ObjectIds as strings without `String()`.
- A MongoDB transaction callback can run more than once: no side effects outside the database inside it.
- A failing Redis must never crash a request: `cache` methods swallow errors and report misses.
- `process.loadEnvFile` does not override variables that are already set; relative `DATA_DIR` is resolved against the repository root.
- Cocos: every asset goes through `spawnMedia()`; layout is anchored to the top/bottom edges (`ctx.vh`); test in headless Playwright, not in a hidden browser pane.
- WebSocket hub state lives in one process; do not add a second source of truth for balances or pots.

## Documentation checklist (tick what applies)
- [ ] `AGENTS.md` (rules/commands changed)
- [ ] `docs/architecture/*` (design changed) · `docs/operations/*` (deploy/ops changed)
- [ ] `server/src/modules/system/openapi.ts` (client API changed)
- [ ] `server/public/docs/index.html` (public guide) and `docs/ai/*` (playbook and prompts)
- [ ] `docs/roadmap.md` (mark done / add follow-ups)
- [ ] Regenerate AI bundles: `npm run build:ai-docs` (writes `server/public/llms.txt`, `llms-full.txt`, `docs/ai/` copies)

## Commit and review
Small commits with a message that says *why*. Run the review checklist in `AGENTS.md` ("Definition of done") before pushing. Never commit `.env` or secrets.
