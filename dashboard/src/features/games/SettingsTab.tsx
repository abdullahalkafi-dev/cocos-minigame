'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card, Icon } from '@/components/ui';

/** Name of the game and the websites allowed to embed it. */
export default function SettingsTab({ data, reload }: { data: any; reload: () => void }) {
  const { license } = data;
  const { toast } = useApp();
  const [name, setName] = useState(license.name);
  const [origins, setOrigins] = useState<string[]>(license.allowedOrigins);
  const [draft, setDraft] = useState('');

  const addOrigin = () => { const v = draft.trim().replace(/\/$/, ''); if (!v) return; if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(v)) { toast('Use the form https://example.com (no path)', 'err'); return; } if (!origins.includes(v)) setOrigins([...origins, v]); setDraft(''); };
  const save = async () => { try { await api.put(`/api/licenses/${license.id}`, { name, allowedOrigins: origins }); toast('Settings saved'); reload(); } catch (e: any) { toast(e.message, 'err'); } };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Card>
        <h2 style={{ marginBottom: 14 }}>General</h2>
        <label className="lbl">Name (only you see this)</label>
        <input value={name} maxLength={40} onChange={e => setName(e.target.value)} />
        <div style={{ height: 18 }} />
        <label className="lbl">Allowed websites <Badge>optional</Badge></label>
        <div className="row"><input placeholder="https://www.yoursite.com" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOrigin())} /><Button onClick={addOrigin}>Add</Button></div>
        <div className="help">When you add sites, browsers will refuse to show the game anywhere else. Mobile WebViews are not affected. Leave empty to allow any site.</div>
        {origins.length > 0 && <div className="chips" style={{ marginTop: 12 }}>{origins.map(o => <span className="chip" key={o}>{o}<button onClick={() => setOrigins(origins.filter(x => x !== o))} aria-label="Remove"><Icon name="x" size={12} /></button></span>)}</div>}
        <div style={{ marginTop: 18 }}><Button variant="primary" icon="check" onClick={save}>Save settings</Button></div>
      </Card>
    </div>
  );
}
