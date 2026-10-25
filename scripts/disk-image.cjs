const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const runFile = promisify(execFile);

async function createDiskImage(app, image, staging) {
  const contents = path.join(staging, 'disk-contents');
  await fs.mkdir(contents);
  // ditto preserves the bundle's permissions, framework symlinks, and signature.
  await runFile('/usr/bin/ditto', [app, path.join(contents, 'ReqDelta.app')]);
  await fs.symlink('/Applications', path.join(contents, 'Applications'));
  await fs.writeFile(path.join(contents, 'Install ReqDelta.txt'), [
    'ReqDelta - Desktop API Testing and JSON Response Comparison',
    '',
    '1. Drag ReqDelta.app to the Applications shortcut.',
    '2. Eject this disk image.',
    '3. Open ReqDelta from Applications.',
    '',
    `Architecture: ${process.arch === 'arm64' ? 'Apple silicon (M-series)' : 'Intel (x64)'}.`,
    'The app contains Electron and does not need a separate Node installation.',
    'The included source project has a separate local demo API: npm run demo.',
    'Use that demo server for localhost examples, or enter another HTTP/HTTPS API URL.',
    '',
    'This is a college demonstration build with a local ad-hoc signature.',
    'It is not Apple Developer ID signed or notarized for public distribution.',
    'If macOS blocks a downloaded copy, review it in System Settings > Privacy & Security.',
    'Allow Keychain access when prompted to save/open encrypted workspace data.',
    'Workspace data is stored separately from the app, on the current Mac/account.',
    '',
  ].join('\n'));
  await runFile('/usr/bin/hdiutil', ['create', '-volname', 'ReqDelta', '-srcfolder', contents, '-fs', 'HFS+', '-format', 'ULMO', image]);
  await runFile('/usr/bin/hdiutil', ['verify', image]);
}

async function withMountedImage(image, inspect) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reqdelta-dmg-check-'));
  const mount = path.join(temporary, 'volume');
  await fs.mkdir(mount);
  let mounted = false;
  try {
    await runFile('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, image]);
    mounted = true;
    return await inspect(mount);
  } finally {
    if (mounted) {
      await runFile('/usr/bin/hdiutil', ['detach', mount]);
    }
    // If detach fails, leave its mount directory in place for inspection.
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

module.exports = { createDiskImage, withMountedImage };
