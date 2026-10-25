# ReqDelta

A macOS desktop API testing and JSON response comparison project.

**Current milestone: all five core workflows and a macOS DMG.** Save reusable configurations, execute requests, reopen stored responses, and compare two stored JSON bodies after an app restart. The Apple silicon package is built and its disk-image checks pass. A manual packaged-app walkthrough and final code review remain before submission.

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

This is protection for local storage, not a portable export or a guarantee against a compromised running app. Copying the database to another Mac/account does not copy its Keychain key. Development and packaged builds can also differ in app identity. The package uses a local ad-hoc signature, and macOS can request Keychain access again when the build changes. Automated development/package compatibility checks are provided but have not run in this checkpoint; verify existing saved data when first opening the package. History uses the same protection for its complete request/outcome snapshots, including response headers and body.

## Execution history

Each valid request attempt now records its configuration and outcome after execution. This works for unsaved requests too. HTTP responses such as 404 remain inspectable responses; network failures, timeouts, and response-size failures are recorded as error outcomes. Invalid inputs rejected before execution do not create history. Sending now shares the 2 MiB total configuration limit used by request saving.

Choose **History** in the sidebar. The list shows request names when linked to a saved request, methods, status/error codes, duration, and local start times. URLs and body/header contents are not read into this list. **Older executions** pages through earlier records; **Newest executions** returns to the first page. Each page contains up to 20 entries.

Choose **Open** to restore the request inputs and inspect the stored response or failure in the builder. This makes no HTTP call and works while the API is stopped. A **Saved execution** banner identifies the snapshot. Editing an input clears the historical result from the screen; it does not change the stored snapshot. Pressing Send request explicitly runs the current configuration again and creates another history entry.

Snapshots are independent copies. Editing or deleting a saved request does not change its old snapshot content. The optional link identifies the originating saved request, even if its draft was edited before execution. The list's name is the linked request's current label; if the parent is deleted, the snapshot stays and the link becomes NULL. Opening history creates an independent builder draft rather than updating a saved request.

History automatically retains the newest **100 entries** within **50 MiB of encrypted snapshot bytes**, removing older entries when either limit is reached. An individual serialized snapshot is limited to 16 MiB. This byte budget measures stored payloads, not a hard cap on SQLite's physical file size. There is no clear/delete-history button in this checkpoint.

If history encryption or writing fails, the HTTP result still appears with a separate **History was not saved** warning. The app does not automatically repeat the HTTP request. Opening a missing or unreadable snapshot shows an error without replacing it. Duration measures the HTTP attempt, excluding the later encryption/database work. History is committed before a normal Send action finishes; quitting during an in-flight request can prevent its completion from being recorded.

## Compare stored JSON responses

Send `GET http://127.0.0.1:3030/students/101` once. Add the query parameter `version` with value `2` and send again. In **History**, use the first execution's **Before** radio button and the second execution's **After** button, then choose **Compare responses**.

The comparison page shows both source IDs, methods, status codes, timestamps, counts, and a table of changes. The student example produces three: `/age` changes from number `20` to string `"20"`, `/fullName` is added, and `/name` is removed. Missing means a field did not exist on that side; it is different from JSON `null`. **Reverse comparison** swaps the sources and calculates the report again. **Change selection** returns to History; **Swap selection** and **Clear selection** change its chosen pair.

Selections remain while paging through History or moving between views, so the two executions can come from different pages. The **Compare** sidebar button reopens the current report. Selections and reports are held in memory, not stored as extra history records; after quitting, choose the pair again. The underlying encrypted snapshots remain available within the history retention limits.

Comparison reads and decrypts saved snapshots without contacting either API or sending the current builder draft. You can stop the demo API, quit/reopen ReqDelta, and compare those two executions again. No history entry is created by comparing. A snapshot removed by retention or one that cannot be decrypted produces an error instead of a partial result.

Only JSON response bodies are compared. Network failures have no selectable response. Plain-text responses can be selected from the metadata list, but comparison reports which side is not JSON. A JSON HTTP 404 or 500 is eligible: status codes, headers, URLs, and timing are displayed where relevant but are not part of the body diff. Equal parsed bodies show **No JSON value differences**.

Values render as text, including strings that resemble HTML. Values longer than 600 serialized characters initially show a labeled preview; **Show full value** expands the complete value. The root path is displayed as **(root)**. Arrays use indexes, and the engine limits below apply to every desktop comparison. Observed differences do not automatically mean an API change breaks its clients.

### JSON comparison engine

Run the standalone learning example:

```sh
npm run compare:demo
```

It compares made-up student JSON and reports three changes: `/name` removed, `/fullName` added, and `/age` changed from number to string. It makes no API calls and does not access your workspace database.

