# Lucky Wheel 77: what it uses

Use this when you present the demo to your client. Each section has a **plain-language line** (what to say) and the **technical detail** (what is under the hood).

## The game in one sentence

> "A live betting wheel. Players bet on a fruit or 77, a shared round clock spins the wheel for everyone, winners are paid instantly, and every image, video, sound, text and odd can be changed from the dashboard without touching code."

## How a round works

1. **Betting** (default 20 s): a countdown shows in the wheel hub. Players tap a bet box with the chip they selected. "Repeat Bet" re-places the previous round.
2. **Spin** (default 6 s): betting closes, the wheel spins and lands on the server-decided wedge. A late joiner sees the wheel at the correct position, because the angle is computed from the server clock.
3. **Result** (default 6 s): the wedge and winning boxes light up, the history ribbon updates, winners are paid, and a "Good luck" popup lists the top winners of the round.
4. The next round starts on its own. The clock is **shared by every player of the same license**.

Extra: when the *lucky* option (77) hits, there is a configurable chance that a second option is paid in the same round (the "multiple awards" rule).

## Dynamic by design: everything is a slot or a setting

| Kind | Examples | Where it comes from |
|---|---|---|
| **Assets (typed slots)** | background, wheel frame, wheel disc, hub, ribbon, bet-box frame, every button, chips, fruit icons, multiplier badges, logo, avatar | Image (PNG, JPG, WebP, GIF), **SVG**, sprite sheet, or **video** (MP4 / WebM) |
| **Effects** | ambient loop behind the wheel, win celebration, lucky-77 celebration | Video, sprite-sheet animation, or still image |
| **Audio** | background music, spin, tick, chip, win, lose | MP3 / OGG / WAV / M4A. Anything not supplied uses a synthesized sound |
| **Rules** | bet options (name, multiplier, icon, badge), wheel layout (segments and weights), bonus chance | Database (per license) |
| **Economy** | chips and their values, starting balance, max bet | Database |
| **Timing** | betting / spin / result seconds | Database |
| **Texts** | every label, the how-to-play steps, popup titles | Database |
| **Theme** | colors | Database |

A buyer who uploads nothing gets the default artwork. A buyer can replace one asset and keep the rest.

## Architecture (for your technical audience)

```
 Dashboard (React)  ──manifest──▶  Server (Fastify + SQLite)  ──config + asset URLs──▶  Game (Cocos Creator, TypeScript)
   renders forms from the           validates config, stores media,                      loads each slot at runtime:
   game's manifest                  runs the round clock + payouts                        image / SVG / video / sheet / audio
```

- **Manifest-driven**: each game declares what is customizable (`server/src/catalog.ts`). The dashboard form, the server validation and the media upload rules are all generated from it, so a new game needs no dashboard code.
- **Typed asset slots**: a slot declares its kind (`image`, `video`, `audio`, `media`). Uploads are identified by **file signature**, never by name, size-limited per type, and stored per license. SVGs containing scripts or external references are rejected.
- **Runtime media loader** (`cocos/assets/scripts/core/Media.ts`): one function, `spawnMedia(slot)`, shows any slot as a sprite. SVG is rasterized sharply at any size, a sprite sheet steps its frame rectangle at the chosen FPS, and a video is copied into a texture every frame (muted, inline, so it autoplays on phones; WebM keeps transparency).
- **Shared round clock** (`server/src/wheel.ts`): a round is created lazily with its outcome already drawn (crypto RNG) and hidden from clients until betting closes. Payouts are credited when the spin ends, idempotently, so a refresh or a second tab can never pay twice. Every settled round is also written to the buyer's results table, so the dashboard needs no game-specific code.
- **Server-authoritative**: bets are validated and deducted on the server; clients only render the state. The odds are never sent to the game.
- **Responsive**: fixed 1280-unit design height, scaled to fit narrow phones; the top bar and bottom controls anchor to the screen edges.
- **Host messaging**: `postMessage` for websites and a JavaScript channel (`MiniGames`) for Flutter/WebViews: `login`, `ready`, `round`, `exit`.
- **Size**: the engine is trimmed to 2D modules only (about 1.9 MB, about 430 KB over the wire with Brotli); artwork is optimized WebP.

## Platform around the game

| Piece | Technology |
|---|---|
| Backend | Node.js 24 + Fastify 5, SQLite (built-in `node:sqlite`), TypeScript |
| Buyer dashboard | React 18 + Vite: asset studio, live phone preview, players and results |
| Embed library | `sdk/minigames.js` (about 4 KB, no dependencies) |
| Security | Secret license key (hashed at rest), 15-minute signed session tokens, per-license usernames, rate limits, optional allowed-site list (`frame-ancestors`), upload validation, locked-down upload serving (CSP `sandbox`, `nosniff`) |
| Tests | 5 automated server tests (round flow and exact payout math, 300,000-round odds simulation, license isolation, customization validation, media upload safety) plus headless-browser end-to-end scripts in `scripts/` |

## Honest limits of this demo

- The in-game currency is demo credits; there is no payment provider.
- SQLite is perfect for a demo and small deployments; use Postgres for heavy concurrent load.
- Every wheel artwork must have the same number of wedges as the wheel layout in the rules. The default art has 9.
- Video effects play best as WebM with transparency. MP4 has no transparency, so use it for full-screen or opaque effects.
