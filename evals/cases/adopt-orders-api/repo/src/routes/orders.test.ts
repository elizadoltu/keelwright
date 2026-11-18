import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('POST /orders', () => {
  it('answers 400 with a JSON error when the body is incomplete', async () => {
    const app = createApp({ query: async () => ({ rows: [] }) } as never);
    const res = await request(app).post('/orders').send({ total: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customerId/);
  });
});
