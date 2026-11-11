# Real-time: rooms, the hub and WebSocket push

## Rooms

A **room** is its own round clock, pot, history and ranking inside one game (`modules/rooms`). A small table and one huge shared event are the same
thing with different `capacity`. Every game has an implicit room `main` (created the first time it is needed).

- `RoomRec { key, name, capacity (soft, null = unlimited), auto, overrides }`. `overrides` may change only: `title`, `chips` (values; art reused by position), `maxPerTarget`, `timing`.
- **Placement** (`rooms.assign`): a named room is joined if it has space (`409 room_full`); `"auto"` picks the first `auto` room with space; when all are full a copy of the last auto room is opened (`main-2`, `main-3`, ...), up to 200 rooms per game.
- **Presence** (who is in a room) is a Redis sorted set (`touchPresence` / `countPresence`, a player counts for 45 seconds after they were last seen). A seat is reserved when the session is created, so a burst of sessions does not all land in one room. Capacity is therefore *soft*.
- A session token carries the room (`rm`); every bet, state and ranking call is scoped to it. Rounds, bets and results store `roomId`; the round number sequence is per room.

## Why push instead of polling

Polling means every player asks the server for the room state once a second: 10,000 players = 10,000 requests per second, each with database reads.
Instead the server keeps the live state of every active room **in memory** and **pushes** it over WebSocket:

```
          bet / wallet credit / payout                      once per second per room
 service ───────────────────────────────▶  WheelHub  ──▶  compute the shared part ONCE
                                              │             + per player: balance, own bets, own result
                                              ▼
                                     one small message per connected player
```

`modules/lucky-wheel/wheel.hub.ts` (state) and `wheel.ws.ts` (sockets). The hub is a **cache of the database, never the truth**: after a restart a room is rebuilt from
the stored round and bets (`potByTarget`, `betsByPlayer`), and settlement results are rebuilt from the stored bets (`settleInfoFor`).

## Protocol (`GET /ws`)

1. Connect, then within 5 seconds send `{ "t": "auth", "token": "<player token>" }` (tokens are not put in URLs). Bad token → close code `4401`, unknown room `4404`, inactive game `4003`.
2. The server answers with `{ "t": "state", serverTime, round: { no, phase, startAt, betEnd, spinEnd, endAt, result|null }, timing, pot, history, balance, mine, winners|null, my|null }` immediately, then about once a second, and **at once** when something changes for that player (their bet, a wallet credit, a payout).
   `result` is `null` until betting closes. `winners`/`my` are non-null once the round is paid.
3. The client may send `{ "t": "ping", "c": <client ms> }`; the answer `{ "t": "pong", "c", "s": <server ms> }` lets it compute the clock offset (the wheel position is derived from the server clock, so everybody sees the same spin).
4. At most 3 connections per player (older ones are closed). Messages beyond 20/second are ignored. A connection that stops answering pings is dropped after ~30 s. A client with a backed-up socket (over 512 KB buffered) is skipped for that tick.

The game falls back to HTTP polling (`GET /api/play/wheel/state`, same fields) when the socket cannot connect or goes quiet, and reconnects in the background with exponential backoff.
Bets are always plain HTTP (`POST /api/play/wheel/bet`): they are transactional and must be acknowledged.

## Payouts (batched, resumable)

`settleRound` (called by the 2-second worker, by hub ticks and by state reads) first **leases** the round (`leaseUntil`), then pays winners in batches of 100 players, each batch one short
transaction: mark the bets, credit the winner through the ledger with reference `win:<round>:<player>`, write the result row `rnd:<round>:<player>`. Anything already paid (reference exists)
is skipped, so an interrupted payout continues where it stopped and can never pay twice. Finally the `round.settled` webhook is queued with the fixed id `evt_round_<round>`, the round is marked settled and the hub is told.
Seamless wallets enqueue the credit as a stored operation instead (`modules/seamless`).

## Scaling out (read before running more than one server process)

The hub lives inside one process. With several processes behind a load balancer each one would serve the sockets connected to it and would learn about
bets placed through another process only when the round changes. Rounds, bets, payouts, wallets and webhooks are already multi-process safe (leases, unique references, locks);
to scale the live side out, put Redis pub/sub between the processes (publish `onBet`/`onSettled`, subscribe in each hub) or route all players of a room to the same process (sticky routing by room key).
Until then run **one** app process and scale it up (more CPU, a stronger MongoDB), see [`../operations/load-testing.md`](../operations/load-testing.md).

## Monitoring

`GET /api/metrics` (only when `METRICS_TOKEN` is set, sent as header `x-metrics-token`): CPU %, memory, event-loop delay and the hub's rooms/clients/tick times.
