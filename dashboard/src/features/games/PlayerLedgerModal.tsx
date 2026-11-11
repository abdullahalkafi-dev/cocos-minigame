'use client';
import { useEffect, useState } from 'react';
import { api, ago, fmt } from '@/lib/api';
import { Badge, Button, Modal, Skeleton } from '@/components/ui';

const LABEL: Record<string, string> = { starting: 'Starting balance', refill: 'Free refill', bet: 'Bet', win: 'Win', credit: 'Credit (your server)', debit: 'Debit (your server)' };

/** Every coin movement of one player, newest first: what the game did and what the buyer's server did. */
export default function PlayerLedgerModal({ gameId, player, onClose }: { gameId: string; player: { playerId: string; username: string }; onClose: () => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const path = (before?: string) => `/api/licenses/${encodeURIComponent(gameId)}/players/${encodeURIComponent(player.playerId)}/transactions?limit=25${before ? `&before=${before}` : ''}`;

  useEffect(() => { api.get(path()).then(r => { setItems(r.transactions); setNext(r.nextBefore); setBalance(r.balance); }).catch(() => setItems([])); }, [gameId, player.playerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = async () => { const r = await api.get(path(next ?? undefined)); setItems(i => [...(i ?? []), ...r.transactions]); setNext(r.nextBefore); };

  return (
    <Modal title={`Coins of ${player.username}`} onClose={onClose} wide>
      <div className="row" style={{ marginBottom: 12 }}><span className="muted small">Player id</span><span className="code">{player.playerId}</span><span className="grow" />{balance !== null && <Badge tone="brand">Balance {fmt(balance)}</Badge>}</div>
      {items === null ? <Skeleton h={160} /> : items.length === 0 ? <p className="muted">No movements yet.</p> : (
        <div className="table-wrap" style={{ maxHeight: 380, overflow: 'auto' }}><table>
          <thead><tr><th>When</th><th>What</th><th>Amount</th><th>Balance after</th><th>Reference</th></tr></thead>
          <tbody>{items.map(t => (
            <tr key={t.id}><td className="muted">{ago(t.createdAt)}</td><td>{LABEL[t.type] ?? t.type}{t.note ? <div className="muted small">{t.note}</div> : null}</td>
              <td className={t.amount > 0 ? 'pos' : ''}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}</td><td>{fmt(t.balanceAfter)}</td><td className="muted small">{t.reference ?? ''}</td></tr>))}</tbody>
        </table></div>)}
      {next && <div style={{ marginTop: 12 }}><Button size="sm" onClick={more}>Load more</Button></div>}
    </Modal>
  );
}
