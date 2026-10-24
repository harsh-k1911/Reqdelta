# ReqDelta

A macOS desktop API testing and JSON response comparison project.

**Current milestone: the HTTP request builder, collections, and encrypted saved requests.** You can save a configuration into a collection and load it after an app restart. Automatic execution history and JSON comparison are not implemented yet. This is source code you can run, not a packaged `.app` installer yet.

## Run the application

Use Node 24 or later for development; Node 22.13+ within the 22.x line is also supported by the package requirements. The setup and database checks were verified with Node 26.7 on Apple silicon macOS. Electron includes its own Node runtime: Electron 45 was separately checked with its bundled Node 24.22 and built-in SQLite support.

From this project folder, install dependencies if needed:

```sh
npm install
```

In one terminal, start the included local test API:

```sh
npm run demo
```

In a second terminal, open the desktop application:

```sh
npm run dev
```

Press **Send request**. The default URL retrieves a student from the local demo API. You can enter an HTTP/HTTPS URL, select GET, POST, PUT, or DELETE, configure query parameters and headers, and send a JSON body with POST, PUT, or DELETE. These requests are real network calls; the target API decides which operations and data it accepts.

To practise choosing methods, click **Method echo**, select a method, and send. The local `/echo` endpoint reports the method it received without changing any data. The other example buttons reset the method to GET.

Use **Params → Add parameter** for extra query parameters. Enter a name and value, disable a row with its checkbox, or remove it with ×. Enabled rows are appended to any parameters already in the URL; the URL input itself is not rewritten. Repeated names are preserved. Completely blank rows are ignored, named empty values are sent, and an enabled row with a value but no name shows an error.

Use the request's **Headers → Add header** controls to add headers such as `Accept: application/json` or `X-Demo-Client: ReqDelta`. Switching request tabs preserves your parameters, headers, and body draft. Example buttons clear all three and return to Params. The response viewer's separate Headers tab shows the server's response headers.

Header names are case-insensitive, so duplicate enabled names are rejected even when their capitalization differs. Names are trimmed, and invalid names or values show a validation error. Blank and disabled rows are skipped; named empty values are supported. The HTTP client manages transport headers such as `Host`, `Content-Length`, and `Connection` automatically, so this version rejects manual overrides of those headers.

Use the request's **Body** tab and choose **JSON** to include a JSON body. You can type or paste JSON, or click **Use sample JSON**. The main process checks JSON syntax and a 1 MiB UTF-8 size limit before sending. It adds `Content-Type: application/json` unless you explicitly set Content-Type in Headers. Your original body text is sent without being reformatted or serialized again.

Choose **None** to send no body while keeping your draft. Switching to GET automatically selects None; JSON bodies are unavailable for GET. When switching back to another method, choose JSON again to restore the draft. Valid JSON can still be rejected by an API if it does not match that API's expected data. File uploads, form data, and other body formats are outside this version.

For a quick test, select **Student JSON**, add `version` with the value `2`, and send. The demo student should have `fullName` and an age stored as text. Or use **Method echo**, add `search` with a value such as `tea & coffee`, and inspect the returned `queryParams` array.

For a header test, select **Method echo**, open the request's Headers tab, add `X-Demo-Client` with value `ReqDelta`, and send. The response body's `headers` object should contain `"x-demo-client": "ReqDelta"`. The local demo echoes all received headers, including defaults added by the HTTP client.

For a body test, select **Method echo**, choose POST, open Body, select JSON, and click **Use sample JSON**. Send and inspect `body`, `rawBody`, and `headers["content-type"]` in the response. Try invalid JSON to see a validation error, then choose None to send without that draft.

React changes update while the app is running. Restart `npm run dev` after changing Electron's main process, preload, or request service. Restart `npm run demo` after changing the demo API. Use Control+C in the relevant terminal to stop either process, then run its command again. On macOS, closing the last window leaves the app running; use Command+Q to quit it.

## Create a collection

