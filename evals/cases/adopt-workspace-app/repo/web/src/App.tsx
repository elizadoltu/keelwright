import { useEffect, useState } from 'react';
import { listItems, reserve, type Item } from './api/client';
import { ItemCard } from './components/ItemCard';

export function App() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    listItems().then(setItems);
  }, []);
  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-6">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onReserve={(id) => reserve(id).then(() => listItems().then(setItems))} />
      ))}
    </main>
  );
}
