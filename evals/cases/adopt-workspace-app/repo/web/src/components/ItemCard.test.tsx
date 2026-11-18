import { describe, expect, it } from 'vitest';
import { ItemCard } from './ItemCard';

describe('ItemCard', () => {
  it('offers Reserve only for available items', () => {
    const el = ItemCard({ item: { id: 1, title: 'Desk lamp', status: 'reserved' }, onReserve: () => {} });
    expect(JSON.stringify(el)).not.toContain('Reserve');
  });
});