Click **+** beside **Collections**, enter a name such as `Student API`, and choose **Create collection** or press Enter. The main process trims surrounding whitespace, requires 1–100 Unicode code points, and rejects null characters. The new collection appears at the top of the sidebar after SQLite confirms the insert. Names are plain text, and duplicate names are allowed as separate records.

Choose **Cancel** to discard the name without writing anything. Quit with Command+Q and reopen the app to check that your created collection is still listed. Collection creation works without the demo API running. Click a collection to expand its saved requests. Renaming and deleting collections are not implemented yet.

Loading and creation failures have separate messages so a storage problem does not appear as an HTTP failure. A failed list load offers **Retry collections**.

## Save and open a request

Configure the request builder, choose **Save request**, enter a request name, choose a collection, and select **Save to collection**. If you just created a collection while the form was open, choose **Refresh collections**. Cancel save leaves the builder alone and writes nothing.

Saving requires a valid URL, supported method, valid enabled headers/parameters, and valid JSON when JSON mode is selected. It checks the configuration without sending an HTTP request. The saved copy includes the original URL, extra query/header rows (including disabled rows), and the exact body text. None mode can retain an unfinished body draft. The entire configuration has a 2 MiB UTF-8 limit, alongside the existing 1 MiB limit for an active JSON body.

Expand the collection and click the named request to restore it into the builder. Opening clears the old response and does not send the request. Press **Send request** when ready. The original URL and additional parameter rows remain separate, so loading does not duplicate query parameters.

Editing the loaded builder changes a temporary copy. **Save as new** creates another saved record; it does not overwrite the original. Names may be duplicated because IDs identify the actual records. Updating and deleting saved requests are not implemented yet.

Quit with Command+Q, reopen, expand the collection, and open the saved request again. The demo API is only needed when you actually send to one of its endpoints.

### Protecting request contents

On macOS, the main process serializes the entire configuration and encrypts it using Electron's asynchronous `safeStorage` API, backed by the macOS Keychain. The SQLite `request_encrypted` BLOB contains ciphertext. URLs, query values, header credentials, disabled drafts, and body text are inside that protected payload. Collection/request names, HTTP methods, IDs, and timestamps remain readable metadata; keep credentials out of names. See [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

There is no plaintext fallback. If secure storage is unavailable, saving fails and your draft remains available. If a saved payload cannot be decrypted, its record is kept and an error appears without replacing the current builder. Listing names does not decrypt the configurations. This feature currently supports macOS only.

This is protection for local storage, not a portable export or a guarantee against a compromised running app. Copying the database to another Mac/account does not copy its Keychain key. Development and packaged builds can also differ in app identity; packaging verification will check this separately. Unsigned builds may prompt for Keychain access again when their identity changes. History and response persistence are still pending and store no real interface executions yet.

## What works now

- A real Electron desktop window with a React interface.
- GET, POST, PUT, and DELETE requests through the main process and an isolated preload bridge.
- A method selector with main-process validation of supported methods.
- A query parameter editor with add/remove, enabled rows, duplicate names, and automatic URL encoding.
- A request header editor with add/remove, enabled rows, and validation of names, values, duplicates, and transport overrides.
- Params and Headers request tabs using one reusable name/value row editor.
- A Body tab with None/JSON modes, sample JSON, draft preservation, and syntax/size validation.
- JSON bodies for POST, PUT, and DELETE with automatic Content-Type when not explicitly configured.
- Response status, total request duration, body size, and response headers.
- Pretty/raw JSON and plain-text viewing. Response HTML is displayed as text.
- Invalid URL, connection failure, 15-second timeout, and a 2 MiB response viewing limit.
- Inspectable 4xx/5xx HTTP responses: these do not become connection errors.
- Command+Enter to send a request from the request form.
- An offline demo API and automated request/desktop checks.
- SQLite database creation, schema versioning, foreign keys, and connection cleanup on app quit.
- Collection creation and listing through validated main-process operations, with persistence across app restarts.
- Saving and opening request configurations grouped by collection, protected with macOS-backed encryption.
- Restoration of methods, original URLs, query/header rows, enabled flags, body modes, and exact body drafts.

