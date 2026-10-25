const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const os = require('node:os');
const path = require('node:path');
const { createDiskImage } = require('./disk-image.cjs');

const runFile = promisify(execFile);
const ROOT = path.join(__dirname, '..');

function releasePaths(root = ROOT, arch = process.arch, version = require('../package.json').version) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Packaging supports Apple silicon or Intel Macs.');
  const directory = path.join(root, 'release', `ReqDelta-darwin-${arch}`);
  const app = path.join(directory, 'ReqDelta.app');
  const image = path.join(root, 'release', `ReqDelta-${version}-mac-${arch}.dmg`);
  return { directory, app, executable: path.join(app, 'Contents', 'MacOS', 'ReqDelta'), image, checksum: `${image}.sha256` };
}

async function stageApplication(root, destination) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.access(path.join(root, 'dist', 'index.html'));
  await fs.mkdir(path.join(destination, 'electron', 'migrations'), { recursive: true });
  // React is already compiled into dist. Main/preload use only Node/Electron.
  // Never copy the whole checkout, node_modules, or the user's workspace data.
  await fs.writeFile(path.join(destination, 'package.json'), `${JSON.stringify({
    name: manifest.name, productName: manifest.productName, version: manifest.version,
    description: manifest.description, private: true, type: 'commonjs', main: manifest.main,
  }, null, 2)}\n`);
  await fs.cp(path.join(root, 'dist'), path.join(destination, 'dist'), { recursive: true });
  for (const entry of await fs.readdir(path.join(root, 'electron'), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.cjs')) {
      await fs.copyFile(path.join(root, 'electron', entry.name), path.join(destination, 'electron', entry.name));
    }
  }
  for (const entry of await fs.readdir(path.join(root, 'electron', 'migrations'), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      await fs.copyFile(path.join(root, 'electron', 'migrations', entry.name), path.join(destination, 'electron', 'migrations', entry.name));
    }
  }
  return manifest;
}

async function packageMac() {
  if (process.platform !== 'darwin') throw new Error('Build this macOS package on a Mac.');
  const { packager } = await import('@electron/packager');
  const paths = releasePaths();
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'reqdelta-package-'));
  try {
    const source = path.join(staging, 'app');
    const manifest = await stageApplication(ROOT, source);
    const notices = path.join(staging, 'THIRD_PARTY_NOTICES');
    await fs.mkdir(notices);
    for (const [from, to] of [
      ['electron/dist/LICENSE', 'Electron-LICENSE.txt'],
      ['electron/dist/LICENSES.chromium.html', 'Chromium-LICENSES.html'],
      ['react/LICENSE', 'React-LICENSE.txt'],
      ['react-dom/LICENSE', 'ReactDOM-LICENSE.txt'],
    ]) await fs.copyFile(path.join(ROOT, 'node_modules', from), path.join(notices, to));

    await packager({
      dir: source,
      out: path.join(ROOT, 'release'),
      name: 'ReqDelta',
      platform: 'darwin',
      arch: process.arch,
      electronVersion: require('electron/package.json').version,
      download: { checksums: require('electron/checksums.json') },
      appBundleId: 'com.harshk1911.reqdelta',
      appCategoryType: 'public.app-category.developer-tools',
      appVersion: manifest.version,
      buildVersion: manifest.version,
      asar: true,
      prune: false,
      overwrite: true,
      extraResource: [notices],
      // A local ad-hoc signature needs no Apple developer account. It is not
      // a Developer ID signature or notarization for public distribution.
      osxSign: {
        identity: '-', identityValidation: false, continueOnError: false,
        preAutoEntitlements: false, preEmbedProvisioningProfile: false,
        optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
      },
    });
    await runFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', paths.app]);
    const temporaryImage = path.join(staging, path.basename(paths.image));
    await createDiskImage(paths.app, temporaryImage, staging);
    await fs.copyFile(temporaryImage, paths.image);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(paths.image)) digest.update(chunk);
    await fs.writeFile(paths.checksum, `${digest.digest('hex')}  ${path.basename(paths.image)}\n`);
    const size = (await fs.stat(paths.image)).size;
    console.log(`Application: ${paths.app}\nSubmission DMG: ${paths.image}\nSize: ${(size / 1_000_000).toFixed(1)} MB (${(size / 1024 / 1024).toFixed(1)} MiB)\nSHA-256: ${paths.checksum}`);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (require.main === module) packageMac().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { releasePaths, stageApplication };
