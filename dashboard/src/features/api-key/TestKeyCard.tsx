'use client';
import { useState } from 'react';
import { api, copy } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card } from '@/components/ui';

/** The test API key (mgs_test_…): for games marked as "Test game", so tests never touch live data or live statistics. */
export default function TestKeyCard() {
  const { user, refresh, toast } = useApp();
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try { const r = await api.post('/api/account/test-api-key'); setFresh(r.apiKey); await refresh(); } catch (e: any) { toast(e.message, 'err'); }
    setBusy(false);
  };
  return (
    <Card className="stack-sm">
      <div className="row between wrap"><h2>Test key <Badge>optional</Badge></h2>
        <Button variant={user?.hasTestApiKey ? 'ghost' : 'primary'} icon={user?.hasTestApiKey ? 'refresh' : 'key'} onClick={make} loading={busy}>{user?.hasTestApiKey ? 'Rotate test key' : 'Create test key'}</Button></div>
      <p className="muted small">While you build your integration, mark a game as a <b>Test game</b> (game → Settings → Environment) and use this key with it. Test games only answer to the test key, live games only to the live key, and webhooks for a test game say <span className="code">livemode: false</span>. Buy a second copy of the game to keep one live and one for tests.</p>
      {user?.hasTestApiKey && !fresh && <div className="mono muted">{user.testApiKeyPrefix}••••••••••••••••••••••••</div>}
      {fresh && (
        <div className="stack-sm"><div className="row"><Badge tone="good">Copy it now</Badge><b>Shown only once.</b></div><div className="secret">{fresh}</div>
          <div><Button icon="copy" onClick={async () => { await copy(fresh); toast('Test key copied'); }}>Copy key</Button></div></div>
      )}
    </Card>
  );
}
