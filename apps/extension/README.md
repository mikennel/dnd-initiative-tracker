# D&D Beyond connector (browser extension)

Lets the tracker pick up your D&D Beyond login without copying cookies by hand. It works with
Google, Apple or any other sign-in, because you log in in your normal browser. One folder
works in both Chrome and Firefox.

**Firefox users usually don't need this.** Settings → **Use my Firefox login** reads the login
straight from Firefox on the same computer (ADR 0007). The extension is mainly for Chrome.

## Chrome (install once)
1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder. In the desktop app, use
   **File → Show Browser Extension Folder** to find it.

## Firefox
- **Try it out:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** →
  pick `manifest.json`. Firefox removes it when it restarts.
- **Keep it installed:** release Firefox only keeps signed add-ons. Signing for your own use
  is free: create an account on addons.mozilla.org, make API keys under *Tools → Manage API
  Keys*, then run
  `npx web-ext sign --source-dir apps/extension --channel unlisted --api-key <key> --api-secret <secret>`
  and open the `.xpi` it produces in Firefox.
- If Connect does nothing, open the add-on's **Permissions** tab and allow its site access.

## Use
Tracker → **Settings → Connect with this browser** (or, in the desktop app, **Connect with
Chrome**). If you're logged in to D&D Beyond it connects immediately. Otherwise a sign-in tab
opens; log in and the tracker connects on its own.

## What it can do
- Reads one cookie (`CobaltSession` on dndbeyond.com). It doesn't store it, and doesn't talk
  to D&D Beyond itself.
- Talks only to the tracker's own pages on `localhost` ports 5173 and 5175–5177.
