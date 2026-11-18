import { describe, expect, it } from 'vitest';
import { HttpError } from '../errors.js';
import { orderService } from './orderService.js';

const fakeDb = (rows: Record<string, unknown[]>) => ({
  query: async (sql: string) => ({ rows: rows[Object.keys(rows).find((k) => sql.includes(k)) ?? ''] ?? [] }),
});

describe('orderService', () => {
  it('rejects a non-positive total', async () => {
    await expect(orderService(fakeDb({}) as never).create(1, 0)).rejects.toBeInstanceOf(HttpError);
  });

  it('refuses to cancel a shipped order', async () => {
    const db = fakeDb({ 'from orders where id': [{ id: 7, customerId: 1, status: 'shipped', total: 10 }] });
    await expect(orderService(db as never).cancel(7)).rejects.toMatchObject({ status: 409 });
  });
});
