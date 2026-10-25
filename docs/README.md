# Project wiki

This is the knowledge base for the DnD Initiative Tracker. **Keep it current.** A change
that alters architecture, adds an event type, or finds a DDB quirk should update the
relevant page in the same commit.

| Page | What's in it |
|---|---|
| [architecture.md](architecture.md) | Components, data flow, how state is composed |
| [domain-model.md](domain-model.md) | Combatants, conditions, resources, events and turn rules |
| [ddb-api.md](ddb-api.md) | Every D&D Beyond endpoint we use, auth flow, payload shapes, quirks |
| [dev-guide.md](dev-guide.md) | Setup, scripts, running on the LAN, testing |
| [roadmap.md](roadmap.md) | What's done, what's next |
| [decisions/](decisions/) | Architecture Decision Records (ADRs) |

## Decisions
| # | Title |
|---|---|
| [0001](decisions/0001-local-server-cookie-auth.md) | Local server with DDB session cookie |
| [0002](decisions/0002-event-sourced-combat-state.md) | Event-sourced combat state |
| [0003](decisions/0003-pcs-read-only-monsters-local.md) | PCs read-only from DDB; monsters local |
| [0004](decisions/0004-typescript-monorepo-stack.md) | TypeScript monorepo stack |
| [0005](decisions/0005-player-view-projection.md) | Player view is a server-side projection |
| [0006](decisions/0006-electron-desktop-and-chrome-connector.md) | Electron desktop app; Chrome extension hands over the D&D Beyond login |

### Writing an ADR
Copy the newest ADR and bump the number. Keep it short: **Context** (why we had to decide),
**Decision** (what we chose), **Consequences** (what follows, good and bad). If an ADR is
replaced later, set `Status: superseded by NNNN` instead of deleting it.
