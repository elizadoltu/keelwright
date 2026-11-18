import type { Db } from '../db.js';
import { notFound } from '../errors.js';
import { customerRepository } from '../repositories/customerRepository.js';

export function customerService(db: Db) {
  const customers = customerRepository(db);
  return {
    async get(id: number) {
      const customer = await customers.byId(id);
      if (!customer) throw notFound('Customer');
      return customer;
    },
  };
}