`electron/json-diff.cjs` exports `compareJsonBodies(beforeBody, afterBody)`. It takes two JSON text strings and returns `{ equal, counts, changes }`. Each change has a `kind`, a path, before/after types, and values for the sides where the field exists. The kinds are `added`, `removed`, `typeChanged`, and `valueChanged`.

Comparison is directional: fields present only in the second response are added. Objects are compared by their own member names, ignoring member order. Arrays are compared at matching indexes, including nested objects; inserting or reordering items may therefore produce several changes. There is no ID matching, move detection, rename inference, or automatic verdict that a change breaks a client. An entire added/removed branch or a changed-type branch is reported once.

Paths use [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901): `/student/age`, `/items/0`, and an empty string for the root. A `~` in a field name becomes `~0`, and `/` becomes `~1`. Object changes use sorted property names for a stable report order. Missing values are distinct from `null`; their corresponding before/after value field is omitted.

The engine compares parsed values rather than original text. Formatting, equivalent string escapes, `1` versus `1.0`, and `0` versus `-0` do not count as differences. Numbers use JavaScript's normal floating-point semantics, so this is not arbitrary-precision decimal comparison. Non-finite values and integers outside the safe-integer range are rejected instead of being used for comparison. Duplicate JSON member names follow `JSON.parse` behavior, which keeps the final occurrence.

Limits are 2 MiB of UTF-8 JSON text per response, 128 levels of nesting (root at depth 0), 100,000 values across both inputs, 500 changes, and 8 MiB of serialized change records. Whole inputs are inspected, including branches later reported as a single addition/removal. Invalid or over-limit inputs throw a `JsonComparisonError` with a short message that does not repeat response contents. No partial comparison is returned as a complete result.

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
- Automatic encrypted history for HTTP responses and execution failures, with bounded retention and pagination.
- Offline snapshot inspection after restarting, including stored body, response headers, and request inputs.
- Separate storage warnings that preserve the HTTP result and never trigger an automatic retry.
- A tested recursive JSON comparison engine for added/removed fields, type/value changes, nested objects, and index-based arrays.
- History selection and an offline desktop comparison report, with source labels, reversal, equal-body states, controlled errors, and expandable value previews.

The first startup creates empty storage tables. Collections, explicitly saved configurations, and execution snapshots are persisted. All five core workflows are connected, and the macOS DMG is built; the final packaged-app demonstration/review remains. Request/collection update and delete controls are outside the current interface.

## SQLite storage foundation

The main process opens `reqdelta.sqlite` in Electron's `app.getPath('userData')` directory. On a normal macOS profile this is typically `~/Library/Application Support/ReqDelta/reqdelta.sqlite`. It belongs to the app's local data directory rather than the source checkout. The desktop checks explicitly use a temporary profile with its own database.

| Table | Prepared for |
| --- | --- |
| `collections` | Named groups of saved requests |
| `saved_requests` | Readable request metadata and an encrypted configuration linked to a collection |
| `request_history` | Outcome metadata and encrypted execution snapshots linked optionally to a saved request |

The current schema version is 3. A fresh file applies the three migrations in one transaction. A version 1 workspace upgrades while retaining its collections; version 2 also retains its encrypted saved requests unchanged. Version 3 opens skip those migrations. Failed setup rolls back, and a database with a newer schema version is rejected without resetting it. A startup error shows a message and quits the app; it does not delete the database.

Version 1 had no request-saving interface. The second migration replaces its empty saved-request table with the encrypted layout. As a preservation guard, if someone manually seeded version 1 request rows, the upgrade stops and retains that database for manual conversion; it does not drop those records. The old `db:demo` exercise used its own temporary file, not your app workspace.

Versions 1 and 2 did not record real history. The third migration replaces that empty history table with its encrypted layout. It similarly refuses an upgrade containing manually seeded older history, preserving that file for manual conversion instead of deleting it.

The database connection and encryption operations stay in the main process. The nine preload functions are `sendRequest`, `listCollections`, `createCollection`, `createSavedRequest`, `listSavedRequests`, `getSavedRequest`, `listHistory`, `getHistoryEntry`, and `compareHistory`. Each handler checks the sender. Comparison accepts two history IDs, reads their verified snapshots, and calls the pure comparison engine. History writes happen only inside the main-process request runner. The renderer has no direct database, arbitrary SQL, general-purpose encryption, or history-insert access. Inserts and lookups bind values separately from SQL text.

Run the learning exercise:

```sh
npm run db:demo
```

It creates a fresh temporary database, inserts made-up collection/request/history records using prepared statements, closes the database, reopens it, and reads the records back. Both configurations and execution snapshots use opaque placeholder bytes to demonstrate BLOBs; real encryption happens only in Electron. It prints the temporary file location for inspection. It makes no HTTP calls and does not use your app workspace database. Each run uses a new temporary file.

