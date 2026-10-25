// macOS: give the unsigned app an ad-hoc signature (ADR 0006). Apple Silicon refuses to run
// code with no signature at all ("is damaged"), and electron-builder skips signing because
// there's no Developer ID. Ad-hoc signing is free; Gatekeeper still asks once ("Open Anyway").
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
