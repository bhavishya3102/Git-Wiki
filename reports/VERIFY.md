# Verify-gate (adapted)

This repo is Express + Vite, not the Go/OpenAPI Fable template.

| Stage | Tool | Result |
| --- | --- | --- |
| 1 Backend unit | `npm test` (37) | PASS |
| 2 API contract | Schemathesis / Hurl | SKIP |
| 3 Frontend unit | `web/src/lib/desk.test.js` via node:test | PASS |
| 4 E2E Playwright | — | SKIP |
| 5 Frontend build | `npm --prefix web run build` | PASS |
