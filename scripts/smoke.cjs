const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright-core');
const { createDemoServer } = require('./demo-server.cjs');

async function run() {
  const server = createDemoServer();
  let requestsReceived = 0;
  server.on('request', () => { requestsReceived += 1; });
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
    assert.deepEqual(await page.evaluate(() => Object.keys(window.reqdelta)), ['sendRequest', 'listCollections', 'createCollection', 'createSavedRequest', 'listSavedRequests', 'getSavedRequest', 'listHistory', 'getHistoryEntry']);

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
    assert.equal(storage.version, 3);
    assert.deepEqual(storage.tables, ['collections', 'request_history', 'saved_requests']);
    assert.equal(storage.collections, 0);
    const historyNav = page.getByRole('button', { name: 'History', exact: true });
    await historyNav.click();
    await page.getByText('No executions yet. Send a request to start your history.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Request builder', exact: true }).click();

    await page.getByText('No collections yet. Use + to create your first group.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await page.getByText('Create a collection with + in the sidebar, then refresh this list.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save to collection', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Cancel save', exact: true }).click();
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
    const notFoundHistoryId = (await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id;

    await url.fill('file:///etc/passwd');
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'Only HTTP and HTTPS' }).waitFor();
    assert.equal((await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id, notFoundHistoryId);

    await url.fill(`${origin}/students/101`);
    await url.press('Meta+Enter');
    await page.getByText('200 OK', { exact: true }).waitFor();

    // Save the builder's configuration without executing it. All secrets below
    // are made-up fixtures, never real credentials from the user's workspace.
    const studentCollectionId = createdCollections.collections.find((item) => item.name === 'Student API').id;
    const otherCollectionId = createdCollections.collections.find((item) => item.name === "Harsh's café API 😀").id;
    const savedUrl = `${origin}/echo?base=kept&api_key=demo-url-secret`;
    const savedBody = '{\n  "student": "Harsh 😀",\n  "token": "demo-body-secret"\n}';
    await page.getByRole('button', { name: 'Method echo', exact: true }).click();
    await method.selectOption('POST');
    await url.fill(savedUrl);
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 1 name', exact: true }).fill('tag');
    await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).fill('extra & café');
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 2 name', exact: true }).fill('not-sent');
    await page.getByRole('textbox', { name: 'Parameter 2 value', exact: true }).fill('disabled draft');
    await page.getByRole('checkbox', { name: 'Enable parameter 2', exact: true }).uncheck();
    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 1 name', exact: true }).fill('Authorization');
    await page.getByRole('textbox', { name: 'Header 1 value', exact: true }).fill('Bearer demo-header-secret');
    await addHeader.click();
    await page.getByRole('textbox', { name: 'Header 2 name', exact: true }).fill('X-Draft');
    await page.getByRole('textbox', { name: 'Header 2 value', exact: true }).fill('not sent');
    await page.getByRole('checkbox', { name: 'Enable header 2', exact: true }).uncheck();
    await requestOptions.getByRole('tab', { name: 'Body', exact: true }).click();
    await bodyType.selectOption('json');
    await bodyInput.fill(savedBody);
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    const saveForm = page.getByRole('form', { name: 'Save request', exact: true });
    const requestName = saveForm.getByRole('textbox', { name: 'Request name', exact: true });
    const saveToCollection = saveForm.getByRole('button', { name: 'Save to collection', exact: true });
    await saveForm.getByRole('combobox', { name: 'Collection', exact: true }).selectOption(String(studentCollectionId));
    await requestName.fill('   ');
    await saveToCollection.click();
    await saveForm.getByRole('alert').filter({ hasText: 'request name' }).waitFor();
    await requestName.fill('Student echo');
    await bodyInput.fill('{broken');
    await saveToCollection.click();
    await saveForm.getByRole('alert').filter({ hasText: 'not valid JSON' }).waitFor();
    await bodyInput.fill(savedBody);
    const beforeSave = requestsReceived;
    await saveToCollection.click();
    await page.getByText('Request saved to your collection.', { exact: true }).waitFor();
    assert.equal(requestsReceived, beforeSave);
    const studentRequests = page.getByRole('list', { name: 'Requests in Student API', exact: true });
    const studentEcho = studentRequests.getByRole('button', { name: /Student echo/ });
    await studentEcho.waitFor();
    const firstSaved = await page.evaluate((collectionId) => window.reqdelta.listSavedRequests({ collectionId }), studentCollectionId);
    assert.equal(firstSaved.savedRequests.length, 1);
    assert.equal(firstSaved.savedRequests[0].method, 'POST');
    await page.screenshot({ path: 'test-results/desktop-saved-request.png' });

    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    let savedEcho = JSON.parse(await page.locator('#response-body').innerText());
    assert.equal(savedEcho.headers.authorization, 'Bearer demo-header-secret');
    assert.equal(savedEcho.rawBody, savedBody);
    assert.deepEqual(savedEcho.queryParams, [{ key: 'base', value: 'kept' }, { key: 'api_key', value: 'demo-url-secret' }, { key: 'tag', value: 'extra & café' }]);
    const firstEchoHistoryId = (await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id;
    const firstEchoHistory = await page.evaluate((id) => window.reqdelta.getHistoryEntry({ id }), firstEchoHistoryId);
    assert.equal(firstEchoHistory.entry.savedRequestId, firstSaved.savedRequests[0].id);
    await method.selectOption('DELETE');
    await url.fill(`${origin}/text`);
    await bodyType.selectOption('none');
    const beforeLoad = requestsReceived;
    await studentEcho.click();
    await page.getByText('Request loaded. Press Send request when you are ready.', { exact: true }).waitFor();
    assert.equal(requestsReceived, beforeLoad);
    assert.equal(await method.inputValue(), 'POST');
    assert.equal(await url.inputValue(), savedUrl);
    assert.equal(await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).inputValue(), 'extra & café');
    assert.equal(await page.getByRole('checkbox', { name: 'Enable parameter 2', exact: true }).isChecked(), false);
    await page.getByText('No response yet', { exact: true }).waitFor();
    await requestOptions.getByRole('tab', { name: 'Headers', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Header 1 value', exact: true }).inputValue(), 'Bearer demo-header-secret');
    assert.equal(await page.getByRole('checkbox', { name: 'Enable header 2', exact: true }).isChecked(), false);
    await requestOptions.getByRole('tab', { name: 'Body', exact: true }).click();
    assert.equal(await bodyType.inputValue(), 'json');
    assert.equal(await bodyInput.inputValue(), savedBody);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    savedEcho = JSON.parse(await page.locator('#response-body').innerText());
    assert.equal(savedEcho.rawBody, savedBody);
    assert.equal(savedEcho.queryParams.filter((item) => item.key === 'tag').length, 1);
    const editedBody = savedBody.replace('Harsh 😀', 'Changed draft');
    await bodyInput.fill(editedBody);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.equal(JSON.parse(await page.locator('#response-body').innerText()).rawBody, editedBody);
    const oldEcho = await page.evaluate((id) => window.reqdelta.getHistoryEntry({ id }), firstEchoHistoryId);
    assert.equal(JSON.parse(oldEcho.entry.outcome.response.body).rawBody, savedBody);

    await page.getByRole('button', { name: 'Student JSON', exact: true }).click();
    await url.fill(`${origin}/students/101?version=2`);
    await page.getByRole('button', { name: 'Save request', exact: true }).click();
    await requestName.fill('Student version 2');
    await saveForm.getByRole('combobox', { name: 'Collection', exact: true }).selectOption(String(otherCollectionId));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
    await saveToCollection.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'test-results/desktop-save-form-small.png' });
    await saveToCollection.click();
    await page.getByText('Request saved to your collection.', { exact: true }).waitFor();
    const otherRequests = page.getByRole('list', { name: "Requests in Harsh's café API 😀", exact: true });
    await otherRequests.getByRole('button', { name: /Student version 2/ }).waitFor();
    assert.equal((await page.evaluate((collectionId) => window.reqdelta.listSavedRequests({ collectionId }), studentCollectionId)).savedRequests.length, 1);
    assert.equal((await page.evaluate((collectionId) => window.reqdelta.listSavedRequests({ collectionId }), otherCollectionId)).savedRequests.length, 1);
    await page.getByRole('button', { name: 'Save as new', exact: true }).click();
    await requestName.fill('Do not save');
    await saveForm.getByRole('button', { name: 'Cancel save', exact: true }).click();
    assert.equal((await page.evaluate((collectionId) => window.reqdelta.listSavedRequests({ collectionId }), otherCollectionId)).savedRequests.length, 1);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));

    await page.getByRole('button', { name: 'Student JSON', exact: true }).click();
    await url.fill(`${origin}/students/101`);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    const originalStudentHistoryId = (await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id;
    await addParam.click();
    await page.getByRole('textbox', { name: 'Parameter 1 name', exact: true }).fill('version');
    await page.getByRole('textbox', { name: 'Parameter 1 value', exact: true }).fill('2');
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    const changedStudentHistoryId = (await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id;

    // A failed history write must keep the real response and never retry the API.
    await desktop.evaluate(({ app }) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const path = process.getBuiltinModule('node:path');
      const database = new DatabaseSync(path.join(app.getPath('userData'), 'reqdelta.sqlite'));
      try { database.exec("CREATE TRIGGER fail_history BEFORE INSERT ON request_history BEGIN SELECT RAISE(ABORT, 'test write failure'); END;"); }
      finally { database.close(); }
    });
    const beforeWriteFailure = requestsReceived;
    await page.getByRole('button', { name: 'Method echo', exact: true }).click();
    await method.selectOption('POST');
    await url.fill(`${origin}/echo`);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'History was not saved.' }).waitFor();
    assert.equal(requestsReceived, beforeWriteFailure + 1);
    assert.equal((await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id, changedStudentHistoryId);
    await desktop.evaluate(({ app }) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const path = process.getBuiltinModule('node:path');
      const database = new DatabaseSync(path.join(app.getPath('userData'), 'reqdelta.sqlite'));
      try { database.exec('DROP TRIGGER fail_history;'); } finally { database.close(); }
    });
    await page.getByRole('button', { name: 'Student JSON', exact: true }).click();
    await url.fill(`${origin}/students/101`);
    const databaseBytes = await fs.readFile(path.join(userData, 'reqdelta.sqlite'));
    for (const secret of ['demo-url-secret', 'demo-header-secret', 'demo-body-secret']) assert.equal(databaseBytes.includes(Buffer.from(secret)), false);

    await server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await send.click();
    await page.getByRole('alert').filter({ hasText: 'Could not reach the API' }).waitFor();
    assert.equal(await send.isEnabled(), true);
    const failedHistoryId = (await page.evaluate(() => window.reqdelta.listHistory())).entries[0].id;
    const beforeInspection = requestsReceived;
    await historyNav.click();
    await page.getByRole('heading', { name: 'Execution history', exact: true }).waitFor();
    await page.getByRole('button', { name: `Open history entry ${failedHistoryId}`, exact: true }).waitFor();
    await page.screenshot({ path: 'test-results/desktop-history.png' });
    const older = page.getByRole('button', { name: 'Older executions', exact: true });
    if (await older.isEnabled()) {
      const firstPageIds = await page.getByRole('button', { name: /^Open history entry / }).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
      const expectedOlderId = await page.evaluate(async () => {
        const first = await window.reqdelta.listHistory();
        const next = await window.reqdelta.listHistory({ beforeId: first.nextBeforeId });
        return next.entries[0].id;
      });
      await older.click();
      await page.getByRole('button', { name: `Open history entry ${expectedOlderId}`, exact: true }).waitFor();
      const olderIds = await page.getByRole('button', { name: /^Open history entry / }).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
      assert.equal(olderIds.some((id) => firstPageIds.includes(id)), false);
      await page.getByRole('button', { name: 'Newest executions', exact: true }).click();
      await page.getByRole('button', { name: `Open history entry ${failedHistoryId}`, exact: true }).waitFor();
    }
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: 'test-results/desktop-history-small.png' });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));

    await page.getByRole('button', { name: `Open history entry ${changedStudentHistoryId}`, exact: true }).click();
    await page.getByText(`Saved execution #${changedStudentHistoryId}`, { exact: true }).waitFor();
    assert.equal(JSON.parse(await page.locator('#response-body').innerText()).fullName, 'Rahul');
    assert.equal(JSON.parse(await page.locator('#response-body').innerText()).age, '20');
    await responseDetails.getByRole('tab', { name: /Headers/ }).click();
    await page.getByRole('cell', { name: 'content-type', exact: true }).waitFor();
    await responseDetails.getByRole('tab', { name: 'Body', exact: true }).click();
    assert.equal(requestsReceived, beforeInspection);
    await page.screenshot({ path: 'test-results/desktop-history-snapshot.png' });
    await url.fill(`${origin}/edited-draft`);
    assert.equal(await page.locator('.history-source').count(), 0);
    await page.getByText('No response yet', { exact: true }).waitFor();

    await historyNav.click();
    await page.getByRole('button', { name: `Open history entry ${notFoundHistoryId}`, exact: true }).click();
    await page.getByText('404 Not Found', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await historyNav.click();
    await page.getByRole('button', { name: `Open history entry ${failedHistoryId}`, exact: true }).click();
    await page.getByText('Saved execution failed', { exact: true }).waitFor();
    await page.getByText('No HTTP response available', { exact: true }).waitFor();
    assert.equal(requestsReceived, beforeInspection);

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
    await reopenedList.getByRole('button', { name: 'Student API', exact: true }).click();
    await reopenedPage.getByRole('list', { name: 'Requests in Student API', exact: true }).getByRole('button', { name: /Student echo/ }).click();
    await reopenedPage.getByText('Request loaded. Press Send request when you are ready.', { exact: true }).waitFor();
    assert.equal(await reopenedPage.getByRole('textbox', { name: 'Request URL', exact: true }).inputValue(), savedUrl);
    assert.equal(await reopenedPage.getByRole('combobox', { name: 'HTTP method', exact: true }).inputValue(), 'POST');
    const restored = await reopenedPage.evaluate((id) => window.reqdelta.getSavedRequest({ id }), firstSaved.savedRequests[0].id);
    assert.equal(restored.ok, true);
    assert.equal(restored.savedRequest.request.body.text, savedBody);
    assert.equal(restored.savedRequest.request.headers[0].value, 'Bearer demo-header-secret');
    assert.equal(restored.savedRequest.request.queryParams[1].enabled, false);
    await reopenedPage.getByText('No response yet', { exact: true }).waitFor();
    await reopenedPage.getByRole('button', { name: 'History', exact: true }).click();
    await reopenedPage.getByRole('button', { name: `Open history entry ${originalStudentHistoryId}`, exact: true }).click();
    await reopenedPage.getByText(`Saved execution #${originalStudentHistoryId}`, { exact: true }).waitFor();
    const originalStudent = JSON.parse(await reopenedPage.locator('#response-body').innerText());
    assert.equal(originalStudent.name, 'Rahul');
    assert.equal(originalStudent.age, 20);
    assert.equal(requestsReceived, beforeInspection);
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
    assert.deepEqual(persisted, { names: collectionNames, count: 4, savedRequests: 2, history: requestsReceived, version: 3 });
    assert.deepEqual(errors, []);
    console.log('Desktop checks passed: encrypted history for responses and failures, immutable snapshots, offline inspection after restart, history pagination, storage-write failure without HTTP retry, collections and saved requests, smaller-window layout, and the complete HTTP workflow.');
  } finally {
    if (desktop) await desktop.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(userData, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