The first startup creates empty storage tables. Collections and explicitly saved request configurations are now written to SQLite. Response snapshots and automatic execution history from the interface are not yet stored.

## SQLite storage foundation

The main process opens `reqdelta.sqlite` in Electron's `app.getPath('userData')` directory. On a normal macOS profile this is typically `~/Library/Application Support/ReqDelta/reqdelta.sqlite`. It belongs to the app's local data directory rather than the source checkout. The desktop checks explicitly use a temporary profile with its own database.

| Table | Prepared for |
| --- | --- |
| `collections` | Named groups of saved requests |
| `saved_requests` | Readable request metadata and an encrypted configuration linked to a collection |
| `request_history` | Separate execution snapshots linked optionally to a saved request |

The current schema version is 2. A fresh file applies the original migration and then the encrypted-request migration in one transaction. A version 1 workspace from the previous checkpoint upgrades while retaining its collections. Version 2 opens skip those migrations. Failed setup rolls back, and a database with a newer schema version is rejected without resetting it. A startup error shows a message and quits the app; it does not delete the database.

Version 1 had no request-saving interface. The second migration replaces its empty saved-request table with the encrypted layout. As a preservation guard, if someone manually seeded version 1 request rows, the upgrade stops and retains that database for manual conversion; it does not drop those records. The old `db:demo` exercise used its own temporary file, not your app workspace.

The database connection and encryption operations stay in the main process. The six preload functions are `sendRequest`, `listCollections`, `createCollection`, `createSavedRequest`, `listSavedRequests`, and `getSavedRequest`. Each handler checks the sender. The renderer has no direct database, arbitrary SQL, or general-purpose encryption access. Inserts and lookups bind values separately from SQL text.

Run the learning exercise:

```sh
npm run db:demo
```

It creates a fresh temporary database, inserts made-up collection/request/history records using prepared statements, closes the database, reopens it, and reads the records back. The saved request uses opaque placeholder bytes to demonstrate a BLOB; real encryption happens only in Electron. It prints the temporary file location for inspection. It makes no HTTP calls and does not use your app workspace database. Each run uses a new temporary file.

Local `.sqlite`/`.db` files and their journal files are excluded by `.gitignore`; commit the migration SQL and application code.

## Local demo endpoints

| URL | Purpose |
| --- | --- |
| `http://127.0.0.1:3030/students/101` | Original student JSON |
| `http://127.0.0.1:3030/students/101?version=2` | Renamed field and changed type, ready for the later comparison feature |
| `http://127.0.0.1:3030/text` | Non-JSON response |
| `http://127.0.0.1:3030/status/404` | An HTTP error response with a body |
| `http://127.0.0.1:3030/slow` | Takes 20 seconds, so the client times out first |
| `http://127.0.0.1:3030/echo` | Reports the received method, query parameters, headers, parsed body, and raw body text |

The other demo endpoints accept GET only. Sending a different supported method to them returns `405 Method Not Allowed` with an `Allow: GET` response header. The `/echo` endpoint inspects requests; it does not create, replace, or delete a student. It attempts to parse received body text as JSON for inspection, independently of the Content-Type header, and falls back to text if parsing fails. With no body it returns `body: null` and `rawBody: ""`.

If the default request fails, check that `npm run demo` is running. If port 3030 is already occupied, stop that process or change the demo server port and the URL you enter. Port 5173 is reserved for the development interface.

If `/echo` returns an older response or is missing `queryParams`, `headers`, `body`, or `rawBody`, restart the demo API. Editing a server file does not replace the code already loaded by its running process.

## Verify and run a built version

```sh
npm test
npm run build
npm start
```

`npm start` loads the built interface, so run `npm run build` after changing React files. The demo API is independent and can remain running during this.

