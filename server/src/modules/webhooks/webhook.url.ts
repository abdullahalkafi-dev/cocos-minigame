import dns from 'node:dns/promises';
import net from 'node:net';
import { badRequest } from '../../common/errors.js';

/** True for addresses that must never be called from our server: loopback, private, link-local and similar. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6.startsWith('fc') || v6.startsWith('fd') || /^fe[89ab]/.test(v6);
}

/**
 * Checks a webhook address: https only, and the host must not resolve to a private or local address
 * (otherwise a buyer could make our server call other machines on its network).
 * `allowPrivate` is for development and tests.
 */
export async function assertSafeWebhookUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw badRequest('Enter a full address such as https://example.com/webhooks', 'invalid_webhook_url'); }
  if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) throw badRequest('The webhook address must start with https://', 'invalid_webhook_url');
  if (u.username || u.password) throw badRequest('Do not put a user name or password in the address', 'invalid_webhook_url');
  if (allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs: string[];
  try { addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address); } catch { throw badRequest('That address could not be found (DNS lookup failed)', 'webhook_unreachable'); }
  if (!addrs.length || addrs.some(isPrivateAddress)) throw badRequest('The address points to a private or local network, which is not allowed', 'webhook_private_address');
  return u;
}
