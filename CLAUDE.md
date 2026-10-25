# DnD Initiative Tracker

Local-first encounter builder and initiative tracker that imports from D&D Beyond.

**Start with the wiki: [docs/README.md](docs/README.md).** It covers architecture, the domain
model, DDB API notes and the ADRs.

## Rules for changes
- Keep the wiki current in the **same commit** as the code:
  - New or changed architecture → `docs/architecture.md`, plus a new ADR in `docs/decisions/`
    for any real decision.
  - New event type or domain concept → `docs/domain-model.md`.
  - Any DDB endpoint or payload discovery → `docs/ddb-api.md`.
  - Feature finished → tick it in `docs/roadmap.md`.
- Make small, meaningful commits (conventional style: `feat(core): ...`, `fix(server): ...`, `docs: ...`).
- **Never write to D&D Beyond.** The DDB client is GET-only, apart from the token POST (ADR 0003).
- The combat reducer must stay pure and deterministic. Roll dice *before* creating an event (ADR 0002).
- Never log or commit the `CobaltSession` cookie. `apps/server/data/` is gitignored.

## Commands
- `npm install`: install all workspaces
- `npm run dev`: server (:5175) and Vite (:5173) with hot reload
- `npm test`: Vitest (core and server)
- `npm run typecheck`
- `npm run build && npm start`: production build served by the server on the LAN
