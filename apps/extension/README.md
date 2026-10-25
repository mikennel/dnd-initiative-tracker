# D&D Beyond connector (Chrome extension)

Lets the tracker pick up your D&D Beyond login without copying cookies by hand. It works with
Google, Apple or any other sign-in, because you log in in your normal Chrome.

## Install (once)
1. In Chrome open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder. In the desktop app, use
   **File → Show Chrome Extension Folder** to find it.

## Use
Tracker → **Settings → Connect with Chrome**. If you're already logged in to D&D Beyond in
Chrome it connects immediately. Otherwise a D&D Beyond sign-in tab opens; log in and the
tracker connects on its own.

## What it can do
- Reads one cookie (`CobaltSession` on dndbeyond.com). It doesn't store it, and doesn't talk
  to D&D Beyond itself.
- Talks only to the tracker's own pages on `localhost` ports 5173 and 5175–5177.
