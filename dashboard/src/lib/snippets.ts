// Code samples shown in the dashboard (pre-filled with the game's ID). The public docs page carries the same samples.
export interface Snip { label: string; lang: string; code: string }

/** Step 1: your server asks for a play session and says WHO the player is. */
export function serverSnippets(host: string, gameId: string): Record<string, Snip> {
  return {
    node: { label: 'Node.js', lang: 'js', code: `// Node 18+ (Express). Runs on YOUR server; the API key stays in an environment variable.
import express from 'express';
const app = express();

app.post('/game-session', async (req, res) => {
  // YOUR login system decides who this is. We trust the id because only your server can send it.
  const user = req.user;                       // e.g. from your session cookie or JWT
  if (!user) return res.status(401).end();

  const r = await fetch('${host}/api/v1/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MINIGAME_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: '${gameId}',
      playerId: String(user.id),               // your own id for this person (1-64 chars: letters, digits, _ . : @ -)
      displayName: user.name,                  // optional: shown in rankings and winner lists
    }),
  });
  res.status(r.status).json(await r.json());   // { playUrl, sessionToken, expiresIn, gameId, game, playerId }
});

app.listen(3000);` },
    python: { label: 'Python', lang: 'py', code: `# pip install flask requests
import os, requests
from flask import Flask, jsonify

app = Flask(__name__)
API = "${host}"

@app.post("/game-session")
def game_session():
    user = current_user()                       # YOUR login system decides who this is
    r = requests.post(
        API + "/api/v1/sessions",
        headers={"Authorization": "Bearer " + os.environ["MINIGAME_API_KEY"]},
        json={
            "gameId": "${gameId}",
            "playerId": str(user.id),           # your own id for this person
            "displayName": user.name,           # optional
        },
        timeout=10,
    )
    return jsonify(r.json()), r.status_code    # {"playUrl": ..., "expiresIn": 900, ...}` },
    java: { label: 'Java', lang: 'java', code: `// Java 17+, no extra libraries.
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class MiniGameClient {
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final String API = "${host}";
    private static final String GAME_ID = "${gameId}";

    private static String json(String s) { return "\\"" + s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\""; }

    /** Returns the JSON answer ({"playUrl": "...", ...}). Hand it to your front-end unchanged. */
    public static String createSession(String playerId, String displayName) throws Exception {
        // playerId: YOUR id for this person (1-64 chars: letters, digits, _ . : @ -)
        String body = "{\\"gameId\\":" + json(GAME_ID) + ",\\"playerId\\":" + json(playerId)
                    + ",\\"displayName\\":" + json(displayName) + "}";
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
//         return MiniGameClient.createSession(user.getName(), user.getName());
//     }
// }` },
    php: { label: 'PHP', lang: 'php', code: `<?php
// Runs on YOUR server. Keep the key in an environment variable.
$user = current_user();   // YOUR login system decides who this is
$ch = curl_init('${host}/api/v1/sessions');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('MINIGAME_API_KEY'), 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['gameId' => '${gameId}', 'playerId' => (string)$user->id, 'displayName' => $user->name]),
]);
header('Content-Type: application/json');
echo curl_exec($ch); // { playUrl, sessionToken, expiresIn, gameId, game, playerId }` },
    curl: { label: 'cURL', lang: 'sh', code: `curl -X POST ${host}/api/v1/sessions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"gameId":"${gameId}","playerId":"user-8841","displayName":"Maria"}'` },
  };
}

