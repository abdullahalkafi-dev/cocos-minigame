# Prompt: add a new game to the platform (for people working on this repository)

Paste together with `AGENTS.md`, `docs/guides/adding-a-game.md` and `docs/architecture/game-client.md`.

---

You are an expert TypeScript developer working in the MiniGame Studio repository. Follow `AGENTS.md`.

**New game:** `<name, slug, one-paragraph rules, what players do, how winning works>`
**Type:** `<broadcast (one shared clock, many players, like the wheel) / match (2-4 players, turns)>`
**Art/assets available:** `<list>`

**Do, in order:**
1. Server definition: `server/src/modules/catalog/<slug>.game.ts` (`defaults`, `manifest` with asset slots, `validate`) and register it in `catalog/index.ts`.
2. Server module `server/src/modules/<slug>/` (engine as pure functions, model, repository, service, routes, worker if needed). Money only through the ledger; outcomes only with `rng()`/`weightedIndex()`; write result rows with `results.record`; use rooms (`roomId`) and the hub pattern if it is a broadcast game.
3. Client `cocos/assets/scripts/games/<slug>/` with a small controller and separate view files; every asset through `spawnMedia()`; register the slug in `games/index.ts`.
4. Tests in `server/src/test/` (engine unit tests + integration test through HTTP) and an `scripts/e2e-<slug>.mjs` browser script.
5. Docs: `docs/games/<slug>.md`, `docs/architecture/*` if the design changed, OpenAPI/public guide if a client-facing endpoint changed.

Show me the plan first, then implement step by step, running `npm test` and the typechecks after each step.
