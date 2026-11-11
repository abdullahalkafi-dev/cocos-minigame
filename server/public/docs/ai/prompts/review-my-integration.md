# Prompt: review an integration I already wrote

Copy everything below the line and paste it into your AI assistant together with `https://<our-host>/llms-full.txt` and your code.

---

You are a careful senior reviewer. Read the attached MiniGame Studio playbook (llms-full.txt) completely. Then review the code I attach (my session endpoint, wallet calls, webhook receiver, front-end embedding).

Check each item and answer **PASS / FAIL / NOT APPLICABLE** with the exact file and line for every FAIL and a corrected snippet:

1. The API key is only on the server (environment variable); not in front-end code, mobile app, repository, logs or URLs.
2. The session endpoint checks my own login before asking for a session; one new session per game open; `playUrl` is never cached for long or shared between players.
3. `playerId` is a stable id (same person → same id), allowed characters only, never a secret.
4. Every `credit`/`debit` has a `reference` that is unique per operation and **stable across retries**; retries only on network errors and 5xx; `duplicate: true` treated as success; `402`, `409 reference_conflict`, `409 wallet_not_enabled` handled.
5. Amounts are whole numbers.
6. Webhook: signature verified on the **raw** body with a constant-time comparison; timestamp checked (≤ 5 minutes); `id` deduplicated; answers 2xx quickly; unknown event types ignored; `livemode` respected.
7. Seamless wallet (if used): signature verified; `reference` idempotency with a unique index; `debit` atomic with a balance check; `rollback` only undoes an applied debit; answers within 5 seconds.
8. The front-end handles `exit` and `needCoins`; the WebView/iframe allows autoplay and fullscreen.
9. Errors are logged with our `code`; users never see raw errors.
10. Live vs test: the right key for the right game (`wrong_environment`).

End with the three most important fixes in priority order.