/** Step 3 (managed wallet): your server adds coins after a sale and removes them for a cash-out. */
export function walletSnippets(host: string, gameId: string): Record<string, Snip> {
  const base = `${host}/api/v1/games/${gameId}/players/user-8841`;
  return {
    curl: { label: 'cURL', lang: 'sh', code: `# Add coins after the player bought them in YOUR system. "reference" makes a retry safe:
# the same reference always gives the same answer and never moves coins twice.
curl -X POST ${base}/credit \\
  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\
  -d '{"amount":100000,"reference":"order-1001","note":"bought 100k coins"}'
# -> {"playerId":"user-8841","balance":100000,"transactionId":"...","duplicate":false}

# Remove coins (cash-out). 402 insufficient_balance when the player has less.
curl -X POST ${base}/debit \\
  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \\
  -d '{"amount":40000,"reference":"cashout-77"}'

# Balance and history
curl ${base} -H "Authorization: Bearer YOUR_API_KEY"
curl "${base}/transactions?limit=20" -H "Authorization: Bearer YOUR_API_KEY"` },
    node: { label: 'Node.js', lang: 'js', code: `// Call this from your own order flow, after the payment succeeded.
async function creditCoins(userId, amount, orderId) {
  const r = await fetch('${host}/api/v1/games/${gameId}/players/' + encodeURIComponent(userId) + '/credit', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MINIGAME_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, reference: 'order-' + orderId }),   // same reference = safe to retry
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.code + ': ' + body.error);          // e.g. wallet_not_enabled, invalid_amount
  return body.balance;
}` },
    python: { label: 'Python', lang: 'py', code: `import os, requests

def credit_coins(user_id, amount, order_id):
    r = requests.post(
        "${host}/api/v1/games/${gameId}/players/" + str(user_id) + "/credit",
        headers={"Authorization": "Bearer " + os.environ["MINIGAME_API_KEY"]},
        json={"amount": amount, "reference": f"order-{order_id}"},   # same reference = safe to retry
        timeout=10,
    )
    body = r.json()
    if not r.ok:
        raise RuntimeError(body["code"] + ": " + body["error"])
    return body["balance"]` },
  };
}

/** Rooms and leaderboards. */
export function roomSnippets(host: string, gameId: string): Record<string, Snip> {
  return {
    curl: { label: 'cURL', lang: 'sh', code: `# Create a room (a VIP table with its own chips and a limit of 20 players)
curl -X POST ${host}/api/v1/games/${gameId}/rooms \
  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \
  -d '{"key":"vip","name":"VIP table","capacity":20,"auto":false,"overrides":{"chips":[100000,500000,1000000],"maxPerTarget":2000000}}'

# Put a player in a room: "auto" (default: the first room with space) or a room key
curl -X POST ${host}/api/v1/sessions \
  -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" \
  -d '{"gameId":"${gameId}","playerId":"user-8841","room":"vip"}'

# Rooms with the number of players online (for your own lobby screen)
curl ${host}/api/v1/games/${gameId}/rooms -H "Authorization: Bearer YOUR_API_KEY"

# A ranking for your app: period = day | week | month | all, metric = winnings | net | wagered | biggest_win
curl "${host}/api/v1/games/${gameId}/leaderboard?room=vip&period=week&metric=winnings&limit=10&playerId=user-8841" \
  -H "Authorization: Bearer YOUR_API_KEY"` },
  };
}

/** The endpoint YOU implement for the seamless wallet. */
export function seamlessSnippets(): Record<string, Snip> {
  return {
    node: { label: 'Node.js', lang: 'js', code: `import crypto from 'node:crypto';
import express from 'express';
const app = express();

// One address receives every wallet request: ping, balance, debit (a stake), credit (a win), rollback.
app.post('/minigame-wallet', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. verify the signature (same as webhooks) on the RAW body
  const ts = req.header('X-Minigame-Timestamp');
  const expected = 'v1=' + crypto.createHmac('sha256', process.env.MINIGAME_WEBHOOK_SECRET).update(ts + '.' + req.body.toString('utf8')).digest('hex');
  if (req.header('X-Minigame-Signature') !== expected) return res.status(400).end();

  const m = JSON.parse(req.body.toString('utf8'));   // { type, gameId, livemode, playerId, amount, reference, note }
  if (m.type === 'ping') return res.json({ ok: true });

  // 2. "reference" is an idempotency key: if you already handled it, answer exactly the same again
  const done = await db.findOperation(m.reference);
  if (done && m.type !== 'rollback') return res.json({ balance: done.balanceAfter });

  if (m.type === 'balance') return res.json({ balance: await db.balance(m.playerId) });
  if (m.type === 'debit') {
    const balance = await db.debitIfEnough(m.playerId, m.amount, m.reference);   // atomic
    if (balance === null) return res.status(402).json({ code: 'insufficient_balance' });
    return res.json({ balance });
  }
  if (m.type === 'credit') return res.json({ balance: await db.credit(m.playerId, m.amount, m.reference) });
  if (m.type === 'rollback') return res.json({ balance: await db.undoDebitIfApplied(m.playerId, m.reference) });   // does nothing if that debit never happened
  res.status(400).json({ code: 'unknown_type' });
});` },
  };
}

