'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, copy } from '@/lib/api';
import { gamePath } from '@/lib/paths';
import { useOrigin } from '@/lib/use-origin';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card, Icon, Modal, PageHead } from '@/components/ui';
import WebhookCard from './WebhookCard';
import WalletEndpointCard from './WalletEndpointCard';
import TestKeyCard from './TestKeyCard';

export default function ApiKeyPage() {
  const { user, refresh, toast } = useApp();
  const origin = useOrigin();
  const [fresh, setFresh] = useState<string>('');
  // a brand-new account lands here with its key, handed over once through sessionStorage
  useEffect(() => {
    try { const k = sessionStorage.getItem('mgs_new_key'); if (k) { sessionStorage.removeItem('mgs_new_key'); setFresh(k); } } catch { /* ignore */ }
  }, []);
  const [games, setGames] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api.get('/api/licenses').then(r => setGames(r.licenses)); }, []);

  const make = async () => {
    setBusy(true);
    try { const r = await api.post('/api/account/api-key'); setFresh(r.apiKey); setConfirm(false); await refresh(); }
    catch (e: any) { toast(e.message, 'err'); }
    setBusy(false);
  };

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <PageHead title="API key & webhooks" sub="One secret key for your whole account. It works for every game you own: you only add the game ID." />

      {fresh && (
        <Card className="stack-sm" style={{ borderColor: 'var(--brand)' }}>
          <div className="row"><Badge tone="good"><Icon name="check" size={12} />Copy it now</Badge><b>This is the only time the key is shown.</b></div>
          <div className="secret">{fresh}</div>
          <div className="row"><Button icon="copy" variant="primary" onClick={async () => { await copy(fresh); toast('API key copied'); }}>Copy key</Button>
            <span className="muted small">Put it in an environment variable on your server (for example <span className="mono">MINIGAME_API_KEY</span>). Never in website code or inside a mobile app.</span></div>
        </Card>
      )}

      <Card>
        <div className="row between wrap">
          <div><h2>Your secret key</h2>
            <div className="mono muted" style={{ marginTop: 6 }}>{user?.hasApiKey ? `${user.apiKeyPrefix}••••••••••••••••••••••••••••` : 'No key yet'}</div></div>
          {user?.hasApiKey
            ? <Button variant="danger" icon="refresh" onClick={() => setConfirm(true)}>Rotate key</Button>
            : <Button variant="primary" icon="key" loading={busy} onClick={make}>Create API key</Button>}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>Lost it or leaked it? Rotate it: a new key is created and the old one stops working immediately, for all your games at once.</p>
      </Card>

      <TestKeyCard />

      <Card>
        <h2 style={{ marginBottom: 4 }}>Your games and their IDs</h2>
        <p className="muted" style={{ marginBottom: 14 }}>Send the game ID together with the key when you create a play session.</p>
        {games.length === 0 ? <p className="muted">You don&apos;t own a game yet. <Link href="/store">Open the store</Link>.</p> : (
          <div className="stack-sm">{games.map(g => (
            <div className="row" key={g.id} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 12 }}>
              <div className="grow"><b>{g.name}</b><div className="muted small">{g.game}</div></div>
              <span className="code">{g.gameId}</span>
              <Button size="sm" icon="copy" onClick={async () => { await copy(g.gameId); toast('Game ID copied'); }}>Copy ID</Button>
              <Link href={gamePath(g.id, "integrate")}><Button size="sm" variant="ghost" icon="plug">Integrate</Button></Link>
            </div>))}</div>
        )}
      </Card>

      <Card>
        <h2 style={{ marginBottom: 10 }}>Use it in 10 seconds</h2>
        <div className="codebox"><pre>{`curl -X POST ${origin}/api/v1/sessions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"gameId":"${games[0]?.gameId ?? 'YOUR_GAME_ID'}","playerId":"user-8841"}'`}</pre></div>
        <div className="row" style={{ marginTop: 12 }}><a href="/docs/" target="_blank" rel="noreferrer"><Button icon="book">Open the integration guide</Button></a><span className="muted small">Node.js, Python, Java, PHP, Flutter and website examples.</span></div>
      </Card>

      {confirm && (
        <Modal title="Rotate your API key?" onClose={() => setConfirm(false)}>
          <p>The current key stops working <b>immediately</b> for all your games. Update your server with the new key right after.</p>
          <div className="row end"><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={make}>Rotate key</Button></div>
        </Modal>
      )}
      <WebhookCard />
      <WalletEndpointCard />
    </div>
  );
}
