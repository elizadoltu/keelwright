# Orders API

The HTTP API behind the warehouse ordering screen: staff create orders for customers, list them, and cancel them before they ship.

## Running it

```sh
pnpm install
cp .env.example .env   # DATABASE_URL
pnpm dev
```

`pnpm verify` runs lint, the type check and the tests — CI runs the same.

Decisions are recorded in `docs/adr/`.
