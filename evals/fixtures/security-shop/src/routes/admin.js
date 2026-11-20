import express from 'express';
import { requireAdmin, requireUser } from '../auth.js';
import { pool } from '../db.js';

const router = express.Router();

router.get('/users', requireUser, requireAdmin, async (req, res) => {
  const { rows } = await pool.query('select id, email, created_at from profiles order by created_at desc');
  res.json(rows);
});

router.post('/users/:id/disable', requireUser, requireAdmin, async (req, res) => {
  await pool.query('update profiles set disabled = true where id = $1', [req.params.id]);
  res.status(204).end();
});

router.delete('/users/:id', requireUser, async (req, res) => {
  await pool.query('delete from profiles where id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
