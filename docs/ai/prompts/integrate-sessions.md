# Prompt: create play sessions from my backend

Copy everything below the line, replace the `<...>` parts, and paste it into your AI assistant together with `https://<our-host>/llms-full.txt`.

---

You are an expert backend developer. Read the attached MiniGame Studio integration playbook (llms-full.txt) completely first. Do not invent endpoints or fields.

**My stack:** `<for example: Node.js 20 with Express and PostgreSQL / Python 3.12 with Django / Java 17 with Spring Boot / PHP 8 with Laravel>`
**How my users log in:** `<for example: session cookie / JWT in the Authorization header / OAuth>`
**Where the user id and name are:** `<for example: req.user.id and req.user.name>`
**Game host:** `<https://our-host>` · **Game ID:** `<lic_...>` · the API key is in the environment variable `MINIGAME_API_KEY`.

**Task:** add ONE endpoint `POST /game-session` to my backend that:
1. requires my existing login (answer 401 when the caller is not logged in);
2. calls `POST <host>/api/v1/sessions` with `gameId`, `playerId` (my user id as a string), `displayName`, and `room: "auto"`;
3. returns the JSON answer's `playUrl` to my front-end;
4. handles errors: log our `code`, return a friendly 502/503 to the user, never expose the API key or our raw error to the browser;
5. has a timeout of 10 seconds and no retry on 4xx.

Then add the front-end part for `<web (iframe or the SDK) / Flutter WebView / Android / iOS>` that calls my endpoint when the player taps "Play" and shows the game. Handle the `exit` and `needCoins` events.

Rules: the API key stays on the server (environment variable). Create a new session every time the game is opened. Give me the complete code, where each file goes, the environment variables to set, and a 3-step test I can run.
