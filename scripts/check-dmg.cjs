const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { releasePaths } = require('./package-mac.cjs');
const { withMountedImage } = require('./disk-image.cjs');

async function checkDiskImage() {
  const paths = releasePaths();
  const runFile = promisify(execFile);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(paths.image)) hash.update(chunk);
  assert.equal(await fs.readFile(paths.checksum, 'utf8'), `${hash.digest('hex')}  ${path.basename(paths.image)}\n`);
  await runFile('/usr/bin/hdiutil', ['verify', paths.image]);
  await withMountedImage(paths.image, async (mount) => {
    assert.deepEqual((await fs.readdir(mount)).filter((name) => !name.startsWith('.')).sort(), ['Applications', 'Install ReqDelta.txt', 'ReqDelta.app']);
    assert.equal(await fs.readlink(path.join(mount, 'Applications')), '/Applications');
    const app = path.join(mount, 'ReqDelta.app');
    await runFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const info = path.join(app, 'Contents', 'Info.plist');
    const identifier = await runFile('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', info]);
    assert.equal(identifier.stdout.trim(), 'com.harshk1911.reqdelta');
    await fs.access(path.join(app, 'Contents', 'Resources', 'app.asar'));
    await fs.access(path.join(app, 'Contents', 'Resources', 'THIRD_PARTY_NOTICES', 'Electron-LICENSE.txt'));
  });
  console.log('DMG checks passed: checksum, disk-image integrity, read-only mounting, Applications shortcut, app identity, bundle signature, runtime archive, and license notices. No desktop app was launched.');
}

if (require.main === module) checkDiskImage().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { checkDiskImage };
