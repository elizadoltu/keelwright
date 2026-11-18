import { Router } from 'express';
import { pool } from '../db/pool.js';

export const items = Router();

items.get('/', async (_req, res) => {
  const { rows } = await pool.query("select id, title, status from items where status <> 'gone' order by id desc");
  res.json(rows);
});

items.post('/:id/reserve', async (req, res) => {
  const { rowCount } = await pool.query("update items set status = 'reserved' where id = $1 and status = 'available'", [req.params.id]);
  if (!rowCount) return res.status(409).json({ error: 'not available' });
  res.status(204).end();
});
