import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { isPrivateAddress } from '../../modules/webhooks/webhook.url.js';

export interface SafePostOptions { body: string; headers: Record<string, string>; timeoutMs: number; allowPrivate: boolean }
export interface SafeResponse { status: number; /** The parsed JSON answer, or null when the answer was not JSON or was larger than 1 MB. */ json: any | null }

const MAX_BYTES = 1_000_000;
const PRIVATE_MESSAGE = 'The address points to a private or local network, which is not allowed';

/**
 * POSTs to an address a buyer typed in (webhooks, wallet endpoint). Unlike a plain `fetch`, the address a host name
 * resolves to is checked AT THE MOMENT OF CONNECTING, so a name that changes its answer between the check and the call
 * (DNS rebinding) cannot reach a private machine. Redirects are never followed and the answer is read only up to 1 MB.
 */
export function safePost(url: string, o: SafePostOptions): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(url); } catch { reject(new Error('Invalid address')); return; }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!o.allowPrivate && net.isIP(host) && isPrivateAddress(host)) { reject(new Error(PRIVATE_MESSAGE)); return; }

    const lookup: net.LookupFunction = (hostname, options, cb) => {
      dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return (cb as any)(err);
        const list = addrs as dns.LookupAddress[];
        if (!o.allowPrivate && (!list.length || list.some(a => isPrivateAddress(a.address)))) return (cb as any)(new Error(PRIVATE_MESSAGE));
        if (options.all) return (cb as any)(null, list);
        (cb as any)(null, list[0].address, list[0].family);
      });
    };

    const mod = u.protocol === 'https:' ? https : http;
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      const e = new Error(`No answer within ${o.timeoutMs / 1000} seconds`); e.name = 'TimeoutError';
      finish(() => reject(e)); req.destroy();
    }, o.timeoutMs);

    const req = mod.request(u, {
      method: 'POST', lookup, agent: false,
      headers: { ...o.headers, 'Content-Length': String(Buffer.byteLength(o.body)) },
    }, res => {
      const chunks: Buffer[] = []; let size = 0, tooBig = false;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { tooBig = true; res.destroy(); finish(() => resolve({ status: res.statusCode ?? 0, json: null })); return; }
        chunks.push(c);
      });
      res.on('end', () => finish(() => {
        let json: any = null;
        if (!tooBig) { try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ } }
        resolve({ status: res.statusCode ?? 0, json });
      }));
      res.on('error', e => finish(() => reject(e)));
    });
    req.on('error', e => finish(() => reject(e)));
    req.end(o.body);
  });
}
