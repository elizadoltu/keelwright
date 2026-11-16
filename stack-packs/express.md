---
id: express
name: Express
packages: [express]
major: 5
researchedAt: 2026-11-16
status: draft
---

# Stack pack: Express 5

## Summary

Express is the minimal HTTP server framework for Node.js: an app is a stack of middleware functions and routers that handle requests and write responses. This pack covers Express 5 (resolved 5.3.0). Express 5 requires Node.js 18 or higher, forwards rejected promises from async handlers to error middleware, and switches route matching to path-to-regexp v8 syntax [S1][S5].

## Project structure

- The official generator (`npx express-generator`) produces `app.js` (the application), `bin/www` (the startup script), `routes/` (route modules), `views/` (templates) and `public/` (static assets). The docs say this structure is only one option and can be changed [S11]. The generator page makes no claim about Express 5 compatibility, so check its output against the migration guide before relying on it [S11][S1].
- Split routes into modules with `express.Router()`. Each router is a "mini-app" with its own middleware and routes; the module exports the router and the app mounts it with `app.use('/birds', birds)` [S5]. Use `app.route(path)` to group the methods for one path [S5]. A sub-router does not see parent route parameters unless it is created with `express.Router({ mergeParams: true })` [S5].
- Keep building the app separate from starting it. `app.listen()` is only a shortcut for `http.createServer(app).listen(...)` and returns the `http.Server` [S10], so export the configured `app` from one module (e.g. `src/app.js`) and call `listen` in a separate entry (e.g. `src/server.js` or `bin/www`) [S11][S10]. Tests then import the app without opening a port [S12].
- Order inside the app module: settings (`app.set`, `app.disable`), security and parsing middleware, routers, a 404 handler, then error handlers. The 404 and error handlers go after all other `app.use` and route calls [S2][S4].

## Naming

- Route modules are named after the resource they serve and mounted at its path (`routes/users.js` → `app.use('/users', users)`) [S5][S11].
- Route parameter names must be valid JavaScript identifiers, or quoted (`:"user-name"`) [S1][S5].
- Wildcards must be named: `/*splat`, or `/{*splat}` to also match the root path [S1].
- Use the pluralized request helpers `req.acceptsCharsets()`, `req.acceptsEncodings()`, `req.acceptsLanguages()`; the singular forms are removed [S1].
- Do not keep the default session cookie name; use a generic one such as `sessionId` [S2].

## Testing

- Test HTTP behaviour with supertest: `request(app)` accepts an Express app or `http.Server` and binds a temporary port if it is not listening, so tests never manage ports. Chain `.expect()` for status, headers and body, or `await` the request and assert on the response. `request.agent(app)` keeps cookies between requests, which is how to test sessions and login flows [S12].
- The migration guide recommends running the automated test suite before and after upgrading to Express 5 to surface removed methods [S1]; integration tests through `request(app)` are what exercise middleware order, route syntax and error handlers.
- Test the error path explicitly: an async handler that rejects must reach the error middleware and produce the status set from `err.status`/`err.statusCode` [S4].
- Keep business logic out of handlers (see Conventions) so it can be unit-tested with the project's test runner without Express at all.

## Linting and formatting

- Express has no official linter or formatter configuration; use the project's general JavaScript/TypeScript setup.
- With TypeScript, the type-checked rules `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` (both in `recommended-type-checked`) catch promises that are neither awaited nor returned [S13]. This matters in Express 5 because a promise chain that is not returned from the handler, and has no `.catch(next)`, goes unhandled and can crash the process [S4].
- For handlers defined outside the route call, annotate parameter types (`Request<{ userId: string }>`); inline route paths infer them [S5].
- Run `node --trace-sync-io` in development or tests to warn about synchronous APIs that block the event loop [S3].

## Security

