# Adding a game

A game has three parts: the **client** (Cocos), the **definition** (what a buyer can customize), and, when it has its own rules, a **server module**.

## 1. Server: the definition

Create `server/src/modules/catalog/<slug>.game.ts` exporting a `GameDef`:

- `slug`, `name`, `tagline`, `price`, `tech` (what the store card shows)
- `defaults`: the full default configuration (assets point to `/defaults/<slug>/...`)
- `manifest`: groups of **fields** the dashboard renders as forms. A field has a `key` (dotted path into the config), a `type` (`text`, `number`, `color`, `toggle`, `textlist`, `list`, `asset`, ...), limits, help text. Asset fields declare their `kind` (`image`, `video`, `audio`, `media`).
- `validate(config)`: cross-field rules (return an error string or `null`)

Register it in `modules/catalog/index.ts` (`GAMES`). The dashboard form, the server-side validation of `PUT /api/licenses/:id/config` and the upload rules are generated from the manifest, so **no dashboard code is needed**.

Put default artwork in `server/public/defaults/<slug>/`.

## 2. Server: the rules (if the game has any)

Create `server/src/modules/<slug>/` following [the backend layout](../architecture/backend.md): `*.engine.ts` (pure rules, easy to test), model, repository, service, routes, and a worker if something must happen without a player asking. Mount the routes in `app.ts` and create the service in `container.ts`.

Rules that matter:

- Outcomes are drawn on the server with `rng()` / `weightedIndex()` and never sent before they are final.
- All balance changes go through `ledger.post` inside a transaction. See [data model](../architecture/data-model.md).
- Write results with `results.record(...)` so the dashboard statistics work without game-specific code.

## 3. Client

Create `cocos/assets/scripts/games/<slug>/<Name>.ts`:

```ts
import { Game } from '../../core/GameBase';
export class MyGame extends Game {
  async start() {
    const { stage, cfg, api, hud, fx, theme } = this.ctx;
    // build the scene from cfg; use spawnMedia()/spawnSprite() for every asset
  }
}
```

Register the slug in `games/index.ts`. Keep the controller small: put popups and effects in their own files like `games/lucky-wheel/`. See [game client](../architecture/game-client.md).

## 4. Build and check

```bash
npx tsc --noEmit -p cocos          # quick type check
npm run build:games                # Cocos build
npm test                           # server
node scripts/e2e-full.mjs http://localhost:3000
```

The store lists the new game automatically.
