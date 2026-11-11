'use client';
import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------- icons (inline SVG, 24px grid)
const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9c0 2 2 2 2.7 0 .7 2 3.3 2 4 0 .7 2 3.3 2 4 0 .7 2 2.7 2 2.7 0M9 20v-5h6v5',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M15.5 4.2a3.5 3.5 0 010 6.6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  palette: 'M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.500 1.500-2.500H17a4 4 0 004-4A9 9 0 0012 3zM7.500 12a1 1 0 100-2 1 1 0 000 2zM10 8a1 1 0 100-2 1 1 0 000 2zM15 8a1 1 0 100-2 1 1 0 000 2z',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0V8zM12 17v5',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.400 15a1.700 1.700 0 00.3 1.800l.1.1a2 2 0 11-2.800 2.800l-.1-.1a1.700 1.700 0 00-1.800-.3 1.700 1.700 0 00-1 1.500V21a2 2 0 11-4 0v-.1a1.700 1.700 0 00-1.100-1.500 1.700 1.700 0 00-1.800.3l-.1.1a2 2 0 11-2.800-2.800l.1-.1a1.700 1.700 0 00.3-1.800 1.700 1.700 0 00-1.500-1H3a2 2 0 110-4h.1a1.700 1.700 0 001.500-1.100 1.700 1.700 0 00-.3-1.800l-.1-.1a2 2 0 112.800-2.800l.1.1a1.700 1.700 0 001.800.3H9a1.700 1.700 0 001-1.500V3a2 2 0 114 0v.1a1.700 1.700 0 001 1.500 1.700 1.700 0 001.800-.3l.1-.1a2 2 0 112.800 2.800l-.1.1a1.700 1.700 0 00-.3 1.800V9a1.700 1.700 0 001.500 1H21a2 2 0 110 4h-.1a1.700 1.700 0 00-1.500 1z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.500a1 1 0 100-2 1 1 0 000 2z',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  audio: 'M4 10v4h4l5 4V6L8 10H4zM16 9a4 4 0 010 6M18.500 6.500a8 8 0 010 11',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M5 12.500l4.500 4.500L19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 18l-6-6 6-6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  key: 'M14 10a4 4 0 11-3.500 6L3 17.500V21h3v-2h2v-2h2l1.500-1.500A4 4 0 0114 10zM17 8a1 1 0 100-2 1 1 0 000 2z',
  refresh: 'M20 11a8 8 0 00-14.500-3M4 4v4h4M4 13a8 8 0 0014.500 3M20 20v-4h-4',
  play: 'M7 4l13 8-13 8z',
  coin: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v10M9.500 9.500c0-1 1-1.500 2.500-1.500s2.500.7 2.500 1.700-1 1.500-2.500 1.800-2.500.7-2.500 1.800 1 1.700 2.500 1.700 2.500-.5 2.500-1.500',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400',
  moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sparkle: 'M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.500v.5',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
};
export function Icon({ name, size = 18, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.info} />
    </svg>
  );
}

// ---------------------------------------------------------------- primitives
export function Button({ children, variant = 'soft', size = 'md', icon, loading, ...rest }: any) {
  return (
    <button className={`btn ${variant} ${size}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spin" /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}
export const Card = ({ children, className = '', ...r }: any) => <div className={`card ${className}`} {...r}>{children}</div>;
export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad' }) => <span className={`badge ${tone}`}>{children}</span>;
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="knob" />{label && <span className="sw-label">{label}</span>}
    </button>
  );
}
export const Skeleton = ({ h = 18, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) => <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
export function Empty({ icon = 'sparkle', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-ic"><Icon name={icon} size={26} /></div><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>;
}
export function Modal({ children, onClose, title, wide }: { children: ReactNode; onClose?: () => void; title: string; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}><h3>{title}</h3>{children}</div>
    </div>
  );
}
export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-head">
      <div>{back && <Link className="crumb" href={back.to}><Icon name="back" size={14} />{back.label}</Link>}
        <h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

/** Checkerboard-backed preview for any slot value (image, svg, video, audio). */
export function MediaPreview({ url, className = '', size = 'md' }: { url?: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (!url) return <div className={`mprev empty ${size} ${className}`}><Icon name="image" size={22} /></div>;
  const u = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|m4v|mov)$/.test(u)) return <div className={`mprev ${size} ${className}`}><video src={url} muted loop autoPlay playsInline /></div>;
  if (/\.(mp3|ogg|wav|m4a)$/.test(u)) return <div className={`mprev audio ${size} ${className}`}><Icon name="audio" size={24} /><audio src={url} controls preload="none" /></div>;
  return <div className={`mprev ${size} ${className}`}><img src={url} alt="" draggable={false} /></div>;
}
export function typeOf(url?: string): 'image' | 'video' | 'audio' | 'none' {
  if (!url) return 'none'; const u = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|m4v|mov)$/.test(u)) return 'video'; if (/\.(mp3|ogg|wav|m4a)$/.test(u)) return 'audio'; return 'image';
}
export const fmtBytes = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export function useTheme() {
  const [t, setT] = useState<'light' | 'dark'>(() => { try { return (localStorage.getItem('mgs_theme') as any) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } });
  useEffect(() => { document.documentElement.dataset.theme = t; try { localStorage.setItem('mgs_theme', t); } catch { /* ignore */ } }, [t]);
  return [t, () => setT(x => (x === 'dark' ? 'light' : 'dark'))] as const;
}
export function useDrop(onFile: (f: File) => void) {
  const [over, setOver] = useState(false);
  const ref = useRef(onFile); ref.current = onFile;
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) ref.current(f); },
    },
  };
}
