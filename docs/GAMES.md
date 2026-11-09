# The three games: what each one uses

Use this when you present the demo to your client. Each game has a **plain-language summary** (what to say) and a **technical summary** (what is under the hood).

## What all three share

| Piece | What it is | Why it matters |
|---|---|---|
| **Cocos Creator 3.8.8** | Professional 2D game engine; games are written in **TypeScript** and compiled to a WebGL2 web build | Same engine used for commercial mobile/web games; one build runs in any browser, iframe, or app WebView |
| **Procedural art** | Every sprite (wheel, reels, tokens, buttons, coins) is drawn at runtime with Canvas 2D and uploaded as a texture | No image files to ship; any colour or logo can be changed per customer; sharp on every screen density |
| **Tween animation** | Cocos tween system with easing curves (back, quart, sine…) | Spins, bounces, hops, pop-ins feel physical |
| **Particle effects** | A small pooled particle layer (confetti, coins, stars, sparks) | Win celebrations, captures, jackpots |
| **Synthesised sound** | WebAudio oscillators/noise, no audio files | Tiny download, works offline, mute toggle |
| **Runtime configuration** | The game boots, asks the server for *this customer's* config (colours, images, prizes, currency, bet sizes) and builds itself from it | One build, unlimited customised copies |
| **Server-authoritative results** | Spin and slot outcomes are drawn on the server with a cryptographic RNG; the odds never reach the browser | Players can't cheat; every round is stored for the buyer's dashboard |
| **Responsive layout** | Fixed 1280-unit height, scaled to fit narrow phones; works at any aspect ratio | Looks right in a phone WebView and in a desktop iframe |
| **Host messaging** | `postMessage` for websites and a JavaScript channel for Flutter/WebViews | The customer's app can react to rounds and wins |
| **Small build** | Engine trimmed to 2D modules only: about **1.9 MB** (≈ **430 KB** over the wire with Brotli) | Fast to load on mobile data |

## 1. Lucky Spin (fortune wheel)

**Say:** "A fortune wheel with real spin physics. Your customer picks the prizes, the colours and the logo, and every spin is decided securely on the server."

**Under the hood**
- Wheel texture generated from the prize list: segment colours, radial labels auto-fit to size, optional icons per segment.
- Spin = wind-up pull-back, then six full turns with a `quartOut` deceleration; a pointer flicks each time a segment boundary passes (with a tick sound), exactly like a physical wheel.
- Result is chosen server-side (`weight` per prize → `crypto.randomInt`), the wheel is animated to land on that exact segment with a small random offset inside it.
- Win card with a count-up, confetti, coin burst, spark burst, wedge highlight; extra rain + screen shake for the top prize.
- Default payout rate ≈ **93%** (verified by a 200,000-spin simulation in the test suite).
- Buyer can edit: title, logo, background, 4 theme colours, currency name, starting balance, bet sizes, 2-12 segments (label, multiplier, odds, colour, icon).

## 2. Lucky 77 (slot machine)

**Say:** "A 3x3 slot machine with five paylines, glowing win lines and a jackpot celebration. Symbols are fully replaceable with the customer's own brand."

**Under the hood**
- Three masked reels; each spin builds a strip (14-28 random symbols plus the server's result at the end) and scrolls it with a custom ease (fast kick, progressive deceleration), staggered per reel, then a small bounce and a stop thud.
- Symbols (7, diamond, BAR, bell, cherry, lemon) are vector-drawn in code; any symbol can be replaced by an uploaded image or a custom badge.
- 5 paylines (3 rows + 2 diagonals); the server evaluates every line, the client draws glowing lines, pulsing cell frames and per-line sparkles.
- Jackpot (top symbol on a line) triggers a marquee light chase, coin rain, screen shake and a jackpot card.
- Default payout rate ≈ **93%** (200,000-spin simulation).
- Buyer can edit: title, logo, background, colours, currency, starting balance, bet sizes, 3-8 symbols (label, 3-in-a-row multiplier, odds, colour, image).

## 3. Ludo Royale (board game vs bots)

**Say:** "Classic Ludo for one player against three smart bots, with animated dice and tokens, captures and extra turns. Entry fee and prizes are configurable."

**Under the hood**
- **Rule engine** separated from rendering (`ludoRules.ts`, no engine imports) and unit-tested: board geometry (52-cell loop, home columns, safe stars), roll-a-6-to-leave, exact roll to finish, capture on non-safe cells, extra turn on 6 / capture / reaching home, three-sixes forfeit, 300 simulated 4-bot games all terminate with a legal winner.
- **Bot AI** scores every legal move (finish, capture, leave yard, safe cell, danger from opponents behind, escaping danger) with three difficulty levels (easy / normal / hard) selectable by the buyer.
- Board is one generated texture coloured from the buyer's palette; tokens are glossy pawns; moves hop cell-by-cell with squash-and-stretch; captured tokens fly back to their yard.
- Entry fee is charged by the server when a match starts; the prize is paid when it finishes (1st / 2nd place multipliers set by the buyer).
- Dice use the browser's cryptographic RNG. **Note for the demo:** match moves are resolved in the client and the final placement is reported to the server. For a production real-money-style product the next step is moving the dice and move validation to the server (the rule engine is already pure TypeScript and can run on Node unchanged) and adding online multiplayer over WebSockets.

## Platform around the games

| Piece | Technology |
|---|---|
| Backend | Node.js 24 + Fastify 5, SQLite (built-in `node:sqlite`), TypeScript |
| Buyer dashboard | React 18 + Vite; forms are generated from each game's *manifest*, so a new game needs no dashboard code |
| Embed library | `sdk/minigames.js` (about 4 KB, no dependencies) |
| Security | Secret license key (hashed at rest), 15-minute signed session tokens, per-license usernames, rate limits, optional allowed-site list (`frame-ancestors`), image-upload validation by file signature |
| Tests | 9 automated tests (server flow, payout simulations, Ludo rules incl. 300 simulated games); headless-browser end-to-end scripts in `scripts/` |