/** Step 4: verify the signature of notifications sent to your server. */
export function webhookSnippets(): Record<string, Snip> {
  return {
    node: { label: 'Node.js', lang: 'js', code: `import crypto from 'node:crypto';
import express from 'express';
const app = express();

// IMPORTANT: verify the RAW body, so do not parse it as JSON before checking the signature.
app.post('/minigame-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const ts = req.header('X-Minigame-Timestamp');
  const expected = 'v1=' + crypto.createHmac('sha256', process.env.MINIGAME_WEBHOOK_SECRET)
    .update(ts + '.' + req.body.toString('utf8')).digest('hex');
  const given = req.header('X-Minigame-Signature') || '';
  const ok = given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).end();   // bad signature or too old

  const event = JSON.parse(req.body.toString('utf8'));   // { id, type, createdAt, gameId, data }
  // event.id is unique: store it and skip repeats (a delivery can arrive more than once)
  if (event.type === 'round.settled') console.log('round', event.data.round, event.data.players);
  res.status(200).end();                                  // any 2xx means "received"
});` },
    python: { label: 'Python', lang: 'py', code: `import hashlib, hmac, os, time
from flask import Flask, request

app = Flask(__name__)

@app.post("/minigame-webhook")
def minigame_webhook():
    raw = request.get_data()                       # the RAW body, exactly as received
    ts = request.headers.get("X-Minigame-Timestamp", "")
    expected = "v1=" + hmac.new(os.environ["MINIGAME_WEBHOOK_SECRET"].encode(),
                                ts.encode() + b"." + raw, hashlib.sha256).hexdigest()
    given = request.headers.get("X-Minigame-Signature", "")
    if not hmac.compare_digest(given, expected) or abs(time.time() - int(ts or 0)) > 300:
        return "", 400
    event = request.get_json()                     # { id, type, createdAt, gameId, data }
    # event["id"] is unique: store it and skip repeats
    return "", 200` },
    java: { label: 'Java', lang: 'java', code: `// Java 17+. Works in any framework: you only need the RAW body, the two headers and your secret.
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public class MiniGameWebhook {
    public static boolean verify(String secret, String timestamp, String rawBody, String signatureHeader) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String expected = "v1=" + HexFormat.of().formatHex(mac.doFinal((timestamp + "." + rawBody).getBytes(StandardCharsets.UTF_8)));
        boolean fresh = Math.abs(System.currentTimeMillis() / 1000 - Long.parseLong(timestamp)) <= 300;
        return fresh && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signatureHeader.getBytes(StandardCharsets.UTF_8));
    }
}` },
    php: { label: 'PHP', lang: 'php', code: `<?php
$raw = file_get_contents('php://input');                         // the RAW body
$ts = $_SERVER['HTTP_X_MINIGAME_TIMESTAMP'] ?? '';
$given = $_SERVER['HTTP_X_MINIGAME_SIGNATURE'] ?? '';
$expected = 'v1=' . hash_hmac('sha256', $ts . '.' . $raw, getenv('MINIGAME_WEBHOOK_SECRET'));
if (!hash_equals($expected, $given) || abs(time() - (int)$ts) > 300) { http_response_code(400); exit; }

$event = json_decode($raw, true);   // id, type, createdAt, gameId, data
// $event['id'] is unique: store it and skip repeats
http_response_code(200);` },
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

Future<WebViewController> openGame(String userToken) async {
  // Call YOUR backend (it knows who is logged in and holds the API key). Never put the key inside the app.
  final res = await http.post(Uri.parse('https://your-backend.com/game-session'),
      headers: {'Authorization': 'Bearer ' + userToken});
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
