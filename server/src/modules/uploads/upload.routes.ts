import { Router } from 'express';
import multer from 'multer';
import type { Container } from '../../container.js';
import { badRequest } from '../../common/errors.js';

export function uploadRoutes(c: Container) {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
  r.post('/api/licenses/:id/upload', c.limit(60, 60_000), c.auth.requireUser, c.auth.requireOwnedGame, upload.single('file'), (req, res) => {
    if (!req.file) throw badRequest('No file', 'no_file');
    const kind = String(req.query.kind || 'image');
    res.json(c.uploads.save(req.game!._id, kind, req.file.buffer, req.file.originalname));
  });
  return r;
}
