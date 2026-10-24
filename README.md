# ReqDelta

A macOS desktop API testing and JSON response comparison project.

**Current milestone: the HTTP request builder and persistent collections.** You can create and list collections in the sidebar, and they survive app restarts. Saving requests/history from the interface and JSON comparison are not implemented yet. This is source code you can run, not a packaged `.app` installer yet.

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

Choose **Cancel** to discard the name without writing anything. Quit with Command+Q and reopen the app to check that your created collection is still listed. Collection creation works without the demo API running. Saving a request into a collection is the next separate checkpoint; the current list shows collection names only. Renaming and deleting collections are not implemented yet.

Loading and creation failures have separate messages so a storage problem does not appear as an HTTP failure. A failed list load offers **Retry collections**.

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

The first startup creates empty storage tables. Collection names entered in the interface are now written to SQLite. Requests and responses from the interface are not yet stored; those connections will be added in later checkpoints.

## SQLite storage foundation

The main process opens `reqdelta.sqlite` in Electron's `app.getPath('userData')` directory. On a normal macOS profile this is typically `~/Library/Application Support/ReqDelta/reqdelta.sqlite`. It belongs to the app's local data directory rather than the source checkout. The desktop checks explicitly use a temporary profile with its own database.

| Table | Prepared for |
| --- | --- |
| `collections` | Named groups of saved requests |
| `saved_requests` | Request configuration linked to a collection |
| `request_history` | Separate execution snapshots linked optionally to a saved request |

Schema version 1 is applied in a transaction the first time the file opens. Later opens read the version instead of recreating the tables. Failed setup rolls back, and a database with a newer schema version is rejected without resetting it. A startup error shows a message and quits the app; it does not delete the database.

The database connection stays in the main process. The preload exposes only `sendRequest`, `listCollections`, and `createCollection`. Each main-process handler checks the sender. The renderer has no direct database or arbitrary SQL access. Collection inserts use bound values rather than building SQL from user input. This feature uses the existing version 1 schema, so no new migration is needed.

Run the learning exercise:

```sh
npm run db:demo
```

It creates a fresh temporary database, inserts made-up collection/request/history records using prepared statements, closes the database, reopens it, and reads the records back. It prints the temporary file location for inspection. It makes no HTTP calls and does not use your app workspace database. Each run uses a new temporary file.

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

The desktop test opens Electron using a temporary profile and creates collections through the actual interface. It checks validation, cancellation, plain-text rendering, and the smaller-window layout, then checks the complete HTTP workflow against a local API. It quits and reopens the app to confirm that the same collection records load into the sidebar. Request/history writes are not connected yet. Screenshots are saved under `test-results/`. No external API is needed.

## College delivery

The college accepts a macOS desktop application and its source code. ReqDelta's local SQLite storage and request service do not require web hosting. We will package a macOS `.app` in a later checkpoint and verify the packaged version before submission; see [Electron's packaging documentation](https://www.electronjs.org/docs/latest/tutorial/application-distribution). The included demo API runs locally as a separate process. Remote APIs still require their normal network access.

Signing and notarizing for public macOS distribution are a separate release task, described in [Electron's code signing guide](https://www.electronjs.org/docs/latest/tutorial/code-signing). They are outside the current college delivery scope.

## Code map

| File | Responsibility |
| --- | --- |
| `electron/main.cjs` | Desktop window, local interface loading, SQLite lifecycle, trusted IPC handlers |
| `electron/preload.cjs` | Exposes the three approved request/collection operations on `window.reqdelta` |
| `electron/request-service.cjs` | Validates requests, fetches responses, limits size/time, returns results |
| `electron/collections-service.cjs` | Validates collection names and inserts/lists rows with prepared SQL |
| `electron/database.cjs` | Opens SQLite, applies the initial migration transactionally, and checks the schema version |
| `electron/migrations/001-initial.sql` | Tables, relationships, constraints, and indexes for schema version 1 |
| `src/App.jsx` | Request form, loading/error state, calling the bridge |
| `src/components/ResponsePanel.jsx` | Response body, headers, and pretty/raw viewing |
| `src/components/KeyValueEditor.jsx` | Shared name/value rows for query parameters and request headers |
| `src/components/JsonBodyEditor.jsx` | None/JSON body selection, draft editing, and sample insertion |
| `src/components/CollectionsPanel.jsx` | Loads the collection list and handles creation, cancellation, and storage messages |
| `src/components/Icon.jsx` | Small inline interface icons |
| `src/styles.css` | Interface layout and appearance |
| `scripts/dev.cjs` | Starts Vite and Electron together |
| `scripts/demo-server.cjs` | Local API for learning and demonstrations |
| `scripts/database-demo.cjs` | Isolated insert/close/reopen/read exercise using made-up records |
| `tests/request-service.test.mjs` | Request validation and response/error tests |
| `tests/database.test.mjs` | Real SQLite persistence, relationships, constraints, migration rollback, and existing-data protection |
| `tests/collections-service.test.mjs` | Collection validation, SQL parameter binding, ordering, Unicode limits, and storage failures |
| `scripts/smoke.cjs` | Checks the running desktop application |
| `vite.config.mjs` | React build/dev setup and interface content policy |

Application logic in Electron uses CommonJS (`require`, `module.exports`). React source uses ES module imports processed by Vite. There is no TypeScript source or TypeScript configuration.

Read [LEARNING.md](./LEARNING.md) for the first lesson, exercises, and the remaining work plan.
