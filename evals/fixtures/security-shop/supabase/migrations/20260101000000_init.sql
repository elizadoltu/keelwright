create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select using (auth.uid() = id);

create table public.products (
  id bigint generated always as identity primary key,
  name text not null,
  price_cents integer not null,
  published boolean not null default false
);
alter table public.products enable row level security;
create policy "published products" on public.products for select using (published);

create table public.orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles,
  items jsonb not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
