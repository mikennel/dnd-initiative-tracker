# 0007: Read the D&D Beyond login straight from Firefox

- Status: accepted
- Date: 2026-10-25

## Context
The DM mainly uses Firefox. The extension from ADR 0006 works in Firefox too, but release
Firefox only keeps add-ons that are signed by addons.mozilla.org. Unsigned ones are removed
on restart. That would mean an AMO account and a signing step just to log in. The app can't
get the cookie from a browser over the network: it's HttpOnly, and D&D Beyond's CORS blocks
other origins.

## Decision
- **Firefox:** the server reads `CobaltSession` from the user's own Firefox profiles
  (`apps/server/src/ddb/firefoxCookies.ts`). Firefox stores cookies unencrypted in
  `cookies.sqlite`. Profiles come from `profiles.ini` on Windows, macOS and Linux (including
  snap and flatpak). The database and its WAL are copied to a temp dir, because Firefox holds
  them open. Only the CobaltSession row for the dndbeyond.com hosts is read, and the copy is
  deleted right away. Candidates are tried most recently used first, until D&D Beyond accepts one.
  Trigger: Settings → **Use my Firefox login**, `POST /api/settings/ddb/firefox`, loopback only.
- **Chrome:** stays with the extension. Chrome encrypts its cookie store with a key bound to
  Chrome itself. Decrypting that from another program is exactly what credential-stealing
  malware does, so we won't do it, and antivirus would flag the app if we did.
- The extension is now cross-browser (one folder, MV3, `browser`/`chrome` namespaces,
  `background.scripts` for Firefox), for anyone who prefers it.

## Consequences
- Firefox users connect with one click and no installs.
- The DDB session must be persistent in Firefox ("stay signed in"). Session-only cookies
  aren't written to `cookies.sqlite`.
- Firefox containers: a login made inside a container is also found (any `originAttributes`).
- If Firefox changes its cookie storage, this breaks quietly. The 404 message and the paste
  fallback cover that.
