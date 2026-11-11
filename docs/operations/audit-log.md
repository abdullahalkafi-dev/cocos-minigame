# Audit log

A full audit of the platform (server, money paths, API surface, realtime, dashboard, game client, build and deployment). Every finding below was **reproduced by a test first**, then fixed. The tests live in `server/src/test/audit.test.ts`, `security.test.ts` and `realtime.test.ts`, and stay in the suite as regression guards.

Audit 2 (2026-11-12). Result: 11 defects fixed (1 critical, 3 high), 5 accepted limits, **52 server tests pass** (22 before).

## Fixed

| # | Severity | Finding | Impact | Fix |
|---|---|---|---|---|
| 1 | **Critical** | A player opening a 4th WebSocket connection ran an endless loop: the old connection was only asked to close, but the hub still counted it, so `while (sockets >= 3)` never ended. | The whole server froze (every room, every player) from one player with 4 tabs or a reconnect storm. Found by the new realtime test hanging. | The replaced connection is removed from the hub immediately (`wheel.ws.ts`). Test: *WebSocket: bad tokens…*. |
| 2 | High | A seamless-wallet payout that ran a second time (crash before the round was marked paid, or lease expiry) tried to create a stored credit that already existed. The duplicate error aborts the database transaction, so the payout failed **forever** and the round was never finished. | Round stuck unsettled, no results, no webhook, endless retries. | Existing credit references are checked first, like managed wallets do (`seamless.storedCredits`). Test: *seamless wallet: a payout that is interrupted…*. |
| 3 | High | Changing the wallet mode (managed ↔ seamless ↔ demo) while a round was running made the round pay out in the new mode although the stakes were taken in the old one. | Coins credited to a client's wallet that were never debited there, or the reverse. | A round remembers its wallet mode from the moment it starts; bets in a round whose mode changed are refused with `wallet_mode_changed` (409) until the next round. Test: *changing the wallet mode in the middle of a round…*. |
| 4 | High | Rate limits counted per bearer token, so a caller could send a different fake token with every request and never be limited (sign-in, sign-up, API key guessing). | Unlimited password and API-key guessing attempts per address (account lockout still protected single accounts). | Sign-in and sign-up count per address only; a new global limiter blocks an address after 120 answers of 401 per minute. Tests: *rate limits cannot be dodged…*, *repeated failed API key attempts…*. |
| 5 | Medium | Two simultaneous "free refill" calls (demo wallet) each computed the top-up from the same old balance. | Free coins beyond the starting balance (demo mode only). | The top-up is computed inside the transaction from the current balance. Test: *demo refill…*. |
| 6 | Medium | CSV export wrote player names starting with `=`, `+`, `-`, `@` as they were. | A name such as `=HYPERLINK(...)` would run as a formula when the buyer opens the export in Excel or Sheets (spreadsheet formula injection). | Such text gets a leading apostrophe. Exports are also capped at 100,000 rows (the newest) so one click cannot exhaust server memory. Test: *CSV export…*. |
| 7 | Medium | Webhook and wallet calls checked the address once and connected later (DNS rebinding could point a name at a private machine in between). | Server-side request forgery against the hosting network. | All outgoing buyer calls go through `safePost`, which checks the resolved address at connection time, never follows redirects and reads at most 1 MB (`common/http/safe-fetch.ts`). Test: *safe outgoing calls…*. |
| 8 | Medium | If the server secret changed (lost data volume), reading the stored webhook secret threw and the whole webhook page returned 500. | Buyer locked out of webhook settings. | An unreadable secret counts as "none"; saving the address creates a new one. Test: *webhook secret that cannot be decrypted…*. |
| 9 | Low | Leaderboard rank of `me` ignored the tie-break the list uses, and room/player filters were unvalidated (cache key pollution). | `me.rank` could disagree with the list on equal winnings. | Rank uses the same order (value, wagered, id); filters are validated (400). Test: *leaderboard: bad filters…*. |
| 10 | Low | A malformed upload form (wrong field name) returned 500; uploads had no rate limit. | Noise in logs, easy abuse of disk writes. | Upload errors map to 400, upload route limited to 60/min. Test: *uploads: a malformed form…*. |
| 11 | Low | Fire-and-forget background tasks had no error handler; one rejected promise would end the Node process. Bet amounts were checked as integers only (huge values reached the ledger). | Possible crash on a database blip; unclear errors for absurd bets. | `.catch` on every background call and a global `unhandledRejection` logger; bets must be safe integers up to 1 trillion in total. Payout lease is renewed between batches. |

Also hardened: login takes the same time for unknown and known emails (no account probing by timing).

## Checked and found sound

- **Money:** every balance change goes through the ledger in a transaction; 20 simultaneous bets never overspend; identical credits count once; the max-bet limit holds under simultaneous bets; the ledger always sums to the balance after a mixed workload; paying a round twice pays once.
- **Isolation:** another buyer's dashboard and API-key calls get 404 on every route (12 dashboard and 6 API routes, plus upload); a player token never works in another game; session, player, dashboard and API credentials are not interchangeable.
- **Tokens:** forged, re-signed, expired and garbage tokens are refused.
- **Input:** unsafe asset addresses, colours and allowed-origin header tricks are refused; mass assignment is ignored; path tricks cannot leave the public folders.
- **Fairness:** the winning result is never sent before betting closes (HTTP and WebSocket); betting closes 250 ms early; outcomes come from `crypto.randomInt`.
- **Dependencies:** `npm audit` for the server's production dependencies reports 0 vulnerabilities.

## Accepted limits (not defects, but you should know)

1. **Dashboard build tooling advisory.** `npm audit` reports PostCSS inside Next.js 15. It only runs at build time on our own CSS and never ships. Fix is the Next 16 major upgrade (roadmap); an override was tried and does not apply because Next pins it.
2. **Account lockout can be used to annoy:** 8 wrong passwords lock one email for 5 minutes, from any address. This is the usual trade-off; the per-address limit stops mass use.
3. **Soft room capacity.** Two sessions created at the same instant can both enter a room with one free seat.
4. **Single-process live hub.** One process serves about 10,000 players (see [load-testing.md](load-testing.md)); more needs Redis pub/sub first.
5. **Losing the data volume loses `secret.key`.** All player/dashboard tokens become invalid and stored webhook secrets unreadable. Back up `/data` or set `SESSION_SECRET` in `.env` (see [deployment.md](deployment.md)).

## How to repeat this audit

```bash
npm test                         # 52 server tests
npm run typecheck -w server && npm run typecheck -w dashboard
npm audit --omit=dev --workspace server
npm run loadtest -w server -- --players 1000 --seconds 70 --bet-rate 0.3
```
