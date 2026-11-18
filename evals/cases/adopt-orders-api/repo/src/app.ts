import express, { type NextFunction, type Request, type Response } from 'express';
import type { Db } from './db.js';
import { HttpError } from './errors.js';
import { customersRouter } from './routes/customers.js';
import { healthRouter } from './routes/health.js';
import { ordersRouter } from './routes/orders.js';

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());
  app.use('/health', healthRouter(db));
  app.use('/orders', ordersRouter(db));
  app.use('/customers', customersRouter(db));

  // The one place errors become responses.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  });
  return app;
}
