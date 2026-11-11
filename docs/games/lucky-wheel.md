# Lucky Wheel 77: what it uses

Use this when you present the demo to your client. Each section has a **plain-language line** (what to say) and the **technical detail** (what is under the hood).

## The game in one sentence

> "A live betting wheel. Players bet on a fruit or 77, a shared round clock spins the wheel for everyone, winners are paid instantly, and every image, video, sound, text and odd can be changed from the dashboard without touching code."

## How a round works

1. **Betting** (default 20 s): a countdown shows in the wheel hub. Players tap a bet box with the chip they selected. "Repeat Bet" re-places the previous round.
2. **Spin** (default 6 s): betting closes, the wheel spins and lands on the server-decided wedge. A late joiner sees the wheel at the correct position, because the angle is computed from the server clock.
3. **Result** (default 6 s): the wedge and winning boxes light up, the history ribbon updates, winners are paid, and a "Good luck" popup lists the top winners of the round.
4. The next round starts on its own. The clock is **shared by every player of the same room** (a game has one room by default; the client can create more: small tables, a VIP table, one huge event).

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

## Motion and feel (added on top of the Figma design, which is unchanged)

- **Loading**: a themed loading screen with a progress bar while the scene builds.
- **Wheel**: slowly turning sunburst and a breathing glow behind it, a glint on the top gem, a small backward wind-up before take-off, a motion ghost while it spins fast, the gem flashing on every wedge that passes, and a settle nudge when it stops.
- **Countdown**: the hub shows the seconds with a draining ring that turns red in the last five; a ripple marks the moment betting closes.
- **Bets**: chips fly from the rack to the box and stack up as the bet grows; pot numbers count up.
- **Result**: the winning wedge pulses, the winning symbol pops out of the wheel with its name and multiplier and flies into the history ribbon, winning stacks turn into coins that fly to the balance, losing stacks fade away, and the balance counts up.
- **Interface**: staggered intro, press feedback on every button, popups that scale in and out, and cross-fading status text.

## Architecture (for your technical audience)

```
 Dashboard (Next.js)  ──manifest──▶  Server (Express + MongoDB)  ──config + asset URLs──▶  Game (Cocos Creator, TypeScript)
   renders forms from the           validates config, stores media,                      loads each slot at runtime:
   game's manifest                  runs the round clock + payouts                        image / SVG / video / sheet / audio
```

- **Manifest-driven**: each game declares what is customizable (`server/src/modules/catalog`). The dashboard form, the server validation and the media upload rules are all generated from it, so a new game needs no dashboard code.
- **Typed asset slots**: a slot declares its kind (`image`, `video`, `audio`, `media`). Uploads are identified by **file signature**, never by name, size-limited per type, and stored per license. SVGs containing scripts or external references are rejected.
- **Runtime media loader** (`cocos/assets/scripts/core/Media.ts`): one function, `spawnMedia(slot)`, shows any slot as a sprite. SVG is rasterized sharply at any size, a sprite sheet steps its frame rectangle at the chosen FPS, and a video is copied into a texture every frame (muted, inline, so it autoplays on phones; WebM keeps transparency).
- **Shared round clock** (`server/src/modules/lucky-wheel`): a round is created lazily with its outcome already drawn (crypto RNG) and hidden from clients until betting closes. Payouts are credited when the spin ends, idempotently, so a refresh or a second tab can never pay twice. Every settled round is also written to the buyer's results table, so the dashboard needs no game-specific code.
- **Server-authoritative**: bets are validated and deducted on the server; clients only render the state. The odds are never sent to the game.
- **Live push**: the server pushes the room state over WebSocket (about once a second, and at once when a bet, a payout or a wallet credit changes something for that player), with HTTP polling as the automatic fallback.
- **Rooms and wallets**: each room has its own clock, pot and ranking, with optional presets (chips, max bet, timing). Coins can live in our database (demo, managed) or in the client's own system (seamless).
- **Responsive**: fixed 1280-unit design height, scaled to fit narrow phones; the top bar and bottom controls anchor to the screen edges.
- **Host messaging**: `postMessage` for websites and a JavaScript channel (`MiniGames`) for Flutter/WebViews: `login`, `ready`, `round`, `exit`.
- **Size**: the engine is trimmed to 2D modules only (about 1.9 MB, about 430 KB over the wire with Brotli); artwork is optimized WebP.

## Platform around the game

| Piece | Technology |
|---|---|
| Backend | Node.js 24 + Express 5, TypeScript, MongoDB (Mongoose, transactions), Redis cache |
| Buyer dashboard | Next.js 15 + React 19 (static export): asset studio, live phone preview, players and results |
| Embed library | `sdk/minigames.js` (about 4 KB, no dependencies) |
| Security | One secret API key per account (hashed at rest, rotatable) plus a game ID per game, 15-minute signed session tokens, players named by the client's own system (never by the player), an optional managed wallet with idempotent credits and debits, signed webhooks, rate limits, optional allowed-site list (`frame-ancestors`), upload validation, locked-down upload serving (CSP `sandbox`, `nosniff`) |
| Tests | 22 automated server tests (identity, wallets, webhooks, rooms, WebSocket push, seamless wallet and the OpenAPI contract included; round flow and exact payout math, ledger adds up to the balance, parallel bets and settlement, 300,000-round odds simulation, API key and game ID isolation and rotation, account and store, customization validation, media upload safety) plus headless-browser end-to-end scripts in `scripts/` |

## Honest limits of this demo

- The in-game currency is demo credits; there is no payment provider.
- Round state is polled once a second per player. That is fine for hundreds of concurrent players; thousands need push (WebSocket) and a load test first (see the roadmap).
- Every wheel artwork must have the same number of wedges as the wheel layout in the rules. The default art has 9.
- Video effects play best as WebM with transparency. MP4 has no transparency, so use it for full-screen or opaque effects.
