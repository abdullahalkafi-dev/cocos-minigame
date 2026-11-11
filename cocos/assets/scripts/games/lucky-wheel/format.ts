export const short = (n: number) => {
  const t = (v: number) => String(+v.toFixed(1));
  if (n >= 1e9) return t(n / 1e9) + 'B';
  if (n >= 1e6) return t(n / 1e6) + 'M';
  if (n >= 1e3) return t(n / 1e3) + 'K';
  return String(n);
};
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const stamp = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
