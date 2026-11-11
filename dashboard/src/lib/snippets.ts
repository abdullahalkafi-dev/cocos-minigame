// Code samples shown in the dashboard (pre-filled with the game's ID). The public docs page carries the same samples.
export interface Snip { label: string; lang: string; code: string }

export function serverSnippets(host: string, gameId: string): Record<string, Snip> {
  return {
    node: { label: 'Node.js', lang: 'js', code: `// Node 18+ (Express). Runs on YOUR server; the API key stays in an environment variable.
import express from 'express';
const app = express();

app.post('/game-session', async (req, res) => {
  const r = await fetch('${host}/api/v1/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MINIGAME_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: '${gameId}',
      username: req.user?.username,          // optional: skips the username screen
    }),
  });
  res.status(r.status).json(await r.json());  // { playUrl, sessionToken, expiresIn, gameId, game }
});

app.listen(3000);` },
    python: { label: 'Python', lang: 'py', code: `# pip install flask requests
import os, requests
from flask import Flask, jsonify

app = Flask(__name__)
API = "${host}"

@app.post("/game-session")
def game_session():
    payload = {"gameId": "${gameId}"}          # add "username": current_user.name to skip the username screen
    r = requests.post(
        API + "/api/v1/sessions",
        headers={"Authorization": "Bearer " + os.environ["MINIGAME_API_KEY"]},
        json=payload,
        timeout=10,
    )
    return jsonify(r.json()), r.status_code   # {"playUrl": ..., "expiresIn": 900, ...}` },
    java: { label: 'Java', lang: 'java', code: `// Java 11+, no extra libraries.
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class MiniGameClient {
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final String API = "${host}";
    private static final String GAME_ID = "${gameId}";

    /** Returns the JSON answer ({"playUrl": "...", ...}). Hand it to your front-end unchanged. */
    public static String createSession(String username) throws Exception {
        // username is optional (3-20 chars: letters, digits, _ . -). Anything else is ignored.
        boolean ok = username != null && username.matches("[A-Za-z0-9_.-]{3,20}");
        String body = ok ? "{\\"gameId\\":\\"" + GAME_ID + "\\",\\"username\\":\\"" + username + "\\"}"
                         : "{\\"gameId\\":\\"" + GAME_ID + "\\"}";
        HttpRequest req = HttpRequest.newBuilder(URI.create(API + "/api/v1/sessions"))
            .header("Authorization", "Bearer " + System.getenv("MINIGAME_API_KEY"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        return HTTP.send(req, HttpResponse.BodyHandlers.ofString()).body();
    }
}

// Spring Boot controller using it:
// @RestController
// class GameController {
//     @PostMapping(value = "/game-session", produces = "application/json")
//     String session(java.security.Principal user) throws Exception {
//         return MiniGameClient.createSession(user == null ? null : user.getName());
//     }
// }` },
    php: { label: 'PHP', lang: 'php', code: `<?php
// Runs on YOUR server. Keep the key in an environment variable.
$ch = curl_init('${host}/api/v1/sessions');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('MINIGAME_API_KEY'), 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['gameId' => '${gameId}', 'username' => $currentUser ?? null]),
]);
header('Content-Type: application/json');
echo curl_exec($ch); // { playUrl, sessionToken, expiresIn, gameId, game }` },
    curl: { label: 'cURL', lang: 'sh', code: `curl -X POST ${host}/api/v1/sessions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"gameId":"${gameId}","username":"optional_player_name"}'` },
  };
}

export function clientSnippets(host: string): Record<string, Snip> {
  return {
    web: { label: 'Website (JS SDK)', lang: 'html', code: `<div id="game" style="width:100%;max-width:480px;height:760px"></div>
<script src="${host}/sdk/minigames.js"></script>
<script>
  // "/game-session" is the endpoint YOU created above (it holds the secret API key)
  MiniGames.mount('#game', {
    sessionEndpoint: '/game-session',
    onEvent: (e) => console.log(e.type, e.data),   // login, ready, round, exit
  });
</script>` },
    iframe: { label: 'Plain iframe', lang: 'html', code: `<!-- playUrl is the value your server received from the API -->
<iframe src="PLAY_URL_FROM_YOUR_SERVER" width="480" height="760"
        style="border:0" allow="autoplay; fullscreen"></iframe>` },
    flutter: { label: 'Flutter', lang: 'dart', code: `// pubspec.yaml: webview_flutter: ^4.9.0, http: ^1.2.0
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:webview_flutter/webview_flutter.dart';

Future<WebViewController> openGame() async {
  // Call YOUR backend (it holds the API key). Never put the key inside the app.
  final res = await http.post(Uri.parse('https://your-backend.com/game-session'));
  final playUrl = jsonDecode(res.body)['playUrl'] as String;

  return WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..addJavaScriptChannel('MiniGames', onMessageReceived: (m) {
      // JSON events from the game: {"type":"round","data":{...}}
      print('game event: \${m.message}');
    })
    ..loadRequest(Uri.parse(playUrl));
}` },
    react: { label: 'React', lang: 'jsx', code: `import { useEffect, useRef } from 'react';

export function Game() {
  const box = useRef(null);
  useEffect(() => {
    const g = window.MiniGames.mount(box.current, { sessionEndpoint: '/game-session' });
    return () => g.destroy();
  }, []);
  return <div ref={box} style={{ width: '100%', maxWidth: 480, height: 760 }} />;
}
// add <script src="${host}/sdk/minigames.js"></script> to your index.html` },
  };
}
