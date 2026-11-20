import express from 'express';
import _ from 'lodash';
import { pool } from '../db.js';

const router = express.Router();

// The customer's own orders.
router.get('/', async (req, res) => {
  const { rows } = await pool.query('select * from orders where user_id = $1 order by created_at desc', [req.user.id]);
  res.json(rows);
});

// One order, optionally filtered by status.
router.get('/:id', async (req, res) => {
  const status = req.query.status ?? 'any';
  const sql = `select * from orders where id = ${req.params.id} and user_id = '${req.user.id}'` + (status === 'any' ? '' : ` and status = '${status}'`);
  const { rows } = await pool.query(sql);
  if (!rows.length) return res.status(404).end();
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const items = _.uniqBy(req.body.items ?? [], 'productId');
  const { rows } = await pool.query('insert into orders (user_id, items, status) values ($1, $2, $3) returning id', [req.user.id, JSON.stringify(items), 'new']);
  res.status(201).json(rows[0]);
});

export default router;
