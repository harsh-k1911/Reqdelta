const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright-core');
const { createDemoServer } = require('./demo-server.cjs');

async function run() {
  const server = createDemoServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'reqdelta-smoke-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.REQDELTA_DEV_URL;
  const launchOptions = {
    executablePath: require('electron'),
    args: ['.', `--user-data-dir=${userData}`],
    cwd: path.join(__dirname, '..'),
    env,
  };
  let desktop;
  try {
    desktop = await electron.launch(launchOptions);
    const page = await desktop.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: 'A closer look at your API.' }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.deepEqual(await page.evaluate(() => Object.keys(window.reqdelta)), ['sendRequest', 'listCollections', 'createCollection']);

    const storage = await desktop.evaluate(({ app }) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const path = process.getBuiltinModule('node:path');
      const database = new DatabaseSync(path.join(app.getPath('userData'), 'reqdelta.sqlite'));
      try {
        return {
          directory: app.getPath('userData'),
          version: database.prepare('PRAGMA user_version').get().user_version,
          tables: database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map((row) => row.name),
          collections: database.prepare('SELECT count(*) AS total FROM collections').get().total,
        };
      } finally { database.close(); }
    });
    assert.equal(storage.directory, path.resolve(userData));
    assert.equal(storage.version, 1);
    assert.deepEqual(storage.tables, ['collections', 'request_history', 'saved_requests']);
    assert.equal(storage.collections, 0);

    await page.getByText('No collections yet. Use + to create your first group.', { exact: true }).waitFor();
    const newCollection = page.getByRole('button', { name: 'New collection', exact: true });
    const collectionName = page.getByRole('textbox', { name: 'Collection name', exact: true });
    const createCollection = page.getByRole('button', { name: 'Create collection', exact: true });
    const collectionList = page.getByRole('list', { name: 'Collections', exact: true });
    await newCollection.click();
    await collectionName.fill('Do not save this');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await collectionName.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.reqdelta.listCollections()), { ok: true, collections: [] });

    await newCollection.click();
    await collectionName.fill('   ');
    await createCollection.click();
    await page.getByRole('alert').filter({ hasText: '1–100 characters' }).waitFor();
    assert.equal(await collectionName.inputValue(), '   ');
    assert.equal(await createCollection.isEnabled(), true);
    await collectionName.fill('x'.repeat(101));
    await createCollection.click();
    await page.getByRole('alert').filter({ hasText: '1–100 characters' }).waitFor();

    const collectionNames = ['Student API', "Harsh's café API 😀", '<b>Learning API</b>', 'x'.repeat(100)];
    for (const [index, name] of collectionNames.entries()) {
      if (index > 0) await newCollection.click();
      await collectionName.fill(index === 0 ? `  ${name}  ` : name);
      await collectionName.press('Enter');
      await collectionList.getByText(name, { exact: true }).waitFor();
      await collectionName.waitFor({ state: 'hidden' });
    }
    assert.deepEqual(await collectionList.getByRole('listitem').allTextContents(), [...collectionNames].reverse());
    assert.equal(await collectionList.locator('b').count(), 0); // Names render as text, including markup.
    assert.equal((await page.evaluate(() => window.reqdelta.createCollection({ name: 12 }))).error.code, 'INVALID_COLLECTION');
    const createdCollections = await page.evaluate(() => window.reqdelta.listCollections());
    assert.equal(createdCollections.ok, true);
    assert.equal(createdCollections.collections.length, 4);
    await fs.mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/desktop-collections.png' });

    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
    await newCollection.click();
    await collectionName.fill(' ');
    await createCollection.click();
    await page.getByRole('alert').filter({ hasText: '1–100 characters' }).waitFor();
    await page.screenshot({ path: 'test-results/desktop-collection-form-small.png' });
    await collectionList.getByText('Student API', { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.locator('.sidebar').evaluate((element) => element.scrollHeight <= element.clientHeight), true);
    assert.equal(await collectionList.getByText('Student API', { exact: true }).evaluate((element) => {
      const row = element.getBoundingClientRect();
      const panel = element.closest('.collections-panel').getBoundingClientRect();
      return row.height > 0 && row.top >= panel.top && row.bottom <= panel.bottom;
    }), true);
    await page.screenshot({ path: 'test-results/desktop-collections-small.png' });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));

    const url = page.getByRole('textbox', { name: 'Request URL' });
    const method = page.getByRole('combobox', { name: 'HTTP method' });
    const send = page.getByRole('button', { name: 'Send request' });
    const requestOptions = page.getByRole('tablist', { name: 'Request options' });
    const responseDetails = page.getByRole('tablist', { name: 'Response details' });
    await url.fill(`${origin}/students/101`);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.match(await page.locator('#response-body').innerText(), /"name": "Rahul"/);
    await responseDetails.getByRole('tab', { name: /Headers/ }).click();
    await page.getByRole('cell', { name: 'content-type', exact: true }).waitFor();
    await responseDetails.getByRole('tab', { name: 'Body', exact: true }).click();
    await page.getByRole('button', { name: 'Pretty', exact: true }).click();
    assert.match(await page.locator('#response-body').innerText(), /"name":"Rahul"/);
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    await fs.mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/desktop-response.png' });

    for (const selectedMethod of ['GET', 'POST', 'PUT', 'DELETE']) {
      await method.selectOption(selectedMethod);
      await page.getByRole('button', { name: 'Method echo', exact: true }).click();
      assert.equal(await method.inputValue(), selectedMethod);
      await url.fill(`${origin}/echo`);
      await send.click();
      await page.locator('#response-body').filter({ hasText: `"method": "${selectedMethod}"` }).waitFor();
      const echoed = JSON.parse(await page.locator('#response-body').innerText());
      assert.equal(echoed.method, selectedMethod);
    }

    await method.selectOption('GET');
    await url.fill(`${origin}/echo?tag=original&keep=1`);
    const addParam = page.getByRole('button', { name: 'Add parameter' });
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 1 name', exact: true }).fill('q');
    await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).fill('tea & coffee + café');
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 2 name', exact: true }).fill('tag');
    await page.getByRole('textbox', { name: 'Parameter 2 value', exact: true }).fill('second');
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 3 name', exact: true }).fill('ignored');
    await page.getByRole('textbox', { name: 'Parameter 3 value', exact: true }).fill('disabled value');
    await page.getByRole('checkbox', { name: 'Enable parameter 3', exact: true }).uncheck();
    await addParam.click(); // A completely blank row should not add a parameter.
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.deepEqual(JSON.parse(await page.locator('#response-body').innerText()).queryParams, [
      { key: 'tag', value: 'original' },
      { key: 'keep', value: '1' },
      { key: 'q', value: 'tea & coffee + café' },
      { key: 'tag', value: 'second' },
    ]);
    await page.screenshot({ path: 'test-results/desktop-query-params.png' });

    await page.getByRole('button', { name: 'Remove parameter 1', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Parameter 1 name', exact: true }).inputValue(), 'tag');
    assert.equal(await page.getByRole('checkbox', { name: 'Enable parameter 2', exact: true }).isChecked(), false);
    await page.getByRole('textbox', { name: 'Parameter 3 value', exact: true }).fill('missing name');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'Query parameter 3 needs a name' }).waitFor();
    await page.getByRole('textbox', { name: 'Parameter 3 name', exact: true }).fill('empty');
    const emptyValue = page.getByRole('textbox', { name: 'Parameter 3 value', exact: true });
    await emptyValue.fill('');
    await emptyValue.press('Meta+Enter');
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.deepEqual(JSON.parse(await page.locator('#response-body').innerText()).queryParams, [
      { key: 'tag', value: 'original' },
      { key: 'keep', value: '1' },
      { key: 'tag', value: 'second' },
      { key: 'empty', value: '' },
    ]);

    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
    await page.screenshot({ path: 'test-results/desktop-query-params-small.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));
    await page.getByRole('button', { name: 'Student JSON', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: /^Parameter \d+ name$/ }).count(), 0);

    await page.getByRole('button', { name: 'Method echo', exact: true }).click();
    await url.fill(`${origin}/echo`);
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 1 name', exact: true }).fill('page');
    await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).fill('2');
    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    const addHeader = page.getByRole('button', { name: 'Add header' });
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 1 name', exact: true }).fill('Accept');
    await page.getByRole('textbox', { name: 'Header 1 value', exact: true }).fill('application/json');
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 2 name', exact: true }).fill('X-Demo-Client');
    await page.getByRole('textbox', { name: 'Header 2 value', exact: true }).fill('ReqDelta');
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 3 name', exact: true }).fill('X-Skip');
    await page.getByRole('textbox', { name: 'Header 3 value', exact: true }).fill('disabled value');
    await page.getByRole('checkbox', { name: 'Enable header 3', exact: true }).uncheck();
    await addHeader.click();

    await requestOptions.getByRole('tab', { name: 'Params', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).inputValue(), '2');
    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Header 2 value', exact: true }).inputValue(), 'ReqDelta');
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    const echoedHeaders = JSON.parse(await page.locator('#response-body').innerText());
    assert.equal(echoedHeaders.headers.accept, 'application/json');
    assert.equal(echoedHeaders.headers['x-demo-client'], 'ReqDelta');
    assert.equal(echoedHeaders.headers['x-skip'], undefined);
    assert.deepEqual(echoedHeaders.queryParams, [{ key: 'page', value: '2' }]);
    await page.screenshot({ path: 'test-results/desktop-request-headers.png' });

    await page.getByRole('textbox', { name: 'Header 4 name', exact: true }).fill('accept');
    await page.getByRole('textbox', { name: 'Header 4 value', exact: true }).fill('text/plain');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'repeated' }).waitFor();
    await page.getByRole('checkbox', { name: 'Enable header 4', exact: true }).uncheck();
    await page.getByRole('textbox', { name: 'Header 2 name', exact: true }).fill('Bad Name');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'invalid name or value' }).waitFor();
    await page.getByRole('textbox', { name: 'Header 2 name', exact: true }).fill('X-Demo-Client');
    await page.getByRole('textbox', { name: 'Header 1 name', exact: true }).fill('Content-Length');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'manages the Content-Length header automatically' }).waitFor();

    await page.getByRole('button', { name: 'Remove header 1', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Header 1 name', exact: true }).inputValue(), 'X-Demo-Client');
    assert.equal(await page.getByRole('checkbox', { name: 'Enable header 2', exact: true }).isChecked(), false);
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 4 name', exact: true }).fill('X-Empty');
    await page.getByRole('textbox', { name: 'Header 4 value', exact: true }).press('Meta+Enter');
    await page.getByText('200 OK', { exact: true }).waitFor();
    const afterRemoval = JSON.parse(await page.locator('#response-body').innerText());
    assert.equal(afterRemoval.headers['x-demo-client'], 'ReqDelta');
    assert.equal(afterRemoval.headers['x-empty'], '');
    assert.equal(afterRemoval.headers['x-skip'], undefined);
    assert.notEqual(afterRemoval.headers.accept, 'application/json');

    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#response-body').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/desktop-request-headers-small.png' });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));
    await page.getByRole('button', { name: 'Student JSON', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: /^Parameter \d+ name$/ }).count(), 0);
    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: /^Header \d+ name$/ }).count(), 0);
    await requestOptions.getByRole('tab', { name: 'Params', exact: true }).click();

    await requestOptions.getByRole('tab', { name: 'Body', exact: true }).click();
    const bodyType = page.getByLabel('Body type', { exact: true });
    assert.equal(await bodyType.inputValue(), 'none');
    assert.equal(await page.getByRole('option', { name: 'JSON', exact: true }).isDisabled(), true);
    await method.selectOption('POST');
    await url.fill(`${origin}/echo`);
    await bodyType.selectOption('json');
    await page.getByRole('button', { name: 'Use sample JSON', exact: true }).click();
    const bodyInput = page.getByRole('textbox', { name: 'JSON request body', exact: true });
    assert.deepEqual(JSON.parse(await bodyInput.inputValue()), { name: 'Rahul', branch: 'CSE' });
    const bodyText = '{\n  "name": "Harsh",\n  "city": "पुणे",\n  "active": false,\n  "score": 0\n}';
    await bodyInput.fill(bodyText);

    await requestOptions.getByRole('tab', { name: 'Params', exact: true }).click();
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 1 name', exact: true }).fill('page');
    await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).fill('2');
    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 1 name', exact: true }).fill('X-Demo-Client');
    await page.getByRole('textbox', { name: 'Header 1 value', exact: true }).fill('ReqDelta');
    await requestOptions.getByRole('tab', { name: 'Body', exact: true }).click();
    assert.equal(await bodyInput.inputValue(), bodyText);
    await bodyInput.press('Meta+Enter');
    await page.getByText('200 OK', { exact: true }).waitFor();
    const echoedBody = JSON.parse(await page.locator('#response-body').innerText());
    assert.deepEqual(echoedBody.body, { name: 'Harsh', city: 'पुणे', active: false, score: 0 });
    assert.equal(echoedBody.rawBody, bodyText);
    assert.equal(echoedBody.headers['content-type'], 'application/json');
    assert.equal(echoedBody.headers['x-demo-client'], 'ReqDelta');
    assert.deepEqual(echoedBody.queryParams, [{ key: 'page', value: '2' }]);
    await page.screenshot({ path: 'test-results/desktop-json-body.png' });

    for (const selectedMethod of ['PUT', 'DELETE']) {
      await method.selectOption(selectedMethod);
      await send.click();
      await page.getByText('200 OK', { exact: true }).waitFor();
      const result = JSON.parse(await page.locator('#response-body').innerText());
      assert.equal(result.method, selectedMethod);
      assert.equal(result.rawBody, bodyText);
    }

    await bodyInput.fill('{"name":"Harsh",}');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'not valid JSON' }).waitFor();
    assert.equal(await send.isEnabled(), true);
    await bodyType.selectOption('none');
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    const withoutBody = JSON.parse(await page.locator('#response-body').innerText());
    assert.equal(withoutBody.rawBody, '');
    assert.equal(withoutBody.body, null);
    assert.equal(withoutBody.headers['content-type'], undefined);

    await bodyType.selectOption('json');
    assert.equal(await bodyInput.inputValue(), '{"name":"Harsh",}');
    await bodyInput.fill(bodyText);
    await method.selectOption('GET');
    assert.equal(await bodyType.inputValue(), 'none');
    assert.equal(await page.getByRole('option', { name: 'JSON', exact: true }).isDisabled(), true);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.equal(JSON.parse(await page.locator('#response-body').innerText()).rawBody, '');
    await method.selectOption('POST');
    assert.equal(await bodyType.inputValue(), 'none');
    await bodyType.selectOption('json');
    assert.equal(await bodyInput.inputValue(), bodyText);

    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 2 name', exact: true }).fill('Content-Type');
    await page.getByRole('textbox', { name: 'Header 2 value', exact: true }).fill('application/vnd.api+json');
    await requestOptions.getByRole('tab', { name: 'Body', exact: true }).click();
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.equal(JSON.parse(await page.locator('#response-body').innerText()).headers['content-type'], 'application/vnd.api+json');

    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
    await bodyInput.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'test-results/desktop-json-body-small.png' });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));
    await page.getByRole('button', { name: 'Student JSON', exact: true }).click();
    await requestOptions.getByRole('tab', { name: 'Body', exact: true }).click();
    assert.equal(await bodyType.inputValue(), 'none');
    await method.selectOption('POST');
    await bodyType.selectOption('json');
    assert.equal(await bodyInput.inputValue(), '');
    await bodyType.selectOption('none');
    await requestOptions.getByRole('tab', { name: 'Params', exact: true }).click();

    await method.selectOption('POST');
    await url.fill(`${origin}/students/101`);
    await send.click();
    await page.getByText('405 Method Not Allowed', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('button', { name: 'Plain text', exact: true }).click();
    assert.equal(await method.inputValue(), 'GET');

    await url.fill(`${origin}/text`);
    await send.click();
    await page.getByText('Hello from the ReqDelta demo API. Text responses work too.', { exact: true }).waitFor();

    await url.fill(`${origin}/status/404`);
    await send.click();
    await page.getByText('404 Not Found', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);

    await url.fill('file:///etc/passwd');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'Only HTTP and HTTPS' }).waitFor();

    await url.fill(`${origin}/students/101`);
    await url.press('Meta+Enter');
    await page.getByText('200 OK', { exact: true }).waitFor();

    await server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'Could not reach the API' }).waitFor();
    assert.equal(await send.isEnabled(), true);

    assert.deepEqual(errors, []);

    await desktop.close();
    desktop = null;
    desktop = await electron.launch(launchOptions);
    const reopenedPage = await desktop.firstWindow();
    reopenedPage.on('pageerror', (error) => errors.push(error.message));
    await reopenedPage.getByRole('heading', { name: 'A closer look at your API.' }).waitFor();
    const reopenedList = reopenedPage.getByRole('list', { name: 'Collections', exact: true });
    await reopenedList.getByText('Student API', { exact: true }).waitFor();
    assert.deepEqual(await reopenedList.getByRole('listitem').allTextContents(), [...collectionNames].reverse());
    assert.deepEqual(await reopenedPage.evaluate(() => window.reqdelta.listCollections()), createdCollections);
    const persisted = await desktop.evaluate(({ app }) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const path = process.getBuiltinModule('node:path');
      const database = new DatabaseSync(path.join(app.getPath('userData'), 'reqdelta.sqlite'));
      try {
        return {
          names: database.prepare('SELECT name FROM collections ORDER BY id').all().map((row) => row.name),
          count: database.prepare('SELECT count(*) AS total FROM collections').get().total,
          savedRequests: database.prepare('SELECT count(*) AS total FROM saved_requests').get().total,
          history: database.prepare('SELECT count(*) AS total FROM request_history').get().total,
          version: database.prepare('PRAGMA user_version').get().user_version,
        };
      } finally { database.close(); }
    });
    assert.deepEqual(persisted, { names: collectionNames, count: 4, savedRequests: 0, history: 0, version: 1 });
    assert.deepEqual(errors, []);
    console.log('Desktop checks passed: collection creation/listing, validation and cancellation, smaller-window layout, UI persistence across an app restart, isolated SQLite storage, no automatic request/history writes yet, and the complete HTTP request workflow.');
  } finally {
    if (desktop) await desktop.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(userData, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
