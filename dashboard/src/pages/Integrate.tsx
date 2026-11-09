import { useState } from 'react';
import { copy } from '../api';
import { useApp } from '../App';

export function Snippets({ baseUrl }: { baseUrl: string }) {
  const { toast } = useApp();
  const [tab, setTab] = useState('node');
  const B = baseUrl;

  const server: Record<string, { label: string; lang: string; code: string }> = {
    node: { label: 'Node.js', lang: 'js', code: `// Runs on YOUR server. Keep the key in an environment variable.
app.post('/game-session', async (req, res) => {
  const r = await fetch('${B}/api/v1/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MINIGAME_KEY, 'Content-Type': 'application/json' },
    // username is optional: pass your logged-in user's name to skip the username screen
    body: JSON.stringify({ username: req.user?.username }),
  });
  res.json(await r.json()); // { playUrl, sessionToken, expiresIn }
});` },
    php: { label: 'PHP', lang: 'php', code: `<?php
// Runs on YOUR server. Keep the key in an environment variable.
$ch = curl_init('${B}/api/v1/sessions');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('MINIGAME_KEY'), 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['username' => $currentUser ?? null]),
]);
header('Content-Type: application/json');
echo curl_exec($ch); // { playUrl, sessionToken, expiresIn }` },
    python: { label: 'Python', lang: 'py', code: `import os, requests

# Runs on YOUR server. Keep the key in an environment variable.
def create_game_session(username=None):
    r = requests.post(
        "${B}/api/v1/sessions",
        headers={"Authorization": "Bearer " + os.environ["MINIGAME_KEY"]},
        json={"username": username} if username else {},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()  # {"playUrl": ..., "sessionToken": ..., "expiresIn": 900}` },
    curl: { label: 'cURL', lang: 'sh', code: `curl -X POST ${B}/api/v1/sessions \\
  -H "Authorization: Bearer YOUR_LICENSE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"optional_player_name"}'` },
  };
  const client: Record<string, { label: string; lang: string; code: string }> = {
    web: { label: 'Website (JS SDK)', lang: 'html', code: `<div id="game" style="width:100%;max-width:480px;height:720px"></div>
<script src="${B}/sdk/minigames.js"></script>
<script>
  // "/game-session" is the endpoint YOU created above (it holds the secret key)
  MiniGames.mount('#game', {
    sessionEndpoint: '/game-session',
    onEvent: (e) => console.log(e.type, e.data), // ready, login, round, balance
  });
</script>` },
    iframe: { label: 'Plain iframe', lang: 'html', code: `<!-- playUrl is the value your server received from the API -->
<iframe src="PLAY_URL_FROM_YOUR_SERVER" width="480" height="720"
        style="border:0" allow="autoplay; fullscreen"></iframe>` },
    flutter: { label: 'Flutter', lang: 'dart', code: `// pubspec.yaml: webview_flutter: ^4.9.0, http: ^1.2.0
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:webview_flutter/webview_flutter.dart';

Future<WebViewController> openGame() async {
  // Call YOUR backend (it holds the secret key), never the key directly from the app.
  final res = await http.post(Uri.parse('https://your-backend.com/game-session'));
  final playUrl = jsonDecode(res.body)['playUrl'] as String;

  return WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..addJavaScriptChannel('MiniGames', onMessageReceived: (m) {
      // JSON events from the game: {"type":"round","data":{...}}
      print('game event: \${m.message}');
    })
    ..loadRequest(Uri.parse(playUrl));
}

// In your widget tree: WebViewWidget(controller: controller)` },
  };
  const [ctab, setCtab] = useState('web');

  const Block = ({ s }: { s: { code: string } }) => (
    <div className="code"><button className="btn sm copy" onClick={async () => { await copy(s.code); toast('Copied'); }}>Copy</button><pre>{s.code}</pre></div>
  );
  return (
    <>
      <section className="card">
        <h3>Step 1: your server creates a session <span className="pill">server-side</span></h3>
        <div className="seg">{Object.entries(server).map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v.label}</button>)}</div>
        <Block s={server[tab]} />
      </section>
      <section className="card">
        <h3>Step 2: show the game <span className="pill">website or app</span></h3>
        <div className="seg">{Object.entries(client).map(([k, v]) => <button key={k} className={ctab === k ? 'on' : ''} onClick={() => setCtab(k)}>{v.label}</button>)}</div>
        <Block s={client[ctab]} />
      </section>
    </>
  );
}
