# AGENTS.md — instructions for AI coding assistants

This file is for any AI assistant (Claude Code, Codex, Cursor, Copilot, Gemini, ...) working **inside this repository**.
If you are an AI helping a *client's developer integrate* the game API into their own app, read
[`docs/ai/integration-playbook.md`](docs/ai/integration-playbook.md) instead (also served at `/llms.txt` on the live site).

## What this project is

MiniGame Studio: a reusable platform that sells customizable mini games (first game: Lucky Wheel 77). A *buyer* (a company)
buys a game, customizes it in a dashboard, and embeds it in its own website or app. **The buyer's own system owns users, logins
and (optionally) the coins; we run the game, keep the results and give the buyer APIs and webhooks.** It must stay a *reusable*
component: never add per-client code; add flexibility in the contract instead.

Stack: Node.js 24 · Express 5 · TypeScript · MongoDB (Mongoose, transactions) · Redis · WebSocket (`ws`) · Next.js 15 static export · Cocos Creator 3.8.

## Map of the repository

| Path | What | Read first |
|---|---|---|
| `server/src/modules/*` | Backend, one folder per feature (routes → service → repository → model) | [`docs/architecture/backend.md`](docs/architecture/backend.md) |
| `server/src/container.ts` | Composition root: where modules are wired together | |
| `server/src/modules/lucky-wheel/` | The game's rules, rounds, payouts, live hub (WebSocket) | [`docs/architecture/realtime.md`](docs/architecture/realtime.md) |
| `dashboard/src/` | Buyer dashboard (Next.js, `app/` routes, `features/` screens) | [`docs/architecture/dashboard.md`](docs/architecture/dashboard.md) |
| `cocos/assets/scripts/` | The game client (`core/` library, `games/<game>/`) | [`docs/architecture/game-client.md`](docs/architecture/game-client.md) |
| `server/public/docs/index.html` | Public integration guide (human) | |
| `server/src/modules/system/openapi.ts` | The API contract (served at `/openapi.json`) | |
| `docs/` | All documentation (architecture, guides, operations, `ai/`) | [`docs/README.md`](docs/README.md) |
| `scripts/` | Build and end-to-end test scripts | [`docs/guides/testing.md`](docs/guides/testing.md) |

## Commands

```bash
npm install
cp .env.example .env          # set MONGODB_URI (a replica set) and optionally REDIS_URL
npm start                     # server on :3000 (API + dashboard + games + docs)
npm test                      # server tests (in-memory MongoDB replica set; first run downloads mongod)
npm run typecheck -w server   # also: -w dashboard ; and: npx tsc --noEmit -p cocos
npm run build -w dashboard    # Next.js static export -> server/public/app (restart the server afterwards)
npm run build:games           # rebuild the Cocos game (needs Cocos Creator 3.8.8; ~40 s)
npm run loadtest -w server -- --players 1000 --seconds 70   # load test
```

## Rules you must follow

1. **Money moves only through the ledger** (`modules/ledger`), inside a MongoDB transaction. Never `$inc` a player balance anywhere else.
   Every money operation that a caller can retry has a unique `reference`; repeating it returns the first result.
2. **Layers:** routes never touch models; services never touch Express; only repositories import models; dependencies are passed in
   from `container.ts`. A new feature = a new folder under `server/src/modules/` mounted in `app.ts` and created in `container.ts`.
3. **Errors:** throw `AppError` helpers (`badRequest`, `notFound`, ...). The response shape is always `{ "error": "message", "code": "machine_code" }`.
   Add a stable `code` for every new failure a client may want to handle.
4. **The API is a contract.** If you add or change a client-facing endpoint, update `server/src/modules/system/openapi.ts`, the public guide
   (`server/public/docs/index.html`), `docs/ai/` and add a test. `test/platform.test.ts` fails when a documented endpoint does not exist.
5. **The server is authoritative.** Game outcomes are drawn server-side with `rng()` and hidden until betting closes; the client only renders.
6. **Secrets:** never commit `.env`, API keys, tokens or real credentials. API keys and passwords are hashed; webhook secrets are encrypted at rest.
   Never print secrets in logs or answers.
7. **Design is final:** the game art/layout comes from the client's Figma. Add motion and polish; never change layout or artwork.
8. **Tests:** run `npm test` and the typechecks before declaring work done. For game changes also run the browser scripts in `scripts/e2e-*.mjs`
   against a running server (headless Playwright; not the in-app browser pane).
9. **Keep files small and readable.** Prefer a new module or file over growing a large one. No clever one-liners that need a comment to decode.
10. **Do not touch other projects** on the production server (`/opt/minigame-studio` is the only path that belongs to this project).

## Before every push and deploy

There is no automatic CI: nothing checks a push for you, so run these yourself.

```bash
npm test                                                  # all server tests must pass
npm run typecheck -w server && npm run typecheck -w dashboard && npx tsc --noEmit -p cocos
npm run build:ai-docs                                     # after changing docs/ai or the API: commit the regenerated files
git push
```

Deploy (only this project's folder on the server, never other projects):

```bash
ssh root@<server> 'cd /opt/minigame-studio && git pull && docker compose up -d --build'
curl https://<your-domain>/api/health                     # must answer {"ok":true,...}
```

Game changes also need `npm run build:games` (Cocos Creator) and the rebuilt files in `server/public/games` committed before the push. Details: [`docs/operations/deployment.md`](docs/operations/deployment.md).

## Definition of done

- [ ] Types check (`server`, `dashboard`, `cocos`), tests pass, new behavior has a test.
- [ ] Client-facing change → OpenAPI + public guide + `docs/ai/` updated.
- [ ] No secrets, no leftover debug output, no unrelated refactors.
- [ ] Docs under `docs/` updated when architecture, commands or operations changed.

More: [`docs/ai/dev-guidelines.md`](docs/ai/dev-guidelines.md) · [`docs/ai/project-context.md`](docs/ai/project-context.md) · [`docs/ai/glossary.md`](docs/ai/glossary.md)
