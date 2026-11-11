# Glossary

Exact meanings. Use these words in code, docs and prompts.

| Term | Meaning |
|---|---|
| **Buyer / client** | The company that buys a game and embeds it. Has a dashboard account. |
| **Player** | An end user of the buyer's app. Exists **inside one game**. Identified by the buyer's own id (`playerId`, stored as `externalId`). |
| **API key** | Secret `mgs_...` of an account. Server only. Works for all of the account's live games. Hashed at rest. |
| **Test key** | Secret `mgs_test_...`. Works only with games marked *Test game*. |
| **Game ID** | `lic_...`. Identifies one purchased game (not secret). Called "license" in older code and in some URLs (`/api/licenses/:id`). |
| **Game** | A purchased, customizable copy of a game type (for example Lucky Wheel 77). Its configuration holds only the buyer's overrides; defaults live in the catalog. |
| **Session** | A 15-minute token + `playUrl` created by the buyer's server for one player. |
| **Player token** | The token the game uses after the session is exchanged (12 hours). |
| **Room** | A separate round clock, pot, history and ranking inside a game. Every game has an implicit room `main`. Capacity is a soft limit. |
| **Round** | One betting → spin → result cycle of a room. Its outcome is drawn when it is created and hidden until betting closes. |
| **Settlement / payout** | Paying a finished round: marking bets, crediting winners (batched, resumable), writing results, queueing the webhook. |
| **Ledger** | Immutable list of every balance change (`delta`, `balanceAfter`, `kind`, optional `reference`). The only place money moves. |
| **Reference** | A unique id (per game) for one money operation. Repeating it returns the first result. |
| **Wallet mode** | `demo` (starting balance + free refill), `managed` (buyer's server calls credit/debit), `seamless` (coins stay in the buyer's system; we call it). |
| **Guest login** | Per-game switch that lets players type their own name (demo only). Off by default. |
| **Webhook** | A signed POST from us to the buyer's server (`round.settled`, ...). Stored first, retried with backoff. |
| **Seamless request** | A signed POST from us to the buyer's wallet endpoint: `ping`, `balance`, `debit`, `credit`, `rollback`. |
| **Hub** | The in-memory live state of active rooms, pushed to players over WebSocket (`/ws`). A cache of the database, never the truth. |
| **Manifest** | A game's declaration of what a buyer may customize; the dashboard forms and server validation are generated from it. |
| **Asset slot** | One customizable image/SVG/video/audio of a game. |
| **Live / test game** | `mode` of a game. Test games answer only to the test key and send `livemode: false` webhooks. |
| **Preview player** | A player created from the dashboard preview. Hidden from statistics, rankings and webhooks. |
