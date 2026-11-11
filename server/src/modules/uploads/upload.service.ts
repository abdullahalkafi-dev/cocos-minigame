import fs from 'node:fs';
import path from 'node:path';
import { badRequest, tooLarge } from '../../common/errors.js';
import { rid } from '../../common/utils/crypto.js';
import { UPLOAD_LIMITS, sniffMedia, svgIsSafe } from './media.js';

const ALLOWED: Record<string, string[]> = { image: ['image', 'svg'], video: ['video'], audio: ['audio'], media: ['image', 'svg', 'video'] };
const STORAGE_LIMIT = 150 * 1024 * 1024;
const MB = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

/** Validates and stores a file a buyer uploads for one of their game's asset slots. */
export function createUploadService(d: { uploadsDir: string }) {
  fs.mkdirSync(d.uploadsDir, { recursive: true });
  return {
    save(gameId: string, kind: string, buf: Buffer, originalName: string) {
      const m = sniffMedia(buf);
      if (!m) throw badRequest('Unsupported file. Use PNG, JPG, WebP, GIF, SVG, MP4, WebM, MP3, OGG, WAV or M4A.', 'unsupported_file');
      if (!(ALLOWED[kind] || ALLOWED.image).includes(m.type)) {
        const need = kind === 'media' ? 'an image, SVG or video' : kind === 'image' ? 'an image or SVG' : kind;
        throw badRequest(`This slot needs ${need}, but the file is ${m.type}`, 'wrong_file_kind');
      }
      if (m.type === 'svg' && !svgIsSafe(buf.toString('utf8'))) throw badRequest('This SVG contains scripts or external references and was rejected', 'unsafe_svg');
      const limit = UPLOAD_LIMITS[m.type];
      if (buf.length > limit) throw tooLarge(`${m.type.toUpperCase()} files can be at most ${MB(limit)} MB`);
      const dir = path.join(d.uploadsDir, gameId);
      fs.mkdirSync(dir, { recursive: true });
      const used = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
      if (used + buf.length > STORAGE_LIMIT) throw tooLarge('Storage limit for this game reached (150 MB)');
      const name = `${rid('', 8)}.${m.ext}`;
      fs.writeFileSync(path.join(dir, name), buf);
      return { url: `/uploads/${gameId}/${name}`, type: m.type, size: buf.length, name: originalName };
    },
  };
}
export type UploadService = ReturnType<typeof createUploadService>;