```sh
npm run test:desktop
```

The desktop test opens Electron using a temporary profile and creates collections and saved requests through the actual interface. It checks validation, cancellation, grouping, the smaller-window layout, real macOS encryption, and the complete HTTP workflow against a local API. It confirms that save/open actions make no HTTP calls and that made-up secret fixtures are absent from database bytes. It quits and reopens the app, then opens a saved request to verify its restored configuration. Automatic history is not connected yet. Screenshots are saved under `test-results/`. No external API or real API credentials are needed. The first native encryption operation may request Keychain access.

## College delivery

The college accepts a macOS desktop application and its source code. ReqDelta's local SQLite storage and request service do not require web hosting. We will package a macOS `.app` in a later checkpoint and verify the packaged version before submission; see [Electron's packaging documentation](https://www.electronjs.org/docs/latest/tutorial/application-distribution). The included demo API runs locally as a separate process. Remote APIs still require their normal network access.

Signing and notarizing for public macOS distribution are a separate release task, described in [Electron's code signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing). They are outside the current college delivery scope.

## Code map

| File | Responsibility |
| --- | --- |
| `electron/main.cjs` | Desktop window, local interface loading, SQLite lifecycle, trusted IPC handlers |
| `electron/preload.cjs` | Exposes the six approved request/collection operations on `window.reqdelta` |
| `electron/request-service.cjs` | Validates requests, fetches responses, limits size/time, returns results |
| `electron/collections-service.cjs` | Validates collection names and inserts/lists rows with prepared SQL |
| `electron/saved-requests-service.cjs` | Validates, saves, lists, and restores request configurations without executing them |
| `electron/secure-storage.cjs` | Serializes configurations and delegates encryption/decryption to macOS through Electron |
| `electron/database.cjs` | Opens SQLite, applies pending migrations transactionally, and checks the schema version |
| `electron/migrations/001-initial.sql` | Tables, relationships, constraints, and indexes for schema version 1 |
| `electron/migrations/002-protected-requests.sql` | Encrypted saved-request layout for schema version 2 |
| `src/App.jsx` | Request form, loading/error state, calling the bridge |
| `src/components/ResponsePanel.jsx` | Response body, headers, and pretty/raw viewing |
| `src/components/KeyValueEditor.jsx` | Shared name/value rows for query parameters and request headers |
| `src/components/JsonBodyEditor.jsx` | None/JSON body selection, draft editing, and sample insertion |
| `src/components/CollectionsPanel.jsx` | Creates collections, expands their saved requests, and opens a chosen request |
| `src/components/SaveRequestForm.jsx` | Collection selection, request naming, save/cancel actions, and save errors |
| `src/components/Icon.jsx` | Small inline interface icons |
| `src/styles.css` | Interface layout and appearance |
| `scripts/dev.cjs` | Starts Vite and Electron together |
| `scripts/demo-server.cjs` | Local API for learning and demonstrations |
| `scripts/database-demo.cjs` | Isolated insert/close/reopen/read exercise using made-up records |
| `tests/request-service.test.mjs` | Request validation and response/error tests |
| `tests/database.test.mjs` | Real SQLite persistence, relationships, constraints, migration rollback, and existing-data protection |
| `tests/collections-service.test.mjs` | Collection validation, SQL parameter binding, ordering, Unicode limits, and storage failures |
| `tests/saved-requests-service.test.mjs` | Saved configurations, grouping, validation, missing/corrupt records, and non-execution |
| `tests/secure-storage.test.mjs` | Native encryption delegation, unavailable storage, and key rotation handling |
| `scripts/smoke.cjs` | Checks the running desktop application |
| `vite.config.mjs` | React build/dev setup and interface content policy |

Application logic in Electron uses CommonJS (`require`, `module.exports`). React source uses ES module imports processed by Vite. There is no TypeScript source or TypeScript configuration.

Read [LEARNING.md](./LEARNING.md) for the first lesson, exercises, and the remaining work plan.