Local `.sqlite`/`.db` files and their journal files are excluded by `.gitignore`; commit the migration SQL and application code.

## Local demo endpoints

| URL | Purpose |
| --- | --- |
| `http://127.0.0.1:3030/students/101` | Original student JSON |
| `http://127.0.0.1:3030/students/101?version=2` | Renamed field and changed type for the comparison demonstration |
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

The desktop test opens Electron using a temporary profile and checks the complete HTTP workflow, collections, saved configurations, history, and JSON comparison. It verifies real macOS encryption, absence of made-up credentials from database bytes, pagination, and smaller-window layouts. It stops the API, opens and compares snapshots without network calls, then quits/reopens the app and checks persistence and comparison again. Comparison checks include reversal, selection across pages, identical bodies, plain-text rejection, text-safe rendering, and value expansion. A simulated database write failure confirms that the HTTP response survives without an automatic retry. Screenshots are saved under `test-results/`. No external API or real API credentials are needed. The first native encryption operation may request Keychain access.

## College delivery

The college submission requires a **`.dmg` file** and source code. ReqDelta's local SQLite storage and request service do not require web hosting. Build on macOS using:

```sh
npm run package:mac
```

On this Apple silicon Mac, the output is:

- `release/ReqDelta-0.1.0-mac-arm64.dmg` — the file to submit.
- `release/ReqDelta-0.1.0-mac-arm64.dmg.sha256` — checksum for verifying that file.
- `release/ReqDelta-darwin-arm64/ReqDelta.app` — the packaged application before it is placed in the disk image.

The checked DMG is approximately **91.7 MB** (87.4 MiB). The portal's stated 50 MB limit is smaller than this build; the user requested the complete DMG at its actual size. This build is not represented as meeting that upload limit. Rebuilds can change the size and checksum.

Double-click the DMG, drag **ReqDelta.app** onto **Applications**, eject the disk image, and open ReqDelta from Applications. Quit the development app with Command+Q first. Apple silicon/M-series Macs use this `arm64` build. The script targets the architecture of the Mac running it; an Intel Mac would produce an `x64` build, which has not been verified here.

The `.app` includes Electron's Chromium/Node runtime. It does not need Vite, a separate Node installation, or a running development server. The included **demo API is still a separate process**, started from the source checkout with `npm run demo`; that demo command needs Node. Requests to remote APIs need their normal network access. Collections and stored-response inspection/comparison work offline.

