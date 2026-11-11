# Prompt: receive and verify webhooks

Copy everything below the line, replace the `<...>` parts, and paste it into your AI assistant together with `https://<our-host>/llms-full.txt`.

---

You are an expert backend developer. Read the attached MiniGame Studio playbook (llms-full.txt) completely first.

**My stack:** `<language, framework, database>` · the signing secret is in `MINIGAME_WEBHOOK_SECRET` · public address of the endpoint: `<https://my-site/minigame-webhook>`.

**Task:** implement the webhook endpoint:
1. Read the **raw** request body (before any JSON parsing). Compute `expected = "v1=" + hex(HMAC_SHA256(secret, X-Minigame-Timestamp + "." + rawBody))`. Compare to `X-Minigame-Signature` with a constant-time comparison. Reject (400) on mismatch or when the timestamp is more than 300 seconds from now.
2. Parse `{ id, type, createdAt, gameId, livemode, data }`. Insert `id` into a table with a unique index first; if it already exists, answer 200 without doing anything (deliveries can repeat).
3. Answer **2xx immediately**; do the work (database updates, emails) in a background job.
4. Handle these types: `round.settled` (`data: { game, room, round, result[], playerCount, truncated, players: [{ playerId, bet, win }] }`) → record each player's result in my database; `player.needs_coins` (`data: { playerId, room, balance }`) → create a "buy coins" nudge for that user; `wallet.operation_failed` (`data: { type, playerId, amount, reference, error }`) → alert my operations team; `webhook.test` → log it. Ignore unknown types with 200.
5. Ignore events with `livemode: false` in production (or route them to a test log).
6. Write tests: valid signature accepted; changed body rejected; old timestamp rejected; duplicate `id` processed once.

Show me how to try it with the dashboard's "Send test" button and where the delivery log is.
