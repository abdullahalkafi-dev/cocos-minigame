# Prompt: rooms, a lobby and leaderboards

Copy everything below the line, replace the `<...>` parts, and paste it into your AI assistant together with `https://<our-host>/llms-full.txt`.

---

You are an expert full-stack developer. Read the attached MiniGame Studio playbook (llms-full.txt) completely first.

**My stack:** `<backend + front-end>` · **Game host:** `<https://our-host>` · **Game ID:** `<lic_...>` · API key in `MINIGAME_API_KEY`.
**What I want:** `<for example: a beginner table (chips 1k-10k, up to 50 players, auto-placed) and a VIP table (chips 100k-1M, up to 20 players, chosen from a lobby); a weekly top-10 ranking screen>`

**Task:**
1. A one-time script that creates my rooms with `POST /api/v1/games/{gameId}/rooms` (key, name, `capacity`, `auto`, `overrides: { chips, maxPerTarget, timing }`) and is safe to run again (`409 room_exists` is fine).
2. A lobby endpoint that returns `GET /api/v1/games/{gameId}/rooms` to my front-end (names, `online`, `capacity`) and a lobby screen where the player picks a room.
3. Extend my `/game-session` endpoint to accept a room key and pass it as `room` (default `"auto"`). Handle `409 room_full` by showing "Table is full, pick another" and `409 no_room_available` by retrying later.
4. A ranking screen using `GET /api/v1/games/{gameId}/leaderboard?period=week&metric=winnings&limit=10&playerId=<current user>`; show the list and the current player's own `me.rank` when they are not in the top 10. Cache the answer on my side for 5 seconds.

Notes you must respect: capacity is a *soft* limit; "auto" fills the first room with space and opens a copy when all are full; a room can only be deleted when empty (`409 room_busy`); the `main` room cannot be deleted.
