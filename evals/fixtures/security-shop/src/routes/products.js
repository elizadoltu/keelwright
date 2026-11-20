import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('select id, name, price_cents from products where published order by name');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('select id, name, price_cents from products where id = $1 and published', [req.params.id]);
  if (!rows.length) return res.status(404).end();
  res.json(rows[0]);
});

export default router;
