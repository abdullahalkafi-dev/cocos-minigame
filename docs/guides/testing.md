# Testing

Two layers: fast server tests, and headless-browser end-to-end scripts that drive the real dashboard and the real game.

## Server tests

```bash
npm test                      # runs every *.test.ts under server/src
npm run typecheck -w server
```

- `modules/lucky-wheel/wheel.engine.test.ts`: pure rules. A 300,000-round simulation checks every option pays back about 85 to 100% of what is bet, and settlement math is checked exactly. No database needed.
- `test/api.test.ts`: integration tests through the real HTTP API against a **throw-away in-memory MongoDB replica set** (started by `test/harness.ts`, so transactions work exactly as in production; the first run downloads the MongoDB binary). They cover:
  - bet → settle → history, my bets, ranking, dashboard, **and the ledger adding up to the balance**
  - **money safety**: 8 parallel bets of 40% of the balance (exactly 2 fit), 5 simultaneous settlements (paid once)
  - one account API key + game ID: isolation between accounts, error codes, key rotation
  - buyer sign-up validation, wallet, store
  - customization validation and merging, settings
  - media uploads: each slot kind accepts only what it should; unsafe SVGs and fake files are rejected; served with `sandbox` CSP and `nosniff`

Write new integration tests with the helpers in `test/harness.ts`: `buyer()` (account + game + session), `player()`, `call()`, `age(ms)` (fast-forward every round), `reset()`.

## End-to-end scripts (need a running server and Playwright's Chromium)

They run the real game in a headless browser with software WebGL, so no GPU or visible window is needed. Start the server first (`npm start`). To get an API key and game ID, sign up in the dashboard (or `curl` the register and buy endpoints).

```bash
node scripts/e2e-full.mjs      <host>                                        # sign-up → buy ×2 → customize → two client sites embed → live round → dashboard shows each game's own players
node scripts/e2e-wheel.mjs     <host> <apiKey> <gameId>                      # plays every phase, screenshots in tmp/
node scripts/e2e-popups.mjs    <host> <apiKey> <gameId>                      # every popup
node scripts/e2e-chips.mjs     <host> <apiKey> <gameId> [loads]              # regression: tapping a chip highlights and bets with THAT chip
node scripts/e2e-media.mjs     <host> <email> <password> <gameId> <apiKey>   # video / SVG / sprite sheet / audio end to end
node scripts/e2e-dashboard.mjs <host> <email> <password> <gameId>            # screenshots of every dashboard screen
```

The scripts reach into the running game through `window.__game`, which exists only when the page is opened with `?debug=1`.

Do not use the in-app browser pane to test the game: while hidden it reports the tab as hidden and Cocos renders no frames.
