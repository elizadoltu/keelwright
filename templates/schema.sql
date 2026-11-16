-- Schema: <Product name>
-- Database: <e.g. PostgreSQL 17 (Supabase)> — see ADR-NNNN
-- Mirrors docs/architecture/erd.md.
--
-- Rules for this file:
-- - Before scaffold, this file is the source of truth for the data model.
--   The scaffold step copies it into the first migration (e.g. supabase/migrations/<timestamp>_init.sql).
-- - After scaffold, the migrations are the source of truth and this file is a current-state
--   snapshot, updated whenever a migration changes the schema.
-- - Conventions: snake_case plural table names, uuid primary keys, timestamptz for times,
--   every table has created_at, check constraints for small fixed value sets.
-- - Every table and column that holds personal data has a comment saying so.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  created_at  timestamptz not null default now()
);
comment on column users.email is 'PII';

create table bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  slot_date   date not null,
  status      text not null default 'pending'
              check (status in ('pending', 'confirmed', 'cancelled')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Index every foreign key and every column used in frequent filters.
create index bookings_user_id_idx on bookings (user_id);

-- ---------------------------------------------------------------------------
-- Row-level security (Supabase)
-- ---------------------------------------------------------------------------

-- Enable RLS on every table exposed through the Supabase API, then add explicit policies.
alter table bookings enable row level security;

-- create policy "users read own bookings"
--   on bookings for select
--   using (auth.uid() = user_id);
