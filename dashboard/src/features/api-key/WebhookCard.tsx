'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ago, copy } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card, Icon } from '@/components/ui';

const TONE: Record<string, 'good' | 'warn' | 'bad'> = { delivered: 'good', pending: 'warn', failed: 'bad' };

/** The account's webhook: where we send notifications, the signing secret, a test button and the delivery log. */
export default function WebhookCard() {
  const { toast } = useApp();
  const [cfg, setCfg] = useState<{ url: string | null; secret: string | null } | null>(null);
  const [url, setUrl] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([api.get('/api/account/webhook'), api.get('/api/account/webhook/deliveries')]);
    setCfg(c); setUrl(u => u || c.url || ''); setLog(d.deliveries);
  }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => { const t = setInterval(() => { api.get('/api/account/webhook/deliveries').then(d => setLog(d.deliveries)).catch(() => undefined); }, 6000); return () => clearInterval(t); }, []);

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); try { await fn(); } catch (e: any) { toast(e.message, 'err'); } setBusy(''); };
  const save = () => run('save', async () => { const c = await api.put('/api/account/webhook', { url: url.trim() || null }); setCfg(c); toast(c.url ? 'Webhook address saved' : 'Webhook turned off'); });
  const test = () => run('test', async () => {
    const r = await api.post('/api/account/webhook/test');
    toast(r.ok ? `Your server answered ${r.status}: it works` : `Failed: ${r.error}`, r.ok ? 'ok' : 'err'); await load();
  });
  const rotate = () => run('rotate', async () => { const c = await api.post('/api/account/webhook/secret'); setCfg(c); setShow(true); toast('New secret created. Update it on your server.'); });
  const retry = (id: string) => run('retry' + id, async () => { const r = await api.post(`/api/account/webhook/deliveries/${id}/retry`); toast(r.ok ? 'Delivered' : `Failed: ${r.error}`, r.ok ? 'ok' : 'err'); await load(); });

  return (
    <Card className="stack-sm">
      <div className="row between wrap"><h2>Webhooks</h2>{cfg?.url ? <Badge tone="good"><Icon name="check" size={12} />On</Badge> : <Badge>Off</Badge>}</div>
      <p className="muted small">We call this address on your server after every finished round (<span className="code">round.settled</span>). Each request is signed so you can prove it came from us. Failed deliveries are retried for about 9 hours.</p>
      <label className="lbl">Your address (https)</label>
      <div className="row"><input placeholder="https://www.yoursite.com/minigame-webhook" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
        <Button variant="primary" onClick={save} loading={busy === 'save'}>Save</Button><Button onClick={test} loading={busy === 'test'} disabled={!cfg?.url} icon="play">Send test</Button></div>
      {cfg?.secret && (
        <>
          <label className="lbl" style={{ marginTop: 8 }}>Signing secret</label>
          <div className="row"><span className="code" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{show ? cfg.secret : cfg.secret.slice(0, 10) + '••••••••••••••••••'}</span>
            <Button size="sm" variant="ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Reveal'}</Button>
            <Button size="sm" variant="ghost" icon="copy" onClick={async () => { await copy(cfg.secret!); toast('Copied'); }}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={rotate} loading={busy === 'rotate'}>Create new</Button></div>
          <div className="help">Keep it on your server only (for example in <span className="code">MINIGAME_WEBHOOK_SECRET</span>). Code examples for Node.js, Python, Java and PHP are in each game&apos;s Integrate tab, step 4.</div>
        </>
      )}
      <h3 style={{ marginTop: 14 }}>Recent deliveries</h3>
      {log.length === 0 ? <p className="muted small">Nothing sent yet. Press <b>Send test</b> to see one.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>When</th><th>Event</th><th>Status</th><th>Tries</th><th>Last answer</th><th /></tr></thead>
          <tbody>{log.map(d => (
            <tr key={d.id}><td className="muted">{ago(d.createdAt)}</td><td className="mono small">{d.type}</td><td><Badge tone={TONE[d.status]}>{d.status}</Badge></td><td>{d.attempts}</td>
              <td className="muted small" style={{ whiteSpace: 'normal' }}>{d.lastError ?? (d.lastStatus ? `HTTP ${d.lastStatus}` : '')}</td>
              <td>{d.status !== 'delivered' && <Button size="sm" variant="ghost" onClick={() => retry(d.id)} loading={busy === 'retry' + d.id}>Retry now</Button>}</td></tr>))}</tbody>
        </table></div>)}
    </Card>
  );
}
