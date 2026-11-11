# Data model

MongoDB, one Mongoose model per collection, defined next to the module that owns it. Documents use string `_id`s with a readable prefix.

| Collection | Module | Purpose | Key fields | Indexes |
|---|---|---|---|---|
| `users` | users | A buyer (dashboard account) | `email`, `passSalt/passHash` (scrypt), `balance` (demo credits), `apiKeyHash`, `apiKeyPrefix`, `webhookUrl`, `webhookSecret` | unique `email`; unique sparse `apiKeyHash` |
| `wallettxes` | users | History of the buyer's demo credits | `userId`, `delta`, `reason` | `userId` |
| `games` | games | A game the buyer owns. `_id` is the public **game ID** (`lic_...`) | `userId`, `slug`, `name`, `config` (only the buyer's changes), `allowedOrigins`, `status`, `guestLogin` (default false), `walletMode` (`demo` or `managed`) | `userId` |
| `players` | players | An end player **inside one game** | `gameId`, `externalId` (the client's id for the person), `displayName`, `balance`, `isPreview` | unique `(gameId, externalId)`; `(gameId, lastSeen)` |
| `ledgers` | ledger | Immutable record of every balance change | `gameId`, `playerId`, `delta`, `balanceAfter`, `kind` (`starting`, `refill`, `bet`, `win`, `credit`, `debit`), `reference` | `(playerId, _id desc)`; unique partial `(gameId, reference)` |
| `results` | results | One player's result in one finished round, read by the dashboard | `gameId`, `playerId`, `bet`, `win`, `outcome`, `isPreview` | `(gameId, isPreview, createdAt desc)`; `playerId` |
| `wheelrounds` | lucky-wheel | One round of the shared clock | `gameId`, `no`, times, `resultTarget`, `segment`, `extra`, `snapshot`, `settled` | unique `(gameId, no desc)`; `(settled, spinEnd)` |
| `webhookevents` | webhooks | An outbox of notifications to send; kept until delivered or given up | `userId`, `type`, `payload`, `status`, `attempts`, `nextAttemptAt` | `(status, nextAttemptAt)`; `(userId, createdAt desc)` |
| `wheelbets` | lucky-wheel | A bet placed in a round | `gameId`, `roundId`, `playerId`, `target`, `amount`, `win`, `settled` | `(roundId, playerId)`; `(playerId, _id desc)`; `(gameId, settled, playerId)` |

## Relationships

```
user 1──* game 1──* player 1──* ledger entry
                │        └────* result / wheel bet
                └──* wheel round 1──* wheel bet
```

A **player belongs to one game**, not to the account: the same person in two of the buyer's games is two players with two balances. `externalId` is whatever identifier the buyer's own system uses (or the username typed in guest mode); we never see passwords.

## Rules that must hold

1. **Money moves only through `ledger.post`**, inside a transaction. Never update `players.balance` directly.
2. `players.balance` equals the sum of that player's ledger `delta`s. (Tests assert it.)
3. A round is settled once: `wheelrounds.settled` flips from false to true inside the paying transaction.
4. A `reference` is unique per game. Reusing it is how a caller makes a money operation idempotent: the wallet API answers a repeated reference with the original result and rejects a reused one with `reference_conflict`.
   Wallet mode: with `walletMode: managed` new players start at 0 and only the wallet API (and the game's own bets and wins) move coins; with `demo` they get the starting balance and a free refill.
5. Preview players (created from the dashboard preview) are flagged `isPreview` and excluded from statistics, rankings and the players list.
6. `games.config` stores **only the buyer's overrides**; defaults come from the catalog and are merged at read time, so improving a default improves every game that did not override it.

## Why transactions

Placing a bet debits the balance, writes a ledger entry and inserts the bet; settling a round claims it, credits every winner and writes the results. Each of those must succeed or fail as one unit, which is why MongoDB must run as a replica set (Atlas does; the tests start an in-memory replica set).
