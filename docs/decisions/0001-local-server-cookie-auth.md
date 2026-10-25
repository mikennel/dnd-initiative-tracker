# 0001: Local server with DDB session cookie

- Status: accepted
- Date: 2026-10-25

## Context
DDB has no public API. Its JSON services reject cross-origin requests from anything but DDB
pages, and require a bearer token minted from the `CobaltSession` cookie. We considered:
1. A local Node server that holds the cookie and proxies requests.
2. A Chrome extension running inside a logged-in DDB tab.
3. A cloud-hosted backend.

## Decision
A local Node server (`apps/server`). The DM pastes their `CobaltSession` cookie once on the
Settings page. It is stored in `apps/server/data/secrets.json` (gitignored). The server
exchanges it for a short-lived token (TTL 300 s), caches the token, and refreshes on 401.
The browser app only ever talks to our server.

## Consequences
- Works from any device on the LAN (tablet, TV) without each device having DDB access.
- The cookie expires every few weeks. The UI must show a clear "reconnect" state when it does.
- The cookie is a full session credential. It never leaves the DM's machine and is never logged.
- A Chrome extension "import this page" button stays an optional later addition.
