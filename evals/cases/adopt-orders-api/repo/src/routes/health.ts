import { Router } from 'express';
import type { Db } from '../db.js';

// Older than the other routes: answers errors itself and queries the database directly.
export function healthRouter(db: Db) {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      await db.query('select 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'database unavailable' });
    }
  });
  return router;
}
