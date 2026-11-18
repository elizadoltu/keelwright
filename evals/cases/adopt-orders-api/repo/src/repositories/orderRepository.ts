import type { Db } from '../db.js';

export interface Order {
  id: number;
  customerId: number;
  status: 'open' | 'cancelled' | 'shipped';
  total: number;
}

export function orderRepository(db: Db) {
  return {
    async byId(id: number): Promise<Order | null> {
      const { rows } = await db.query('select id, customer_id as "customerId", status, total from orders where id = $1', [id]);
      return rows[0] ?? null;
    },
    async list(): Promise<Order[]> {
      const { rows } = await db.query('select id, customer_id as "customerId", status, total from orders order by id desc limit 100');
      return rows;
    },
    async create(customerId: number, total: number): Promise<Order> {
      const { rows } = await db.query('insert into orders (customer_id, status, total) values ($1, $2, $3) returning id, customer_id as "customerId", status, total', [customerId, 'open', total]);
      return rows[0];
    },
    async setStatus(id: number, status: Order['status']): Promise<void> {
      await db.query('update orders set status = $2 where id = $1', [id, status]);
    },
  };
}
