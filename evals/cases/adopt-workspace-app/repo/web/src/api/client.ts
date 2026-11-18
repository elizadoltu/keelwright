// The only place the web app talks to the API.
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface Item {
  id: number;
  title: string;
  status: 'available' | 'reserved' | 'gone';
}

export async function listItems(): Promise<Item[]> {
  const res = await fetch(`${BASE}/items`);
  if (!res.ok) throw new Error(`items: ${res.status}`);
  return res.json();
}

export async function reserve(id: number): Promise<void> {
  const res = await fetch(`${BASE}/items/${id}/reserve`, { method: 'POST' });
  if (!res.ok) throw new Error(`reserve: ${res.status}`);
}
