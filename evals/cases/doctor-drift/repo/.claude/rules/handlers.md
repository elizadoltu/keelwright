---
paths: ["src/legacy/**"]
---

- Every handler validates its input before touching the database.
- Handlers return JSON with an `error` field on failure.
