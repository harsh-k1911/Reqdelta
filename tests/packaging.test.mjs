import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import packaging from '../scripts/package-mac.cjs';

const { stageApplication, releasePaths } = packaging;
const temporary = [];
afterEach(async () => {
  for (const directory of temporary.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe('packaging runtime contents', () => {
  it('stages only built UI, runtime modules, migrations, and a minimal manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reqdelta-stage-'));
    temporary.push(root);
    const source = path.join(root, 'source');
    const staged = path.join(root, 'staged');
    for (const folder of ['electron/migrations', 'dist/assets', 'src', 'node_modules', 'tests', '.git']) await fs.mkdir(path.join(source, folder), { recursive: true });
    const manifest = { name: 'reqdelta', productName: 'ReqDelta', version: '0.1.0', description: 'Desktop tool', main: 'electron/main.cjs', scripts: { dev: 'private command' }, dependencies: { react: '19.3.1' }, devDependencies: { electron: '45.0.0' } };
    await fs.writeFile(path.join(source, 'package.json'), JSON.stringify(manifest));
    for (const filename of ['dist/index.html', 'dist/assets/app.js', 'dist/assets/app.css', 'electron/main.cjs', 'electron/preload.cjs', 'electron/migrations/001.sql', '.env', 'private.sqlite', 'electron/private.sqlite', 'electron/.env', 'electron/migrations/private.db', 'src/App.jsx', 'tests/example.test.mjs', '.git/config']) await fs.writeFile(path.join(source, filename), filename);
    expect(await stageApplication(source, staged)).toEqual(manifest);
    expect((await fs.readdir(staged)).sort()).toEqual(['dist', 'electron', 'package.json']);
    expect((await fs.readdir(path.join(staged, 'electron'))).sort()).toEqual(['main.cjs', 'migrations', 'preload.cjs']);
    expect(await fs.readdir(path.join(staged, 'electron', 'migrations'))).toEqual(['001.sql']);
    expect(await fs.readFile(path.join(staged, 'dist', 'assets', 'app.js'), 'utf8')).toBe('dist/assets/app.js');
    const packaged = JSON.parse(await fs.readFile(path.join(staged, 'package.json'), 'utf8'));
    expect(packaged).toEqual({ name: 'reqdelta', productName: 'ReqDelta', version: '0.1.0', description: 'Desktop tool', main: 'electron/main.cjs', private: true, type: 'commonjs' });
  });

  it('refuses to stage a checkout without a built interface', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reqdelta-no-build-'));
    temporary.push(root);
    await fs.writeFile(path.join(root, 'package.json'), '{}');
    await expect(stageApplication(root, path.join(root, 'out'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['arm64', 'x64'])('identifies the %s app and executable in generated output', (arch) => {
    const result = releasePaths('/project', arch);
    expect(result.app).toBe(`/project/release/ReqDelta-darwin-${arch}/ReqDelta.app`);
    expect(result.executable).toBe(`${result.app}/Contents/MacOS/ReqDelta`);
    expect(result.image).toBe(`/project/release/ReqDelta-0.1.0-mac-${arch}.dmg`);
    expect(result.checksum).toBe(`${result.image}.sha256`);
  });

  it('rejects unsupported architectures instead of producing a misleading target name', () => {
    expect(() => releasePaths('/project', 'ia32')).toThrow('Packaging supports');
  });
});
