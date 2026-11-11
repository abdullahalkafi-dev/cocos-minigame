# Prompt: keep the coins in my own system (seamless wallet)

Copy everything below the line, replace the `<...>` parts, and paste it into your AI assistant together with `https://<our-host>/llms-full.txt`.

---

You are an expert backend developer. Read the attached MiniGame Studio playbook (llms-full.txt) completely first.

**My stack:** `<language, framework, database>` · my coin balances live in `<table/collection>` · player id = my user id.
The webhook signing secret is in `MINIGAME_WEBHOOK_SECRET`. The game is switched to *Seamless (my wallet)* and my endpoint address is saved on the dashboard page "API key & webhooks".

**Protocol you must implement (one HTTPS endpoint, POST, JSON):**

Request headers: `X-Minigame-Event` (`wallet.<type>`), `X-Minigame-Delivery` (= `reference`), `X-Minigame-Timestamp` (unix seconds), `X-Minigame-Signature` (`v1=` + lowercase hex of HMAC-SHA256(secret, `<timestamp>.<raw body>`)).
Request body: `{ "type": "ping|balance|debit|credit|rollback", "gameId": "lic_...", "livemode": true, "playerId": "<my user id>", "amount": 30000, "reference": "<unique>", "note": "Round 1042" }`.

| type | what you do | answer |
|---|---|---|
| `ping` | nothing | `200 {"ok":true}` |
| `balance` | read the player's balance | `200 {"balance": <integer>}` |
| `debit` | take `amount` from the player **atomically, only if enough** | `200 {"balance": <new balance>}`; not enough: `402 {"code":"insufficient_balance"}` |
| `credit` | add `amount` (a win) | `200 {"balance": <new balance>}` |
| `rollback` | undo the debit with the same `reference` **only if you applied it**; otherwise do nothing and remember that this debit must never be applied later | `200 {"balance": <balance>}` |

**Idempotency (critical):** store every handled `reference`. If a `debit` or `credit` arrives again with a known `reference`, answer **exactly the same as the first time** and change nothing. Use a unique index on `reference` and a database transaction so two simultaneous identical requests cannot both apply.
**Errors:** other 4xx = "refused for good"; 5xx or no answer within 5 seconds = "unknown": we will send a `rollback` and retry credits for about a day, so your handlers must be safe to repeat.

**Task:**
1. Implement the endpoint (verify the signature on the raw body, reject timestamps older than 5 minutes with 400).
2. Implement `debitIfEnough` atomically (for SQL: `UPDATE ... SET balance = balance - :a WHERE id = :id AND balance >= :a`; check affected rows).
3. Implement the idempotency table and the rollback rule above.
4. Write tests: duplicate debit applies once; concurrent identical debits apply once; debit with too little money returns 402 and changes nothing; rollback of an unknown reference changes nothing and a later debit with that reference is refused or ignored; bad signature returns 400.
5. Tell me how to try it with the dashboard's "Send test" button for the wallet address.