- Use only maintained Express versions and check the security updates page [S2]. Express 5.3.0 upgraded `qs`, `proxy-addr` and `body-parser` for several CVEs, and invalid body-parser `limit` values now throw at setup instead of silently disabling size checks [S6].
- Add Helmet: `app.use(helmet())` sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Cross-Origin-Resource-Policy`, and removes `X-Powered-By` [S2]. Without Helmet, at least call `app.disable('x-powered-by')`; the header is on by default [S2][S10].
- Replace the default 404 and error responses with your own handlers to reduce fingerprinting [S2]. The default error handler sends `err.stack` as the body unless `NODE_ENV=production` [S4].
- Terminate TLS (for example at Nginx) for any app handling sensitive data [S2].
- Validate all input. Never pass an unvalidated URL to `res.redirect()` or `res.location()`; check the host against an allowlist first (open redirect) [S2]. Use parameterized queries against SQL injection [S2].
- Body parsers limit bodies to `"100kb"` by default and `express.urlencoded` to 1000 parameters [S9]; raise limits per route only where needed. `extended` now defaults to `false` [S1][S9].
- Cookies: set `secure` and `httpOnly`, and scope `domain`, `path` and `expires` [S2]. `express-session`'s default in-memory store is not for production; use a compatible external store [S2]. `cookie-session` keeps the whole session in the client-visible cookie, so use it only for small, non-sensitive data [S2].
- Rate-limit login endpoints by consecutive failures per username and IP and by total failures per IP, e.g. with `rate-limiter-flexible` [S2].
- `trust proxy` defaults to `false`. Behind a reverse proxy, set it to the number of hops or the proxy addresses, not `true`, unless the last trusted proxy overwrites `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`; otherwise clients can spoof `req.ip`, `req.protocol` and `req.hostname` [S8][S10].
- `express.static` ignores dotfiles by default in Express 5; opt in only for specific paths such as `/.well-known` [S1].
- Run `npm audit` (or Snyk `snyk test`) to scan dependencies [S2].

## Performance pitfalls

- Run with `NODE_ENV=production`: it enables view caching and less verbose errors, and the docs estimate about a threefold improvement [S3][S10].
- Avoid synchronous functions in request paths; they are acceptable only at startup [S3].
- `console.log`/`console.error` are synchronous when writing to a terminal or file; use `debug` for debugging output and a logger such as Pino for application logs [S3].
- Offload CPU-bound work (image processing, cryptography, large parsing) to a fixed worker-thread pool such as `piscina` [S3].
- Use `compression()` middleware, or compress at the reverse proxy for high-traffic sites [S3].
- Do not handle `uncaughtException` to keep the process running, and do not use `domain`; crash and let the process manager restart [S3].
- Keep the process stateless so it can run in a cluster: sessions and shared state belong in a datastore such as Redis [S3].

## CI/CD and release

- Run the test suite and a dependency audit (`npm audit`) in CI [S1][S2].
- Deploy behind a reverse proxy or load balancer (Nginx, HAProxy) that handles TLS, caching, static files and compression [S3][S2].
- Use a process manager or systemd with automatic restart (`Restart=always`) and `Environment=NODE_ENV=production` [S3].
- Implement graceful shutdown: on `SIGTERM`, stop accepting connections with `server.close()`, let in-flight requests finish, close database connections, then exit [S7].
- Expose liveness and readiness health checks for the load balancer or orchestrator [S7].
- Handle `app.listen` errors in its callback: in Express 5, errors such as `EADDRINUSE` are passed to the callback instead of being thrown [S1][S10].

## Conventions

- **Clean Architecture.** Express belongs to the outermost layer (frameworks and drivers / interface adapters). Routers and handlers in `routes/` (or `http/`) translate HTTP to calls on use cases in a framework-free `domain/` or `services/` layer; domain code must not import `express` or receive `req`/`res`. Dependencies point inward: routes → use cases → domain. Express's design supports this because a router is a self-contained mini-app that only needs to be mounted [S5].
- **Atomic Design.** Not applicable: Express renders no component tree. Server-rendered views in `views/` belong to whichever template or UI pack the project uses [S11].
- **Humble Object.** Handlers are the humble objects: read input from `req.params`, `req.query` and `req.body`, call a use case, map the result or error to `res.status(...).json(...)`. Let errors propagate (Express 5 forwards rejected promises) to a central error middleware that maps domain errors to status codes [S1][S4]. Keep `app.listen` and signal handling in the entry file, so the app module stays testable with supertest [S10][S12].

## Version notes

- **Requirements:** Node.js 18 or higher [S1]. Codemods: `npx codemod@latest @expressjs/v5-migration-recipe` [S1].
- **Route syntax (path-to-regexp v8):** named wildcards (`/*splat`, `/{*splat}`); `?` optional parameters replaced by braces (`/:file{.:ext}`); no regular expressions inside string paths (use arrays of paths); `()[]?+!` must be escaped [S1][S5].
- **Async:** rejected promises and errors thrown in async handlers go to error middleware as if `next(err)` was called; manual `.catch(next)` wrappers are no longer needed [S1][S4].
- **Removed:** `app.del()` (use `app.delete()`), `app.param(fn)`, `req.param(name)`, `res.json(obj, status)`, `res.jsonp(obj, status)`, `res.send(obj, status)`, `res.send(status)` (use `res.sendStatus()`), `res.sendfile()` (use `res.sendFile()`), `res.redirect(url, status)` (now `res.redirect(status, url)`), the `'back'` magic string, `hidden`/`from` options of `express.static` and `res.sendFile`, `express.static.mime` [S1].
- **Changed behaviour:** `req.body` is `undefined` when not parsed; `req.query` is a read-only getter and the default parser is `simple`; `req.host` keeps the port; `req.params` has a null prototype, wildcards are arrays and unmatched parameters are omitted; `res.status()` throws outside 100–999; `res.vary()` throws without a field; `res.clearCookie` ignores `maxAge`/`expires`; `express.urlencoded` `extended` defaults to `false`; `express.static` `dotfiles` defaults to `"ignore"`; `router.param` rejects arrays; `.js` is served as `text/javascript` [S1].
- **Debug namespaces** moved to `router`, `router:layer`, `router:route` [S1].
- **5.x releases:** 5.1.0 added an ETag option to `res.sendFile`; 5.2.0 shipped a query-parser change that 5.2.1 fully reverted; 5.3.0 fixed CVEs in `qs`, `proxy-addr` and `body-parser`, made `content-type` keep existing parameters and `content-disposition` leave valid token filenames unquoted (check tests that compare exact header bytes), and the default error handler now logs the full error object [S6].

## Rules

| ID | Rule | Enforce with | Sources |
|---|---|---|---|
| EXPRESS-01 | Export the configured `app` from its own module and call `app.listen()` only in a separate entry file; tests import the app. | review | S10, S11, S12 |
| EXPRESS-02 | Write route paths in Express 5 syntax: named wildcards (`/*splat` or `/{*splat}`), braces for optional segments, arrays of paths instead of regex in strings; no `?` optional parameters. | test: supertest route tests | S1, S5 |
| EXPRESS-03 | Do not use removed v4 APIs: `app.del`, `req.param`, `res.sendfile`, `res.send(status)`, `res.json(obj, status)`, `res.redirect(url, status)`, `'back'` redirects; run the v5 migration codemods on upgrade. | ci: npx codemod@latest @expressjs/v5-migration-recipe | S1 |
| EXPRESS-04 | Write handlers as `async` functions that return or await every promise; never leave a promise chain unreturned without `.catch(next)`, and do not add manual async wrappers. | lint: typescript-eslint @typescript-eslint/no-floating-promises | S1, S4, S13 |
| EXPRESS-05 | Register a custom 404 handler and a four-argument `(err, req, res, next)` error handler after all routes; the error handler delegates with `next(err)` when `res.headersSent` and never sends `err.stack` to clients. | test: supertest error-path tests | S2, S4 |
| EXPRESS-06 | Apply `helmet()` as early middleware; if Helmet is not used, call `app.disable('x-powered-by')`. | review | S2, S10 |
| EXPRESS-07 | Validate redirect targets against an allowlist of hosts before calling `res.redirect()` or `res.location()` with user input. | review | S2 |
| EXPRESS-08 | Set `trust proxy` to the hop count or proxy addresses of the real deployment, never `true` unless the last proxy overwrites the `X-Forwarded-*` headers. | review | S8, S10 |
| EXPRESS-09 | Keep body-parser limits at their defaults (`limit: "100kb"`, `parameterLimit: 1000`) unless a route needs more, and raise them only on that route; enable `extended: true` only when nested form data is required. | review | S1, S9, S6 |
| EXPRESS-10 | Session cookies use a non-default name, `secure: true` and `httpOnly: true`; `express-session` uses an external store, never the default memory store, in production. | review | S2 |
| EXPRESS-11 | Rate-limit authentication endpoints by failed attempts per username+IP and per IP. | review | S2 |
| EXPRESS-12 | Run in production with `NODE_ENV=production`. | config: NODE_ENV=production | S3, S10 |
| EXPRESS-13 | No synchronous I/O and no `console.log` logging in request handlers; use async APIs and a logger such as Pino. | test: node --trace-sync-io | S3 |
| EXPRESS-14 | Do not register `process.on('uncaughtException')` to keep serving, and do not use `domain`; let the process crash and restart under a process manager. | review | S3 |
| EXPRESS-15 | Handle `SIGTERM` with `server.close()`, close database connections, and expose liveness and readiness endpoints. | review | S7 |
| EXPRESS-16 | Handle server start errors (such as `EADDRINUSE`) in the `app.listen` callback's `error` argument. | review | S1, S10 |
| EXPRESS-17 | Guard against `req.body` being `undefined` and never assign to `req.query`; mount a body parser before routes that read the body. | test: supertest request tests | S1 |
| EXPRESS-18 | Run `npm audit` in CI and stay on the latest Express 5 minor. | ci: npm audit | S2, S6 |

## Sources

| ID | Kind | Title | URL |
|---|---|---|---|
| S1 | official | Migrating to Express 5 | https://expressjs.com/en/guide/migrating-5.html |
| S2 | official | Production Best Practices: Security | https://expressjs.com/en/advanced/best-practice-security.html |
| S3 | official | Production best practices: performance and reliability | https://expressjs.com/en/advanced/best-practice-performance.html |
| S4 | official | Error Handling | https://expressjs.com/en/guide/error-handling.html |
| S5 | official | Routing | https://expressjs.com/en/guide/routing.html |
| S6 | official | Express releases (GitHub) | https://github.com/expressjs/express/releases |
| S7 | official | Health Checks and Graceful Shutdown | https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html |
| S8 | official | Express behind proxies | https://expressjs.com/en/guide/behind-proxies.html |
| S9 | official | Express 5.x API: express() | https://expressjs.com/en/5x/api/express/ |
| S10 | official | Express 5.x API: Application | https://expressjs.com/en/5x/api/application/ |
| S11 | official | Express application generator | https://expressjs.com/en/starter/generator.html |
| S12 | community | supertest README | https://github.com/ladjs/supertest |
| S13 | community | typescript-eslint: no-misused-promises | https://typescript-eslint.io/rules/no-misused-promises/ |
