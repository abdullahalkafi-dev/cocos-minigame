'use client';
import { useState } from 'react';
import { copy } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card } from '@/components/ui';
import { clientSnippets, roomSnippets, seamlessSnippets, serverSnippets, walletSnippets, webhookSnippets, Snip } from '@/lib/snippets';

function Block({ s }: { s: Snip }) {
  const { toast } = useApp();
  return <div className="codebox"><Button size="sm" className="copy" onClick={async () => { await copy(s.code); toast('Copied'); }} icon="copy">Copy</Button><pre>{s.code}</pre></div>;
}

function Tabbed({ snips, initial }: { snips: Record<string, Snip>; initial: string }) {
  const [tab, setTab] = useState(initial);
  return (
    <>
      <div className="seg">{Object.entries(snips).map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v.label}</button>)}</div>
      <Block s={snips[tab]} />
    </>
  );
}

/** The copy-paste code of an integration, in the order a client's developer needs it. */
export function Snippets({ baseUrl, gameId, walletMode }: { baseUrl: string; gameId: string; walletMode: 'demo' | 'managed' | 'seamless' }) {
  return (
    <>
      <Card className="stack-sm">
        <div><h2>Step 1 · Create a session on your server</h2><p className="muted small">Your own login decides who the player is; send your id for that person. Uses your account API key and this game&apos;s ID (<span className="code">{gameId}</span>).</p></div>
        <Tabbed snips={serverSnippets(baseUrl, gameId)} initial="node" />
      </Card>
      <Card className="stack-sm">
        <h2>Step 2 · Show the game in your site or app</h2>
        <Tabbed snips={clientSnippets(baseUrl)} initial="web" />
      </Card>
      <Card className="stack-sm">
        <div className="row between wrap"><h2>Step 3 · Coins (wallet)</h2><Badge tone={walletMode === 'demo' ? 'warn' : 'good'}>{walletMode === 'managed' ? 'Managed wallet is on' : walletMode === 'seamless' ? 'Seamless wallet is on' : 'Demo wallet: turn on "managed" in Settings'}</Badge></div>
        <p className="muted small">When you sell coins in your own system, tell us with <b>credit</b>; when a player cashes out, use <b>debit</b>. Always send a unique <span className="code">reference</span>: a retry with the same reference is answered the same way and never moves coins twice.</p>
        <Tabbed snips={walletSnippets(baseUrl, gameId)} initial="curl" />
      </Card>
      <Card className="stack-sm">
        <div className="row between wrap"><h2>Rooms and leaderboards</h2><Badge>optional</Badge></div>
        <p className="muted small">Run small tables or one big event: every room has its own round clock, pot and ranking. Manage rooms under the <b>Rooms</b> tab or with the API, and show a ranking in your own app.</p>
        <Tabbed snips={roomSnippets(baseUrl, gameId)} initial="curl" />
      </Card>
      <Card className="stack-sm">
        <h2>Step 4 · Get notified (webhooks)</h2>
        <p className="muted small">We call your server after every finished round. Set the address and copy the signing secret on the <b>API key &amp; webhooks</b> page, then verify each request like this.</p>
        <Tabbed snips={webhookSnippets()} initial="node" />
      </Card>
      {walletMode === 'seamless' && (
        <Card className="stack-sm">
          <h2>Seamless wallet · your endpoint</h2>
          <p className="muted small">Implement this one endpoint (and set its address on the API key &amp; webhooks page). Stakes are taken from your system before a bet is accepted; wins are paid to it after each round.</p>
          <Tabbed snips={seamlessSnippets()} initial="node" />
        </Card>
      )}
    </>
  );
}
