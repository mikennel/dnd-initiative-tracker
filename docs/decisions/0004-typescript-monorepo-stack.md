# 0004: TypeScript monorepo stack

- Status: accepted
- Date: 2026-10-25

## Decision
- **npm workspaces** (pnpm isn't installed on the dev machine, and npm workspaces are enough):
  - `packages/core`: pure TypeScript domain logic (combat reducer, DDB mappers, stat block
    parser, difficulty math). No I/O, so it is easy to unit test and shared by server and web.
    It is consumed as TS source (no build step). Vite and tsx compile it.
  - `apps/server`: Node 22 + Fastify 5 + `@fastify/websocket` + `@fastify/static`, run with `tsx`.
  - `apps/web`: Vite + React 18 + React Router.
- **SQLite via Node's built-in `node:sqlite`** instead of `better-sqlite3`. This avoids
  native module compilation on Windows. It requires Node ≥ 22.13 and logs an "experimental"
  warning, which is acceptable.
- **Vitest** for tests, run from the repo root.

## Consequences
- One `npm install` at the root sets up everything.
- If `node:sqlite` causes problems, the store is isolated in `apps/server/src/store/` and can
  be swapped for `better-sqlite3` with the same API shape.
