# Prompt: sell coins with the managed wallet (credit / debit)

Copy everything below the line, replace the `<...>` parts, and paste it into your AI assistant together with `https://<our-host>/llms-full.txt`.

---

You are an expert backend developer. Read the attached MiniGame Studio playbook (llms-full.txt) completely first. Do not invent endpoints or fields.

**My stack:** `<language, framework, database>` · **Game host:** `<https://our-host>` · **Game ID:** `<lic_...>` · API key in `MINIGAME_API_KEY`.
**My coin purchase flow:** `<for example: Stripe webhook "payment_intent.succeeded" creates an Order row; 1 EUR = 1000 coins>`
**My cash-out flow:** `<for example: admin approves a payout request, then I remove the coins>` (or "none")

The game is switched to *Managed by my server* in the dashboard.

**Task:** implement in my backend:
1. `creditCoins(userId, amount, orderId)`: calls `POST /api/v1/games/{gameId}/players/{userId}/credit` with `reference = "order-" + orderId`. It must be **idempotent and retry-safe**: retry up to 5 times with growing pauses on network errors and 5xx **using the same reference**; do not retry other 4xx; treat `duplicate: true` as success. Call it only after my payment is confirmed. Store the returned `transactionId` with my order.
2. `debitCoins(userId, amount, payoutId)` for cash-outs, with `reference = "payout-" + payoutId`; handle `402 insufficient_balance` (show the player's real balance from the error) and `409 reference_conflict`.
3. A function that reads the player's balance and history (`GET .../players/{id}` and `.../transactions`) for my admin screen, with paging via `nextBefore`.
4. Handling for the game's `needCoins` event on my front-end: open my coin shop.
5. Unit tests with a fake of the HTTP calls proving: the same order is never credited twice; a timeout then success credits once; `402` moves nothing.

Rules: `amount` is a whole number (no decimals, no strings). `reference` must be unique per operation and **stable across retries** (derive it from my order/payout id, never from a random value generated per attempt). Log failures with our `code`.
