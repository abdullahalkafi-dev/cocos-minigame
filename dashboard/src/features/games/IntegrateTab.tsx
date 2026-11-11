'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Button, Card } from '@/components/ui';
import { Snippets } from './IntegrateSnippets';

/** How a client connects this game: the three steps, a test button and copy-paste code. */
export default function IntegrateTab({ data }: { data: any }) {
  const { license } = data;
  const { user } = useApp();
  const open = async () => { const r = await api.post(`/api/licenses/${license.id}/preview-session`); window.open(r.playUrl, '_blank'); };
  return (
    <div className="stack">
      <Card>
        <h2 style={{ marginBottom: 16 }}>How it works</h2>
        <div className="stack">
          <div className="step"><div className="n">1</div><div><b>Your server creates a session</b><p className="muted">It calls our API with your account <b>API key</b> and this game&apos;s <b>ID</b>, and receives a play link that expires in 15 minutes.</p></div></div>
          <div className="step"><div className="n">2</div><div><b>Your site or app shows the game</b><p className="muted">Load the link in an iframe (website) or a WebView (Flutter, Android, iOS). The player picks a username and plays.</p></div></div>
          <div className="step"><div className="n">3</div><div><b>You watch the results</b><p className="muted">Players, bets and payouts appear live under <i>Players &amp; results</i>. The API key never reaches a player.</p></div></div>
        </div>
        <div className="row wrap" style={{ marginTop: 18 }}>
          <Button icon="play" onClick={open}>Try the game in a new tab</Button>
          <a href="/docs/" target="_blank" rel="noreferrer"><Button variant="ghost" icon="book">Full integration guide</Button></a>
          <Link href="/api-key"><Button variant="ghost" icon="key">{user?.hasApiKey ? 'Manage API key' : 'Create your API key'}</Button></Link>
        </div>
      </Card>
      <Snippets baseUrl={location.origin} gameId={license.gameId} />
    </div>
  );
}
