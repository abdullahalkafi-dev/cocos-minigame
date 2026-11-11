// Identification and safety checks for files a buyer uploads. Files are identified by their SIGNATURE, never by name or declared type.

export const UPLOAD_LIMITS: Record<string, number> = { image: 3 * 1024 * 1024, svg: 300 * 1024, video: 10 * 1024 * 1024, audio: 4 * 1024 * 1024 };


export function sniffMedia(b: Buffer): { type: 'image' | 'svg' | 'video' | 'audio'; ext: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return { type: 'image', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image', ext: 'jpg' };
  if (b.toString('latin1', 0, 4) === 'GIF8') return { type: 'image', ext: 'gif' };
  if (b.toString('latin1', 0, 4) === 'RIFF') {
    const k = b.toString('latin1', 8, 12);
    if (k === 'WEBP') return { type: 'image', ext: 'webp' };
    if (k === 'WAVE') return { type: 'audio', ext: 'wav' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: 'video', ext: 'webm' };
  if (b.toString('latin1', 4, 8) === 'ftyp') { const brand = b.toString('latin1', 8, 12); return brand === 'M4A ' || brand === 'M4B ' ? { type: 'audio', ext: 'm4a' } : { type: 'video', ext: 'mp4' }; }
  if (b.toString('latin1', 0, 4) === 'OggS') return { type: 'audio', ext: 'ogg' };
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { type: 'audio', ext: 'mp3' };
  const head = b.toString('utf8', 0, 600).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return { type: 'svg', ext: 'svg' };
  return null;
}
/** SVGs are rejected (not "cleaned") when they could run code or load anything from outside. */
export function svgIsSafe(t: string): boolean {
  if (/<script|<foreignobject|<iframe|<embed|<object|<audio|<video|<!entity|<!doctype[^>]*\[|@import|javascript:|vbscript:/i.test(t)) return false;
  if (/\son[a-z]+\s*=/i.test(t)) return false;
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(t)) return false;
  if (/url\(\s*["']?\s*(?:https?:|\/\/|javascript:)/i.test(t)) return false;
  return true;
}
