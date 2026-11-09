const TOKEN_KEY = 'mgs_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function raw(method: string, url: string, body?: any, isForm = false): Promise<Response> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  if (res.status === 401 && t && !url.startsWith('/api/auth')) { setToken(null); location.href = '/login'; }
  return res;
}
async function call<T = any>(method: string, url: string, body?: any, isForm = false): Promise<T> {
  const res = await raw(method, url, body, isForm);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: <T = any>(u: string) => call<T>('GET', u),
  post: <T = any>(u: string, b?: any) => call<T>('POST', u, b ?? {}),
  put: <T = any>(u: string, b?: any) => call<T>('PUT', u, b ?? {}),
  upload: async (licenseId: string, file: File): Promise<string> => {
    const fd = new FormData(); fd.append('file', file);
    return (await call<{ url: string }>('POST', `/api/licenses/${licenseId}/upload`, fd, true)).url;
  },
  download: async (url: string, filename: string) => {
    const res = await raw('GET', url);
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  },
};

export const fmt = (n: number) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const ago = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`; return `${Math.round(s / 86400)}d ago`;
};
export function getPath(o: any, p: string) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o: any, p: string, v: any) {
  const c = JSON.parse(JSON.stringify(o)); const parts = p.split('.'); let t = c;
  parts.slice(0, -1).forEach(k => { t[k] = t[k] ?? {}; t = t[k]; });
  t[parts[parts.length - 1]] = v; return c;
}
export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