The build first compiles React, then stages only `dist`, Electron runtime modules/migrations, and a minimal package manifest. Electron Packager produces `ReqDelta.app` with the bundle identifier `com.harshk1911.reqdelta` and an `app.asar` runtime archive. ASAR groups files; it does not encrypt source code. Electron/Chromium and React license notices are included. See [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution) and [Packager options](https://electron.github.io/packager/main/interfaces/Options.html).

macOS's `hdiutil` creates an HFS+ disk image using ULMO compression. It contains the application, an Applications shortcut, and installation notes. No local workspace database, `.git`, `.env`, tests, or development dependency tree is copied into the app. Rebuilding replaces generated artifacts for the same version/architecture. The current workspace database stays in the user's Application Support directory, separate from the read-only app bundle.

```sh
npm run test:dmg
```

This verifies the SHA-256 checksum, disk-image integrity, read-only mounting, expected visible files, Applications shortcut, bundle identifier, local code signature, runtime archive, and license notices. It ejects its temporary mount afterward and does not launch the app. These checks and all 286 unit tests passed for this checkpoint.

```sh
npm run test:packaged
```

This rebuilds the DMG, installs a temporary copy from it, runs the complete desktop checks in a temporary profile, and checks encrypted workspace compatibility in both directions between development and packaged apps. It also checks that a second instance exits instead of opening the same workspace twice. The GUI test launch was declined during this checkpoint, so **these packaged workflow/Keychain compatibility checks have not run yet**. Before submission, open the packaged app and verify saving/opening a request, sending to the demo API, restarting, and comparing two stored JSON responses.

The app honours `--user-data-dir` in both modes for isolated checks. A single-instance lock uses that workspace, and a second launch focuses the existing window. Generated `dist`, `release`, test screenshots, and local database files remain ignored by Git. Commit the build scripts, tests, manifest/lockfile, application changes, and learning notes; upload the `.dmg` separately through the college form.

The app uses an **ad-hoc signature** for the local college build. It is not Apple Developer ID signed or notarized. A downloaded copy may be blocked by Gatekeeper; review it through System Settings → Privacy & Security when appropriate. This is separate from a corrupt image or invalid code signature. Public signing/notarization remain outside this delivery scope; see [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Code map

| File | Responsibility |
| --- | --- |
| `electron/main.cjs` | Desktop window, local interface loading, SQLite lifecycle, trusted IPC handlers |
| `electron/preload.cjs` | Exposes nine approved request, collection, history, and comparison operations on `window.reqdelta` |
| `electron/request-service.cjs` | Validates requests, fetches responses, limits size/time, returns results |
| `electron/request-config.cjs` | Copies and bounds supported configuration fields for saving and execution |
| `electron/request-runner.cjs` | Executes once, records history, and keeps storage warnings separate from the result |
| `electron/collections-service.cjs` | Validates collection names and inserts/lists rows with prepared SQL |
| `electron/saved-requests-service.cjs` | Validates, saves, lists, and restores request configurations without executing them |
| `electron/history-service.cjs` | Encrypts execution snapshots, reads history, pages metadata, and prunes old entries transactionally |
| `electron/json-diff.cjs` | Pure, bounded comparison of two JSON response texts with typed changes and paths |
| `electron/comparison-service.cjs` | Validates two history IDs, reads/decrypts snapshots, checks JSON eligibility, and returns a diff with source labels |
| `electron/secure-storage.cjs` | Serializes configurations and delegates encryption/decryption to macOS through Electron |
| `electron/database.cjs` | Opens SQLite, applies pending migrations transactionally, and checks the schema version |
| `electron/migrations/001-initial.sql` | Tables, relationships, constraints, and indexes for schema version 1 |
| `electron/migrations/002-protected-requests.sql` | Encrypted saved-request layout for schema version 2 |
| `electron/migrations/003-protected-history.sql` | Encrypted execution-history layout for schema version 3 |
| `src/App.jsx` | Request form, loading/error state, calling the bridge |
| `src/components/ResponsePanel.jsx` | Response body, headers, and pretty/raw viewing |
| `src/components/KeyValueEditor.jsx` | Shared name/value rows for query parameters and request headers |
| `src/components/JsonBodyEditor.jsx` | None/JSON body selection, draft editing, and sample insertion |
| `src/components/CollectionsPanel.jsx` | Creates collections, expands their saved requests, and opens a chosen request |
| `src/components/SaveRequestForm.jsx` | Collection selection, request naming, save/cancel actions, and save errors |
| `src/components/HistoryPanel.jsx` | Paginated execution list, snapshot opening, and Before/After comparison selection |
| `src/components/ComparisonPanel.jsx` | Comparison sources, counts, typed changes, expandable values, and empty/error states |
| `src/components/Icon.jsx` | Small inline interface icons |
| `src/styles.css` | Interface layout and appearance |
| `scripts/dev.cjs` | Starts Vite and Electron together |
| `scripts/demo-server.cjs` | Local API for learning and demonstrations |
| `scripts/database-demo.cjs` | Isolated insert/close/reopen/read exercise using made-up records |
| `scripts/compare-demo.cjs` | Standalone comparison example using made-up student JSON |
| `scripts/package-mac.cjs` | Stages runtime files, packages/signs the macOS app, builds its DMG, and writes a checksum |
| `scripts/disk-image.cjs` | Creates the compressed disk image and manages temporary read-only mounts |
| `scripts/check-dmg.cjs` | Verifies disk-image contents, signature, identity, notices, and checksum without opening the app |
| `scripts/package-compat.cjs` | Optional native check of encrypted workspace compatibility and single-instance handling |
| `tests/request-service.test.mjs` | Request validation and response/error tests |
| `tests/database.test.mjs` | Real SQLite persistence, relationships, constraints, migration rollback, and existing-data protection |
| `tests/collections-service.test.mjs` | Collection validation, SQL parameter binding, ordering, Unicode limits, and storage failures |
| `tests/saved-requests-service.test.mjs` | Saved configurations, grouping, validation, missing/corrupt records, and non-execution |
| `tests/secure-storage.test.mjs` | Native encryption delegation, unavailable storage, and key rotation handling |
| `tests/request-runner.test.mjs` | Validation before execution, one HTTP attempt, failure outcomes, and separate history warnings |
| `tests/history-service.test.mjs` | Independent snapshots, metadata paging, retention, rollback, unreadable data, and parent deletion |
| `tests/json-diff.test.mjs` | Recursive changes, path escaping, missing/null distinctions, number handling, and comparison limits |
| `tests/comparison-service.test.mjs` | ID validation, snapshot eligibility, direction, body-only equality, source summaries, and controlled errors |
| `tests/packaging.test.mjs` | Runtime staging, exclusion of development/private files, missing-build rejection, and release paths |
| `scripts/smoke.cjs` | Checks the running desktop application |
| `vite.config.mjs` | React build/dev setup and interface content policy |

Application logic in Electron uses CommonJS (`require`, `module.exports`). React source uses ES module imports processed by Vite. There is no TypeScript source or TypeScript configuration.

Read [LEARNING.md](./LEARNING.md) for the first lesson, exercises, and the remaining work plan.
