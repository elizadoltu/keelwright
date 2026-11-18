import type { Db } from '../db.js';

export interface Customer {
  id: number;
  name: string;
}

export function customerRepository(db: Db) {
  return {
    async byId(id: number): Promise<Customer | null> {
      const { rows } = await db.query('select id, name from customers where id = $1', [id]);
      return rows[0] ?? null;
    },
  };
}
