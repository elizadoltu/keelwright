import type { Db } from '../db.js';
import { badRequest, HttpError, notFound } from '../errors.js';
import { customerRepository } from '../repositories/customerRepository.js';
import { orderRepository } from '../repositories/orderRepository.js';

export function orderService(db: Db) {
  const orders = orderRepository(db);
  const customers = customerRepository(db);
  return {
    list: () => orders.list(),
    async get(id: number) {
      const order = await orders.byId(id);
      if (!order) throw notFound('Order');
      return order;
    },
    async create(customerId: number, total: number) {
      if (!(total > 0)) throw badRequest('total must be positive');
      if (!(await customers.byId(customerId))) throw notFound('Customer');
      return orders.create(customerId, total);
    },
    async cancel(id: number) {
      const order = await this.get(id);
      if (order.status === 'shipped') throw new HttpError(409, 'A shipped order cannot be cancelled');
      await orders.setStatus(id, 'cancelled');
    },
  };
}
