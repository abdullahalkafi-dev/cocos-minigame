# Load testing: what one server process measured

Numbers below were **measured**, not estimated. Read the "what this does and does not tell you" section before quoting them to anybody.

## Method

`npm run loadtest -w server -- --players 5000 --seconds 70 --bet-rate 0.3` (script: `server/src/scripts/loadtest.ts`).

1. Starts a throw-away MongoDB **replica set** and runs the **real server as a child process** (so CPU and memory are the server's own).
2. Creates N players directly in the database (managed wallet, plenty of coins), one game, the default room.
3. Opens N bot **WebSocket** connections (authenticated like a real game), in waves of 250.
4. Every round (20 s betting, 6 s spin, 6 s result), each bot bets with probability 0.3 (a random time inside the betting window, a real HTTP `POST /api/play/wheel/bet`, which is a database transaction).
5. Samples the server's `/api/metrics` every 2 seconds for 70 seconds (two full rounds) and reports what the players experienced.

Test machine: Windows 11, 12 logical cores, local MongoDB, **bots and server on the same machine** (the bots also use CPU). Redis: in-memory cache (single process).

## Results (default round timing, 30% of players bet each round)

| Players connected | Dropped | State push latency p50 / p95 | Bet latency p50 / p95 / p99 | Winners shown after spin end (p95) | Server CPU avg / max | Event-loop delay p95 | Memory |
|---|---|---|---|---|---|---|---|
| 1,000 | 0 | 10 / 21 ms | 33 / 45 / 53 ms | 1.1 s | 11% / 36% | 28 ms | 189 MB |
| 5,000 | 0 | 49 / 96 ms | 33 / 146 / 241 ms | 2.7 s | 35% / 78% | 29 ms | 322 MB |
| 10,000 | 43 of 10,000 failed to connect | 96 / 185 ms | 48 / 331 / 464 ms | 5.9 s | 64% / 97% | 36 ms | 434 MB |

(CPU is a share of one core: 97% means one core was almost saturated, which is the single-process ceiling.)
Each player received about one state message per second (11,540 messages per second at 10,000 players) and all 8,911 bets at 10,000 players were accepted (40 failed with network errors caused by the test machine's connection limits).

## How to read this

- **What it shows:** with MongoDB close by, **one Node.js process serves about 10,000 connected players with about 3,000 bets per round**, with state updates under 0.2 s and bets under 0.5 s. 5,000 players use about a third of one core. 10,000 is near the ceiling of one process.
- **What it does not show:**
  - Production uses **MongoDB Atlas over the network**: every bet is a transaction (debit, ledger entry, bet). A small Atlas tier (free M0, shared M2/M5) is throttled and will be the first limit; use a dedicated tier (M10+) for thousands of betting players. Latency to Atlas adds directly to each bet.
  - Real players' phones have slower, less stable connections than local sockets.
  - All bots sat in one room. Many small rooms cost slightly more per player (one computation per room per second) but spread bets.
  - 30% betting per round is a guess; a bet rate of 100% triples the database load.
- **Scale beyond one process:** the live hub is in-process (see [architecture/realtime.md](../architecture/realtime.md)); add Redis pub/sub or sticky routing per room first.

## A bug this test found

The first run showed dropped connections and bet latency of seconds even at 1,000 players: every new connection made the server re-send the state to *everybody already in the room*, which costs N x N messages while players join. Joins now send the newcomer only. The same test after the fix is the table above.

## Running it yourself

```bash
npm run loadtest -w server -- --players 1000 --seconds 70 --bet-rate 0.3
# results are printed and saved to tmp/loadtest-<players>.json
```

Do not run it against production (it creates its own database and server). Close heavy programs first: the bots and the server share the machine.
