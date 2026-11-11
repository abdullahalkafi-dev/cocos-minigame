# Wallets: who holds the coins

Each game has a **wallet mode** (`games.walletMode`), chosen by the buyer in the dashboard.

| Mode | Balance lives in | New player starts with | How coins change | Free refill |
|---|---|---|---|---|
| `demo` | our database | the configured starting balance | bets/wins only | yes |
| `managed` | our database | 0 | the buyer's server calls `credit`/`debit`; bets/wins | no |
| `seamless` | **the buyer's system** | whatever their system says | we ask their endpoint for every stake and win | no |

## demo and managed (we hold the balance)

All movements go through `ledger.post(entry, session)` inside a MongoDB transaction: an atomic balance change that refuses to go below zero, plus an immutable ledger entry.
The balance always equals the sum of the player's entries (tests assert this). The wallet API (`modules/wallet`) is idempotent by `reference`: the first call moves coins, repeats
return the stored result (`duplicate: true`), a reused reference for a different operation is `409 reference_conflict`. After a change `bus.emit('balance', playerId, balance)` lets the live hub show it at once.

## seamless (the buyer holds the balance)

`modules/seamless` sends signed requests (same HMAC scheme as webhooks, same secret) to **one address per account**: `ping`, `balance`, `debit`, `credit`, `rollback`, each with a `reference` the buyer must treat as an idempotency key.

- **Bet:** check the room limit → `debit` (synchronous, 5 s timeout) → store the bet and a ledger entry (with the balance the buyer reported) → done. `402` from the buyer = `insufficient_balance` (bet refused, buyer notified once with `player.needs_coins`). Other 4xx = refused (502). 5xx/timeout = *unknown*: we store a `rollback` operation (retried until acknowledged) and answer 503 `wallet_unavailable`. If storing the bet fails after a successful debit, we also roll back.
- **Win:** inside the payout transaction a `credit` operation is stored (`_id` = the payment reference, so it is created once). The worker sends it; retries after 5 s, 30 s, 2 min, 10 min, 30 min, 2 h, 6 h, 12 h; success records the ledger entry and mirrors the balance; after the last failure the operation is `failed` and the buyer gets a `wallet.operation_failed` webhook.
- **Balance:** asked when a game opens (3 s timeout) and learned from every debit/credit answer. `players.balance` is a **mirror** of the buyer's number, not a source of truth; the ledger-equals-balance rule applies to demo/managed only.
- The buyer's `rollback` must be a no-op for a debit it never applied, and must make a *later* arrival of that debit a no-op too (documented in the public guide and `docs/ai/prompts/integrate-seamless-wallet.md`).

## Choosing

Start with `demo` to try, use `managed` when the buyer can call our API after a sale (simplest, strongest guarantees: we can reconcile with the ledger), use `seamless` when
the money must not leave the buyer's database. The wheel code is identical in all three: only `placeBets` and `settleRound` branch on the mode.

## Test vs live

A game has `mode: live | test`. The test API key (`mgs_test_…`) only opens test games and the live key only live games (`403 wrong_environment`). Webhooks and seamless requests carry `livemode`.
