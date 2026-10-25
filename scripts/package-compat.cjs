const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { _electron: electron } = require('playwright-core');
const { createDemoServer } = require('./demo-server.cjs');
const { releasePaths } = require('./package-mac.cjs');

async function run() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'reqdelta-compat-'));
  const server = createDemoServer();
  let requests = 0;
  server.on('request', () => { requests += 1; });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.REQDELTA_DEV_URL;
  const sourceOptions = { executablePath: require('electron'), args: ['.', `--user-data-dir=${profile}`], cwd: path.join(__dirname, '..'), env };
  const packagedOptions = { ...sourceOptions, executablePath: releasePaths().executable, args: [`--user-data-dir=${profile}`] };
  let desktop;
  const errors = [];

  async function launch(options, packaged) {
    desktop = await electron.launch(options);
    const page = await desktop.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: 'A closer look at your API.', exact: true }).waitFor();
    const state = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, profile: app.getPath('userData'), name: app.getName() }));
    assert.deepEqual(state, { packaged, profile: path.resolve(profile), name: 'ReqDelta' });
    return page;
  }

  try {
    let page = await launch(sourceOptions, false);
    const seeded = await page.evaluate(async (origin) => {
      const collection = await window.reqdelta.createCollection({ name: 'Packaging compatibility' });
      if (!collection.ok) return collection;
      const request = {
        method: 'GET', url: `${origin}/students/101?token=made-up-package-url-secret`, queryParams: [],
        headers: [{ enabled: true, name: 'Authorization', value: 'Bearer made-up-package-header-secret' }],
        body: { mode: 'none', text: 'made-up-inactive-package-draft' },
      };
      const saved = await window.reqdelta.createSavedRequest({ collectionId: collection.collection.id, name: 'Saved during development', request });
      if (!saved.ok) return saved;
      const before = await window.reqdelta.sendRequest({ ...request, savedRequestId: saved.savedRequest.id });
      const after = await window.reqdelta.sendRequest({ ...request, savedRequestId: saved.savedRequest.id, queryParams: [{ enabled: true, name: 'version', value: '2' }] });
      return { ok: true, collectionId: collection.collection.id, savedId: saved.savedRequest.id, request, before, after };
    }, origin);
    assert.equal(seeded.ok, true);
    assert.equal(seeded.before.history.saved, true);
    assert.equal(seeded.after.history.saved, true);
    assert.equal(requests, 2);
    await desktop.close();
    desktop = null;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));

    page = await launch(packagedOptions, true);
    const saved = await page.evaluate((id) => window.reqdelta.getSavedRequest({ id }), seeded.savedId);
    assert.equal(saved.ok, true, 'The packaged app must decrypt the development configuration.');
    assert.equal(saved.savedRequest.request.url, seeded.request.url);
    assert.equal(saved.savedRequest.request.headers[0].value, seeded.request.headers[0].value);
    assert.deepEqual(saved.savedRequest.request.body, seeded.request.body);
    const selection = { beforeId: seeded.before.history.id, afterId: seeded.after.history.id };
    const comparison = await page.evaluate((pair) => window.reqdelta.compareHistory(pair), selection);
    assert.equal(comparison.ok, true, 'The packaged app must decrypt both development snapshots.');
    assert.equal(comparison.comparison.counts.total, 3);
    assert.equal(requests, 2);
    const fromPackage = await page.evaluate((input) => window.reqdelta.createSavedRequest(input), { collectionId: seeded.collectionId, name: 'Saved in packaged app', request: seeded.request });
    assert.equal(fromPackage.ok, true);

    // Starting the same packaged workspace twice should focus the first window,
    // exit the second process, and leave one usable app/database connection.
    await promisify(execFile)(packagedOptions.executablePath, packagedOptions.args, { env, timeout: 15_000 });
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal((await page.evaluate(() => window.reqdelta.listHistory())).entries.length, 2);
    await desktop.close();
    desktop = null;

    page = await launch(sourceOptions, false);
    const reopened = await page.evaluate((id) => window.reqdelta.getSavedRequest({ id }), fromPackage.savedRequest.id);
    assert.equal(reopened.ok, true, 'Development must also read the packaged configuration on this Mac/account.');
    assert.equal(reopened.savedRequest.request.url, seeded.request.url);
    assert.equal(reopened.savedRequest.request.headers[0].value, seeded.request.headers[0].value);
    assert.deepEqual(reopened.savedRequest.request.body, seeded.request.body);
    assert.equal((await page.evaluate((pair) => window.reqdelta.compareHistory(pair), selection)).comparison.counts.total, 3);
    assert.equal(requests, 2);
    await desktop.close();
    desktop = null;
    const bytes = await fs.readFile(path.join(profile, 'reqdelta.sqlite'));
    for (const secret of ['made-up-package-url-secret', 'made-up-package-header-secret', 'made-up-inactive-package-draft']) assert.equal(bytes.includes(Buffer.from(secret)), false);
    assert.deepEqual(errors, []);
    console.log('Packaging compatibility passed: encrypted development data opens in the packaged app, packaged configurations reopen in development, stored responses compare offline, credentials remain encrypted, and a second instance exits cleanly.');
  } finally {
    if (desktop) await desktop.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
