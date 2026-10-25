// Bump the desktop app version, commit and tag it. Pushing the tag builds and publishes the
// release on GitHub (.github/workflows/desktop.yml); installed apps then update themselves.
// Usage: npm run release -- patch|minor|major
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const bump = process.argv[2] ?? 'patch';
const sh = (cmd) => execSync(cmd, { stdio: 'pipe' }).toString().trim();

if (sh('git status --porcelain')) throw new Error('Commit or stash your changes first.');
const path = 'apps/desktop/package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[bump];
if (!pkg.version) throw new Error(`Unknown bump "${bump}"; use patch, minor or major.`);
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
sh('npm install --package-lock-only --no-audit --no-fund');
sh(`git add ${path} package-lock.json`);
sh(`git commit -m "chore(release): v${pkg.version}"`);
sh(`git tag v${pkg.version}`);
console.log(`Tagged v${pkg.version}. Publish it with:\n  git push --follow-tags`);
