'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { gamePath, type GameTab } from '@/lib/paths';
import { Badge, Button, Card, Empty, Icon, PageHead, Skeleton } from '@/components/ui';
import Studio from '@/features/studio/Studio';
import PlayersTab from './PlayersTab';
import IntegrateTab from './IntegrateTab';
import SettingsTab from './SettingsTab';
import RoomsTab from './RoomsTab';

const TABS: { id: GameTab; label: string; icon: string }[] = [
  { id: 'customize', label: 'Customize', icon: 'palette' },
  { id: 'integrate', label: 'Integrate', icon: 'plug' },
  { id: 'players', label: 'Players & results', icon: 'chart' },
  { id: 'rooms', label: 'Rooms', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function GameDetail() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const tab = (TABS.find(t => t.id === params.get('tab'))?.id ?? 'customize') as GameTab;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setData(await api.get(`/api/licenses/${encodeURIComponent(id)}`)); } catch (e: any) { setErr(e.message); } }, [id]);
  useEffect(() => { setData(null); setErr(''); if (id) load(); else setErr('No game selected'); }, [id, load]);

  if (err) return <Card><Empty icon="info" title={err} action={<Link href="/games"><Button>Back to my games</Button></Link>} /></Card>;
  if (!data) return <div className="stack"><Skeleton h={34} w={280} /><Skeleton h={420} r={16} /></div>;
  const { license, game } = data;
  return (
    <div>
      <PageHead back={{ to: '/games', label: 'My games' }} title={<>{license.name} <Badge tone="brand">{game.name}</Badge></>} sub={<span className="row" style={{ gap: 8 }}><span className="muted small">Game ID</span><span className="code">{license.gameId}</span><button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(license.gameId); }} title="Copy game ID"><Icon name="copy" size={14} /></button></span>} />
      <div className="tabs">
        {TABS.map(t => <Link key={t.id} href={gamePath(id, t.id)} className={tab === t.id ? 'active' : ''}><Icon name={t.icon} size={16} />{t.label}</Link>)}
      </div>
      {tab === 'customize' && <Studio data={data} />}
      {tab === 'integrate' && <IntegrateTab data={data} />}
      {tab === 'players' && <PlayersTab data={data} />}
      {tab === 'rooms' && <RoomsTab data={data} />}
      {tab === 'settings' && <SettingsTab data={data} reload={load} />}
    </div>
  );
}

/** useSearchParams needs a Suspense boundary in a statically exported app. */
export default function GameDetailPage() {
  return <Suspense fallback={<div className="stack"><Skeleton h={34} w={280} /><Skeleton h={420} r={16} /></div>}><GameDetail /></Suspense>;
}
