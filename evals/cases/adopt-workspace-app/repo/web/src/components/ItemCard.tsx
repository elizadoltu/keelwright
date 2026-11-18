import type { Item } from '../api/client';

export function ItemCard({ item, onReserve }: { item: Item; onReserve: (id: number) => void }) {
  return (
    <article className="rounded-lg border p-4">
      <h2 className="font-semibold">{item.title}</h2>
      {item.status === 'available' ? (
        <button className="mt-2 rounded bg-blue-600 px-3 py-1 text-white" onClick={() => onReserve(item.id)}>
          Reserve
        </button>
      ) : (
        <p className="mt-2 text-sm text-gray-500">{item.status}</p>
      )}
    </article>
  );
}
