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
  let desktop;
  try {
    desktop = await electron.launch({
      executablePath: require('electron'),
      args: ['.', `--user-data-dir=${userData}`],
      cwd: path.join(__dirname, '..'),
      env,
    });
    const page = await desktop.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('heading', { name: 'A closer look at your API.' }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.deepEqual(await page.evaluate(() => Object.keys(window.reqdelta)), ['sendRequest']);

    const url = page.getByRole('textbox', { name: 'Request URL' });
    const method = page.getByRole('combobox', { name: 'HTTP method' });
    const send = page.getByRole('button', { name: 'Send request' });
    await url.fill(`${origin}/students/101`);
    await send.click();
    await page.getByText('200 OK', { exact: true }).waitFor();
    assert.match(await page.locator('#response-body').innerText(), /"name": "Rahul"/);
    await page.getByRole('tab', { name: /Headers/ }).click();
    await page.getByRole('cell', { name: 'content-type', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Body', exact: true }).click();
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
    console.log('Desktop checks passed: query encoding, duplicate names, existing URL parameters, row add/remove/disable, empty values, validation, parameter keyboard shortcut, small-window layout, example reset, all four HTTP methods, response viewing, and connection errors.');
  } finally {
    if (desktop) await desktop.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(userData, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
