import { useState } from 'react';
import { copy } from '../api';
import { useApp } from '../App';
import { Button, Card } from '../ui';
import { clientSnippets, serverSnippets, Snip } from '../snippets';

export function Snippets({ baseUrl, gameId }: { baseUrl: string; gameId: string }) {
  const { toast } = useApp();
  const [tab, setTab] = useState('node');
  const [ctab, setCtab] = useState('web');
  const server = serverSnippets(baseUrl, gameId), client = clientSnippets(baseUrl);
  const Block = ({ s }: { s: Snip }) => (
    <div className="codebox"><Button size="sm" className="copy" onClick={async () => { await copy(s.code); toast('Copied'); }} icon="copy">Copy</Button><pre>{s.code}</pre></div>
  );
  return (
    <>
      <Card className="stack-sm">
        <div className="row between wrap"><div><h2>Step 1 · Create a session on your server</h2><p className="muted small">Uses your account API key and this game&apos;s ID (<span className="code">{gameId}</span>).</p></div>
          <div className="seg">{Object.entries(server).map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v.label}</button>)}</div></div>
        <Block s={server[tab]} />
      </Card>
      <Card className="stack-sm">
        <div className="row between wrap"><h2>Step 2 · Show the game in your site or app</h2>
          <div className="seg">{Object.entries(client).map(([k, v]) => <button key={k} className={ctab === k ? 'on' : ''} onClick={() => setCtab(k)}>{v.label}</button>)}</div></div>
        <Block s={client[ctab]} />
      </Card>
    </>
  );
}
