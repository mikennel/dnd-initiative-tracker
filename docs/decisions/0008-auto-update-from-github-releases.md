# 0008: Auto-update from GitHub Releases

- Status: accepted
- Date: 2026-10-25

## Context
The DM wants to update the desktop app from inside the app. The repository is public, so its
GitHub Releases can serve updates without a token in the app. The builds are unsigned (ADR 0006).

## Decision
- `electron-updater` with the GitHub provider (`build.publish` in `apps/desktop/package.json`).
  It checks at start-up and every 4 hours, plus **Help → Check for Updates…**.
- **Windows:** downloads in the background, then asks "Restart now / Later". Later installs
  on quit. Unsigned NSIS updates work, because no `publisherName` is set, so there is no
  signature check.
- **macOS:** Squirrel.Mac refuses to install unsigned apps, so the app only says a new version
  exists and opens the release page. True self-update there needs an Apple Developer ID ($99/yr).
- **Releasing:** `npm run release -- patch|minor|major` bumps `apps/desktop` version, commits
  and tags. `git push --follow-tags` then runs `.github/workflows/desktop.yml`: Windows and
  macOS build in parallel, and one final job creates the GitHub Release with every installer
  and the `latest*.yml` update manifests. A single publisher avoids the two builds racing to
  create the release.
- Artifact names have no spaces (`dnd-initiative-tracker-setup-x.y.z.exe`), because GitHub
  renames spaces in asset names, which would break the URLs in `latest.yml`.

## Consequences
- Releases are public downloads (the repo is public).
- The update manifest is trusted as served by GitHub over HTTPS, with sha512 checks on the
  download. There's no code-signing check, because there's no signature.
- If the repo goes private, updates stop working unless a token is shipped, which we won't do.
