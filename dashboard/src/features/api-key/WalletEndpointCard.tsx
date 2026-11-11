'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ago } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card } from '@/components/ui';

const TONE: Record<string, 'good' | 'warn' | 'bad'> = { done: 'good', pending: 'warn', failed: 'bad' };

/** The seamless wallet: where we ask YOUR system to take stakes and pay wins, so the coins never live with us. */
export default function WalletEndpointCard() {
  const { toast } = useApp();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [ops, setOps] = useState<any[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [c, o] = await Promise.all([api.get('/api/account/wallet-endpoint'), api.get('/api/account/wallet-endpoint/operations')]);
    setSaved(c.url); setUrl(u => u || c.url || ''); setOps(o.operations);
  }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => { const t = setInterval(() => { api.get('/api/account/wallet-endpoint/operations').then(o => setOps(o.operations)).catch(() => undefined); }, 6000); return () => clearInterval(t); }, []);

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); try { await fn(); } catch (e: any) { toast(e.message, 'err'); } setBusy(''); };
  const save = () => run('save', async () => { const r = await api.put('/api/account/wallet-endpoint', { url: url.trim() || null }); setSaved(r.url); toast(r.url ? 'Wallet address saved' : 'Wallet address removed'); });
  const test = () => run('test', async () => { const r = await api.post('/api/account/wallet-endpoint/test'); toast(r.ok ? `Your wallet answered ${r.status}: it works` : `Failed: ${r.error}`, r.ok ? 'ok' : 'err'); });

  return (
    <Card className="stack-sm">
      <div className="row between wrap"><h2>Seamless wallet</h2>{saved ? <Badge tone="good">Address set</Badge> : <Badge>Off</Badge>}</div>
      <p className="muted small">If the coins must stay in <b>your</b> database, give us one address. For every bet we ask it to take the stake (<span className="code">debit</span>), for every win to pay it (<span className="code">credit</span>), and we use <span className="code">balance</span> and <span className="code">rollback</span> to stay in sync. Requests are signed with the same secret as webhooks and carry a <span className="code">reference</span> you must treat as an idempotency key. Then switch a game to <i>Seamless</i> in its Settings.</p>
      <label className="lbl">Your wallet address (https)</label>
      <div className="row"><input placeholder="https://www.yoursite.com/minigame-wallet" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
        <Button variant="primary" onClick={save} loading={busy === 'save'}>Save</Button><Button onClick={test} loading={busy === 'test'} disabled={!saved} icon="play">Send test</Button></div>
      <h3 style={{ marginTop: 10 }}>Payouts and rollbacks we are delivering</h3>
      {ops.length === 0 ? <p className="muted small">Nothing waiting. Wins are sent to your wallet right after each round; if it is down they are kept and retried for about a day.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>What</th><th>Player</th><th>Amount</th><th>Status</th><th>Last problem</th></tr></thead>
          <tbody>{ops.map(o => (
            <tr key={o.reference}><td className="muted">{ago(o.createdAt)}</td><td>{o.type}</td><td className="mono small">{o.playerId}</td><td>{o.amount.toLocaleString('en-US')}</td><td><Badge tone={TONE[o.status]}>{o.status}</Badge></td><td className="muted small" style={{ whiteSpace: 'normal' }}>{o.lastError ?? ''}</td></tr>))}</tbody>
        </table></div>)}
    </Card>
  );
}
