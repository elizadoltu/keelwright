# Notes for coding agents

- Use pnpm, never npm or yarn.
- Route handlers never talk to the database directly: they call a service, and services call repositories.
- Errors that should reach the client are thrown as `HttpError` from `src/errors.ts`; the error middleware turns them into JSON.
- Run `pnpm verify` before you say you're done.
