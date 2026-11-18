import { Router } from 'express';
import type { Db } from '../db.js';
import { customerService } from '../services/customerService.js';

export function customersRouter(db: Db) {
  const service = customerService(db);
  const router = Router();
  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await service.get(Number(req.params.id)));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
