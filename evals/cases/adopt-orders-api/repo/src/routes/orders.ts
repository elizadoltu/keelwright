import { Router } from 'express';
import type { Db } from '../db.js';
import { badRequest } from '../errors.js';
import { orderService } from '../services/orderService.js';

export function ordersRouter(db: Db) {
  const service = orderService(db);
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await service.list());
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await service.get(Number(req.params.id)));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { customerId, total } = req.body ?? {};
      if (typeof customerId !== 'number' || typeof total !== 'number') throw badRequest('customerId and total are required numbers');
      res.status(201).json(await service.create(customerId, total));
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    try {
      await service.cancel(Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
