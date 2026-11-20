# Architecture

One Express app. Requests enter through `src/legacy/router.js`, which maps each route to a handler in `src/handlers/`.
