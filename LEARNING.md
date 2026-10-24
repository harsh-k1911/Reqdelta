# Building and understanding ReqDelta

## Our working agreement

- Use JavaScript. Electron's main, preload, and services use CommonJS.
- The target is macOS, with a two-day deadline. Treat the available time as approximately 10 hours total unless clarified otherwise.
- Add one working part at a time. Explain its purpose, trace the code, run it, then practise a small change before introducing the next concept.
- Keep application code small. Avoid state management frameworks, unnecessary servers, cloud accounts, and advanced abstractions for version one.
- The final demonstration needs all five core features. The current foundation alone is not the completed college project.
- You make Git commits and push to GitHub manually. At each small, working checkpoint, the assistant says **Commit now**, supplies a Conventional Commit message, and identifies the files to include. It does not run Git mutations, commits, or pushes.
- The GitHub destination is `https://github.com/harsh-k1911/Reqdelta.git`. Use frequent, meaningful commits as features grow, rather than collecting the whole project into one final commit.
- Finish one narrow feature per checkpoint and stop for your manual commit before changing the next feature. Include the feature's tests and learning notes in the same commit.

## Ten-hour working budget

These are planning estimates, not a guarantee. Learning speed and debugging can change the allocation.

| Time | Working result | What you need to explain |
| --- | --- | --- |
| 1.5 hours | Desktop foundation and GET workflow | Main, renderer, preload, IPC |
| 1.5 hours | Methods, query/header editing, JSON bodies | HTTP methods, async/await, validation |
| 2 hours | SQLite, collections, saved requests, history | Tables, keys, CRUD, local persistence |
| 2 hours | Recursive JSON comparison | Added/removed fields, type/value changes, nested objects, index-based arrays |
| 1.5 hours | Integrated demo, essential tests, macOS packaging | End-to-end behavior and known limitations |
| 1.5 hours | Review, project explanation, viva practice | Trace an entire request and explain design choices |

Protect the final review time. Keep styling changes small until the complete demonstration works. Packaging for a local college demonstration and signing/notarizing for public distribution are separate tasks; public distribution is outside this schedule.

## Lesson 1: the three Electron pieces

**Renderer:** the React interface. It reads your input and displays the response. It cannot use Node's `require()` or access files directly.

**Main process:** the desktop application controller. It creates the window and runs the HTTP request service. Later it will also own SQLite access.

**Preload:** a small bridge that runs before the React page. It exposes approved functions to the interface. At this stage the entire public bridge is one function: `sendRequest`.

This separation follows Electron's [process model](https://www.electronjs.org/docs/latest/tutorial/process-model) and [IPC pattern](https://www.electronjs.org/docs/latest/tutorial/ipc).

CommonJS and TypeScript describe different things. CommonJS is the `require()` / `module.exports` module format used in our `.cjs` files. TypeScript adds a type system to JavaScript. We are using JavaScript; the React build uses `import` / `export` as its module format.

## Follow one click through the code

1. In `src/App.jsx`, pressing Send submits the form and calls `handleSend`.
2. `setLoading(true)` causes React to render a disabled send button and a waiting state. `useState` holds this screen's current data.
3. The UI calls `window.reqdelta.sendRequest({ method, url, queryParams, headers: requestHeaders, body: requestBody })` and awaits the result. The selected method starts as GET, extra query parameter and header lists start empty, and the body starts in None mode. `await` pauses this function until its promise settles; it does not freeze the whole application.
4. In `electron/preload.cjs`, `ipcRenderer.invoke('requests:send', request)` sends a message to Electron's main process. IPC means inter-process communication.
5. In `electron/main.cjs`, `ipcMain.handle('requests:send', ...)` receives that message. It checks the sender and then calls `executeRequest`.
6. In `electron/request-service.cjs`, the service validates the URL, sends an HTTP GET request, reads the body, and returns a plain result object.
7. The result travels back through the same bridge. `setResponse(...)` updates React state, and `ResponsePanel` renders the result.
8. Whether the request succeeds or fails, `finally` changes loading back to false so the interface is usable again.

Do not memorize the whole file. First be able to point to each of these steps.

## Why make the request in the main process?

It gives the desktop app one controlled place for HTTP calls, validation, timeouts, and, later, persistence. Our renderer's content policy disables direct network calls in the built app. Network requests from Node's `fetch` are not subject to a browser page's CORS enforcement. That does not bypass server authentication, network rules, or TLS checks.

The preload exposes one operation instead of exposing `ipcRenderer` itself. The interface cannot pick arbitrary IPC channels or run arbitrary Node operations. Context isolation, sandboxing, and sender checks preserve this boundary. See Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## HTTP error versus connection failure

Try the local `/status/404` endpoint. It returns a status and response body. The API was reached, so our service returns `ok: true` with `response.status: 404`. Here `ok` means an inspectable HTTP response exists; it does not mean the HTTP status is successful.

Then stop the demo API and send the same request. No HTTP response exists, so our service returns `ok: false` and an error message. The interface displays an alert.

This distinction matters because the application is a debugging tool. Users need to inspect error responses too.

## Limits and honest behavior

- The 15-second timeout includes receiving headers and downloading the body.
- The size limit is 2 MiB of downloaded body data. It is checked while reading the stream, rather than trusting `Content-Length`.
- Duration includes the body download. Displayed size is the received body bytes, not total HTTP wire traffic.
- Responses are decoded as UTF-8 text. File downloads and binary previews are outside this milestone.
- JSON is detected by trying to parse the body. Invalid JSON falls back to text. Raw view preserves the decoded body; Pretty view parses and formats it. Very large JSON integer values can lose precision in JavaScript's parsed view.
- HTML responses appear as text. We never render them with `dangerouslySetInnerHTML`.
- A response is held in React memory for now. Closing the application loses it; SQLite is the next persistence milestone.

## Your first practical exercise

1. Run the demo API and the desktop app using the README instructions.
2. Send the student request. Switch between Body and Headers, then Pretty and Raw.
3. In `scripts/demo-server.cjs`, change the original student's `branch` from `CSE` to a value you choose.
4. Restart only the demo API, send again, and confirm the changed response appears.
5. Try `/text`, `/status/404`, an invalid URL, and `/slow`. Explain what each case shows.

You have now changed the API's output and observed the client receiving it, without changing the client itself.

## Checkpoint before adding more features

- Which file handles clicking Send? Which file actually calls `fetch`?
- What exactly does preload expose, and why do we keep it small?
- What would happen if you opened only the interface in a normal browser?
- Why does a 404 show a response while an unreachable server shows an alert?
- Why does the `finally` block matter?
- What information would we need to store to keep this response after quitting?

## Remaining request-workflow lessons

Extend the request object one feature at a time: method selection, a query parameter editor, a header editor, then a JSON body editor. Each feature gets its own working commit checkpoint. Keep the same UI → preload → main → service path. Teach the change at each layer before introducing SQLite.

## Git checkpoint 1

The first working milestone has passed 16 request-service checks, the production interface build, and an actual Electron desktop test. The desktop test covers the isolated bridge, sending a request, body/header viewing, pretty/raw JSON, text, HTTP 404, invalid URLs, Command+Enter, and an unreachable API.

**Commit now.** Make two logical commits using the files below. The assistant has not staged or committed any files.

1. Include `.gitignore`, `package.json`, `package-lock.json`, `index.html`, `vite.config.mjs`, and all files under `electron/`, `src/`, `scripts/`, and `tests/`. Message: `feat(desktop): add GET request workspace with secure IPC`
2. Include `README.md` and `LEARNING.md`. Message: `docs(learning): add setup guide and Electron walkthrough`

Do not include generated `node_modules/`, `dist/`, or `test-results/`; `.gitignore` already excludes them.

The message format is `type(scope): short description`. `feat` introduces behavior, `fix` corrects a bug, `docs` changes documentation, and `test` adds or improves tests. The scope names the area changed. A commit groups a meaningful change so you can explain or revisit it later; it does not need to correspond to one file.

Git commits record changes locally. Pushing sends those commits to GitHub. You control both steps.

## Lesson 2: choosing an HTTP method

The URL identifies a resource; the method describes what the client wants to do with it. The four methods currently supported by ReqDelta are:

| Method | Intended purpose |
| --- | --- |
| GET | Retrieve a resource's representation |
| POST | Ask a resource to process submitted data, often creating something |
| PUT | Create or replace a resource's representation at the target URL |
| DELETE | Ask the server to remove the target resource's association |

These are HTTP semantics. The API still needs to implement the operation, check permissions, and decide its response. Selecting DELETE does not itself guarantee that anything is deleted. See the [HTTP methods reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods).

This checkpoint adds the method choice only. No request body is sent yet. A bodyless POST or PUT can be transmitted, but an API that needs submitted data may reject it. The JSON body editor will be a separate checkpoint.

### Trace the change

1. In `src/App.jsx`, `useState('GET')` holds the chosen method. The `<select>` gets its current value from that state, and `onChange` updates it. This is a **controlled input**: React state determines what the control displays.
2. `handleSend` passes the chosen `method` and `url` as properties of the request object. `{ method, url }` is object shorthand for `{ method: method, url: url }`. Lesson 3 adds `queryParams` to this object.
3. Preload and main-process IPC already forward the whole request object. Their code does not need to change just because the method can vary.
4. In `electron/request-service.cjs`, `SUPPORTED_METHODS.includes(request.method)` checks the method against a short allowed list. A dropdown improves the UI; validation in the main service still enforces the rule.
5. `validateRequest` now returns `{ url, method }`. The line `const { url, method } = validateRequest(request)` extracts both properties using **object destructuring**.
6. `fetch(url, { method, ... })` receives the actual selected method, and the result records that method too. It is no longer hardcoded to GET.
7. In `scripts/demo-server.cjs`, `request.method` tells the demo API which method arrived. `/echo` returns that value as JSON without modifying stored data.

The method list appears in both the UI and main service intentionally: the UI offers choices, while the service validates untrusted input independently. Unit checks verify service behavior; the desktop check verifies every dropdown option reaches the API correctly.

### Practise it

1. Restart the demo API and the desktop app so the changed main-process service is loaded.
2. Click **Method echo**, choose POST, and send. Find `"method": "POST"` in the response.
3. Repeat with PUT and DELETE. The selected method should reach the demo API each time.
4. Enter the student URL while POST is selected, and send. You should see `405 Method Not Allowed`, with an `Allow: GET` header. This is the server rejecting a method for that endpoint, not a connection failure.
5. Click **Student JSON**. Its example resets the method to GET; send again and inspect the student data.

Checkpoint questions: What makes the selector a controlled input? Why validate the method in the main service as well? Why did the preload file stay unchanged? Why does `/echo` return a response for DELETE without deleting a student?

### Git checkpoint 2

Verification passed: all 25 request-service tests, the production build, and the desktop check sending all four methods to the local API. The desktop check also confirms the 405 response remains inspectable and GET example buttons reset the selected method.

**Commit now** after verification. Include all changes for this feature: the method selector and styling, request service, demo API, request/desktop checks, and these documentation updates.

Message: `feat(requests): support GET POST PUT and DELETE methods`

The query parameter editor is the next checkpoint, covered in Lesson 3 below.

## Lesson 3: query parameters and arrays in React

In a URL such as `http://localhost:3030/students/101?version=2`, `version` is a query parameter name and `2` is its value. The server decides what those parameters mean. Our demo API uses `version=2` to return the second student snapshot.

This editor adds **extra parameters**. Parameters already typed in the URL stay there, and enabled editor rows are appended when sending. The URL input is not synchronized with the rows. If you use the same name twice, both values are sent; it is up to the API how it interprets them.

### The row data

Each row has five properties:

```js
{
  id: 'a-stable-unique-id',
  enabled: true,
  key: 'version',
  value: '2'
}
```

The ID identifies the row in React, while `key` and `value` are the actual query parameter. The ID is not included in the URL. We use an array rather than one JavaScript object because repeated query names, such as `tag=one&tag=two`, need to remain separate entries.

### Follow the code

1. `src/App.jsx` stores `queryParams` in state and passes it to the row editor (originally `QueryParamsEditor`, now the shared `KeyValueEditor` introduced in Lesson 4). Keeping request state in the parent lets the editor change rows and the Send handler read the same list. This is called **lifting state up**.
2. The editor's Add button creates a row with `crypto.randomUUID()` and returns a new array using `[...params, newRow]`. Spread syntax copies the existing entries into that new array.
3. Editing a row uses `map()`. It returns a new object for the matching ID and keeps the other rows. Removing a row uses `filter()` to keep every row except that ID. We do not mutate the existing state array.
4. `<tr key={param.id}>` gives React a stable identity for each row. The table can use row numbers in labels, but those changing numbers should not be the React keys when rows can be removed.
5. `handleSend` includes `queryParams` in the request object. The preload and main IPC handler continue forwarding it without needing new bridge functions.
6. The main-process request service validates the list and row types before making a network call. Disabled rows and fully blank rows are skipped. A named row may have an empty value; a value without a name is an error.
7. `url.searchParams.append(param.key, param.value)` adds each enabled row. This handles encoding and repeated names. Concatenating `&name=value` manually can misinterpret characters such as `&` or `+` inside a value. See the [Node URL API](https://nodejs.org/api/url.html#urlsearchparamsappendname-value).
8. The demo `/echo` response now includes a `queryParams` array. Each entry contains a received `key` and `value`, so we can observe the actual network result rather than only checking what the UI displays.

### Practise it

1. Restart both the demo API and the desktop app. Main-process and demo-server code do not update through React's live refresh.
2. Click **Student JSON**, add a row named `version` with value `2`, and send. Find `fullName` and the string age `"20"` in the response.
3. Uncheck that row and send again. The original `name` field and numeric age should return. The row still exists so you can enable it again.
4. Click **Method echo**. Add `search` with the value `tea & coffee + café`. Send and confirm the response contains that complete value in one entry.
5. Add two `tag` rows with different values. Both should appear in the response. Then remove one and confirm the remaining row keeps its value.
6. Enter a value without a name and send. Explain why the app shows a validation error before reaching the API.

The earlier screenshot's `/echo` 404 was resolved by restarting the demo API. A running process keeps its loaded code; saving a new version on disk alone does not change that process.

Checkpoint questions: Why is the list state in `App`? Why use stable row IDs? What is the difference between an unchecked row, a removed row, and a named row with an empty value? Why use `append()` rather than overwriting an existing query name?

### Git checkpoint 3

Verification passed: all 39 request-service tests, the production build, and the desktop check. The desktop check covers parameter encoding, existing URL parameters, repeated names, adding/removing/disabling rows, blank rows, empty values, validation errors, the keyboard shortcut inside the editor, example resets, and the smaller-window layout.

**Commit now.** This checkpoint is one feature: the query parameter editor, request construction and validation, demo echo output, verification, and learning notes.

Message: `feat(requests): add query parameter editor`

This checkpoint included the new `src/components/QueryParamsEditor.jsx` file, renamed to `KeyValueEditor.jsx` in Lesson 4. Git does not include a new untracked file unless you select or add it.

The request header editor is the next checkpoint, covered in Lesson 4 below.

## Lesson 4: request headers and reusable components

Query parameters form part of the URL. Request headers are separate fields sent with the request. For example, `Accept: application/json` expresses the client's preferred response format; it does not guarantee that the server will return JSON. Header names are case-insensitive, so `Accept` and `accept` identify the same field. See the [HTTP field definitions](https://www.rfc-editor.org/rfc/rfc9110.html#name-field-names).

Do not confuse the two Headers tabs. The one in the request editor configures what we send. The one in the response viewer displays what the server sent back. Setting a request header does not automatically make it a response header; our local `/echo` API deliberately repeats received headers inside its JSON body for inspection.

### One row editor, two uses

The old query-only component was renamed to `src/components/KeyValueEditor.jsx`. Both parameter and header rows need a name, value, checkbox, Add button, and Remove button. Reusing that interface keeps those behaviors in one place.

`App` passes different **props** to configure each use: the title, row label, placeholders, help text, current row list, and change handler. The component does not decide how to send HTTP headers or construct URLs. Those rules stay in the main-process request service.

The component's `useId()` creates IDs for its heading and help text. These accessibility IDs are different from each row's `crypto.randomUUID()` ID, which provides a stable React list key.

### Follow the request

1. `App` owns `requestHeaders` and `queryParams` as separate state arrays. `requestTab` selects which editor is visible. Both arrays remain in the parent, so switching tabs preserves what you entered.
2. The header editor uses the same immutable `map`, `filter`, and array spread operations as the parameter editor. Its change handler updates `requestHeaders`.
3. The Send handler adds `headers: requestHeaders` to the object passed through the existing preload bridge. No new IPC channel is needed.
4. `validateRequest` calls `buildHeaders` in `electron/request-service.cjs`. It checks the list shape, ignores disabled and fully blank rows, and requires a name for any row containing a value.
5. Node's `validateHeaderName` and `validateHeaderValue` check header syntax. This prevents malformed values, including line breaks, from reaching the HTTP client. Error messages identify the row without repeating its value. See [Node's header validation APIs](https://nodejs.org/api/http.html#httpvalidateheadernamename-label).
6. `Headers` is a built-in collection for HTTP fields. We use `headers.has(name)` to detect duplicate enabled names regardless of case, then `headers.set(name, value)` to add each accepted field. This app rejects duplicates instead of silently combining or replacing their values.
7. `fetch(url, { method, headers, ... })` sends the prepared fields. The demo server's `request.headers` object lets us verify what actually arrived. Its names appear in lowercase.

### Rules for this version

- Disabled rows and fully blank rows are skipped. A named header may have an empty value.
- Header names are trimmed. The built-in `Headers` collection also trims surrounding whitespace from values.
- Names must use valid HTTP field syntax; values cannot contain line breaks or characters unsupported by the HTTP client. Query encoding is not applied to header values.
- Keep one enabled row per header name. Unlike query parameters, this editor does not support repeated enabled names.
- `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `TE`, `Trailer`, `Upgrade`, `Expect`, and `Proxy-Connection` are managed by the client and cannot be overridden in this version. They affect the connection or message framing. Application headers such as `Accept`, `Content-Type`, and `Authorization` are allowed.
- Both request lists are cleared when choosing an example. Nothing is persisted yet.

`Accept` describes the response format the client wants. `Content-Type` describes the content being sent. The next checkpoint will add a JSON body and use `Content-Type: application/json` for it.

### Practise it

1. Restart the demo API and desktop app to load the updated server and main-process service.
2. Click **Method echo**, open the request's **Headers** tab, and add `X-Demo-Client` with value `ReqDelta`.
3. Send and find `"x-demo-client": "ReqDelta"` in the response body's `headers` object.
4. Disable the row and send again. The custom field should be absent. Enable it again to restore it.
5. Add `Accept: application/json`, then add `accept: text/plain`. Send and explain why the duplicate produces a validation error. Disable one of them and try again.
6. Switch to Params and add `page=2`. Switch back to Headers and confirm your rows remain. Send and find both the query parameter and custom header in the response body.
7. Change a header name to `Bad Name` and send. Explain why the space is rejected here while a space in a query value can be encoded.

Checkpoint questions: Which state belongs to `App`? What changes through props when the shared editor is used for headers? Why does the main process validate fields even though the UI uses text inputs? What is the difference between the request Headers tab and the response Headers tab?

### Git checkpoint 4

Verification passed: all 68 request-service tests, the production build, and the desktop check. The desktop check confirms real custom header delivery, disabled and empty fields, duplicate/invalid/managed-header errors, adding/removing rows, query/header tab persistence, combined requests, keyboard shortcuts, example resets, the smaller-window layout, and the existing request workflow.

**Commit now.** Include all changes for this feature, including the removal of `QueryParamsEditor.jsx` and the new shared `KeyValueEditor.jsx`. Git can recognize the change as a rename after both paths are included.

Message: `feat(requests): add custom request header editor`

The JSON request body editor is the next checkpoint, covered in Lesson 5 below.

## Lesson 5: JSON request bodies

The method says which operation we request, the URL identifies the resource, and a body carries data submitted to it. For example, a POST may submit student details. The server still needs to support that route, validate the fields, and decide what to do with them. Our `/echo` endpoint only inspects the request; it does not save a student.

`Content-Type: application/json` labels the submitted body as JSON. `Accept: application/json` asks for JSON in the response. These two headers describe different directions. See the [Fetch request body guide](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#setting_a_body).

### Data model and React state

`App` owns one body configuration object:

```js
{
  mode: 'json',
  text: '{"name":"Rahul","branch":"CSE"}'
}
```

The `text` property contains a string, not a JavaScript student object. It must remain a string while editing because drafts can be incomplete JSON. `JsonBodyEditor` uses a controlled textarea, and calls the parent's change handler with a new object when you type or choose a mode.

`{ ...body, text: newText }` copies the existing properties and replaces `text`. When the method switches to GET, `setRequestBody(current => ({ ...current, mode: 'none' }))` preserves the latest draft while changing only its mode. This functional state update receives the current state from React.

Choosing None keeps the draft but sends no body. Switching back from GET leaves None selected; choosing JSON again restores the draft. Choosing an example clears the draft, parameters, and headers.

### Follow the code

1. The Body request tab renders `src/components/JsonBodyEditor.jsx`. Its None/JSON selector controls whether the textarea appears. JSON is unavailable for GET in this Fetch-based client.
2. **Use sample JSON** fills the textarea with an object formatted using `JSON.stringify(..., null, 2)`. The sample is actual draft text; the placeholder alone is not sent.
3. `handleSend` adds `body: requestBody` to the existing request object. Preload and IPC continue forwarding that object without a new channel.
4. `buildRequestBody` in `electron/request-service.cjs` checks the configuration shape, skips None mode, and rejects a GET body even if the UI is bypassed.
5. It checks `Buffer.byteLength(text, 'utf8')` against a 1 MiB limit. MiB means 1,048,576 bytes. Network payload size is measured in bytes, and Unicode text can use multiple bytes per character.
6. `JSON.parse(text)` checks syntax. Empty text, trailing commas, and single-quoted property names are rejected. Arrays and primitive JSON values such as `false`, `0`, and `null` are accepted. See [JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse).
7. If Content-Type was not supplied through the Headers editor, the service adds `application/json`. Explicit Content-Type values are preserved so you remain in control of the request.
8. The service returns the original text, then passes it to `fetch` as the request body. In `const { body: requestBody } = ...`, object destructuring renames the property locally, keeping it distinct from the response body read later.
9. The demo API receives body chunks as bytes. It collects them, decodes the complete UTF-8 text once, and returns `rawBody` plus a parsed `body` for inspection. Collecting bytes first avoids corrupting a Unicode character split across chunks.

### Validation is different from serialization

We parse the text to check it, then discard that parsed value and send the original text. Calling `JSON.stringify(body.text)` would turn the entire JSON document into a quoted JSON string. Parsing and serializing it again could also alter formatting or large integer literals. Our check preserves the submitted text.

The demo's parsed `body` uses JavaScript values, so large integer values in that parsed display may lose precision. Its `rawBody` field preserves the received text. Valid JSON also does not prove the data matches an API's schema: a missing required field may still produce a valid HTTP error response.

The body limit applies only when JSON mode actually sends the draft. None mode sends no draft and adds no automatic Content-Type. An explicitly configured Content-Type header remains under your control in either mode.

### Practise it

1. Restart the demo API and desktop app to load the updated server and main-process service.
2. Click **Method echo**, choose POST, open **Body**, select JSON, and click **Use sample JSON**.
3. Send. Find the student fields in the echoed `body`, the submitted text in `rawBody`, and `application/json` in the received headers.
4. Change a value to your own name and send again. Add a query parameter and custom header, then confirm all three types of input arrive together.
5. Remove a closing brace and send. Explain why the error appears before an HTTP request is made. Choose None and send again; the unfinished draft should not be sent.
6. Restore valid JSON and select GET. The body mode becomes None. Switch to POST, choose JSON, and confirm your draft is still there.

Checkpoint questions: Why store the body draft as text? How does `JSON.parse` differ from `JSON.stringify`? Why is Content-Type different from Accept? Why use a functional state update when switching to GET? Why validate in the main process as well as limiting choices in the UI?

### Git checkpoint 5

Verification passed: all 94 request-service tests, the production build, and the desktop check. Checks include actual JSON delivery with POST/PUT/DELETE, Unicode, exact text preservation, automatic/custom Content-Type, invalid JSON recovery, None/GET draft behavior, sample/reset actions, combined parameters/headers/body, the smaller-window layout, and the existing request workflow.

**Commit now.** Include the new `src/components/JsonBodyEditor.jsx` and all other changes for this feature: the request service, App state and Body tab, demo API, styling, tests, and documentation.

Message: `feat(requests): add validated JSON request body editor`

The basic request-building phase is complete. The SQLite storage foundation is covered in Lesson 6 below. Collections, saved requests, and execution history will follow in small steps.

## Lesson 6: SQLite storage foundation

React state is temporary: quitting the app loses the current screen data. SQLite writes records into a local database file, so they can be read by a later connection or app run. This checkpoint creates the database and its structure; the interface does not save requests or history yet.

We use `require('node:sqlite')` in the main process. Electron has its own Node runtime, so testing SQLite in the terminal's Node alone was not enough. We checked the module in Electron 45's bundled Node 24.22 as well. See [Node's SQLite API](https://nodejs.org/api/sqlite.html).

### The three tables

| Table | What one row represents | Relationship |
| --- | --- | --- |
| `collections` | One named request group | Can contain many saved requests |
| `saved_requests` | One named request configuration | Requires an existing collection |
| `request_history` | One execution snapshot or failure | May link to a saved request; can also represent an unsaved request |

An **integer primary key** identifies each row. A **foreign key** links a child row to an existing parent row. `saved_requests.collection_id` references `collections.id`, and `request_history.saved_request_id` optionally references `saved_requests.id`. `NULL` in the history link means no saved request is associated.

The deletion rules are explicit: deleting a collection deletes its saved requests (`ON DELETE CASCADE`). Deleting a saved request keeps its history, setting the optional link to NULL (`ON DELETE SET NULL`). History stores its own JSON copies, so editing a saved request does not change an older snapshot. See [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).

### Follow database startup

1. In `electron/main.cjs`, after Electron is ready, we choose the file under `app.getPath('userData')` and call `openDatabase`.
2. `electron/database.cjs` creates the parent directory if needed, opens `DatabaseSync`, enables foreign-key enforcement, and sets a short wait for busy database locks.
3. `BEGIN IMMEDIATE` starts a transaction before reading the schema version. This reserves the writer slot so two app starts cannot both decide to run the first migration at once.
4. `PRAGMA user_version` reads our schema version number. A new database starts at 0. We reject versions newer than this app understands, leaving their data in place.
5. For version 0, we read and execute `electron/migrations/001-initial.sql`, then set the version to 1.
6. `COMMIT` saves the setup as one unit. If anything fails, `ROLLBACK` undoes the setup, the connection closes, and the error reaches the startup handler. The app shows the problem rather than replacing the database. See [SQLite transactions](https://www.sqlite.org/lang_transaction.html).
7. Opening a version 1 database skips the initial migration. The app retains the connection until `will-quit`, where it closes it. On macOS, closing the window alone can leave the app running; Command+Q actually quits it.

A **migration** is a versioned change to database structure. Once version 1 is applied, editing its SQL file will not reapply it to that database. Future structural changes need a later migration and version, not deleting the user's file.

### Read the SQL file

`NOT NULL` requires a value. `CHECK` enforces rules such as supported methods, nonblank names, valid JSON, and a nonnegative execution duration. Saved requests store query/header arrays as JSON text and keep body mode and text separately. History stores request and response objects as JSON snapshots.

A history row contains either a response snapshot or an error code/message. An HTTP 404 is still a response snapshot; a network failure has no HTTP response. The SQL check prevents a record from claiming both outcomes or neither.

Timestamps default to UTC strings. Their `updated_at` defaults apply when inserting a row; later update handlers will explicitly update that field. Indexes prepare common lookups by collection, saved request, and execution time. They help find rows without changing what the rows mean.

`DatabaseSync` runs SQL synchronously. We are keeping the setup and later queries small in the main process. The renderer receives approved operations through preload, never the raw database connection or an arbitrary SQL function.

### Persistence exercise

Run `npm run db:demo` from the project folder. No demo API or desktop window is needed.

The script creates a separate temporary database and inserts a collection, a saved request, and a fake HTTP 200 execution. It then closes and reopens the file. You should see:

```text
Closed the database. Reopening the same file...
Read back: Student API → Get student → HTTP 200
```

In `scripts/database-demo.cjs`, statements use `?` placeholders and `.run(...)` arguments. Those **bound parameters** keep values separate from SQL text. `.get()` reads one result, and `.all()` reads a list of results. `JSON.stringify` stores a JavaScript snapshot as text; SQL's `json_extract` reads its status in the demonstration query.

Try changing the example collection or request name and run the exercise again. Each run uses a fresh file and prints its path. It does not seed your actual workspace or make a real network request.

Checkpoint questions: What is the difference between a primary key and a foreign key? Why does history keep separate snapshots? What happens when a saved request is deleted? Why do migration statements and the version update share one transaction? Why can the demo read a record after closing the connection?

### Git checkpoint 6

Verification passed: all 116 tests, the production build, the isolated database demonstration, and the Electron desktop check with an actual app restart. Database checks cover empty setup, persisted rows, foreign keys, deletion behavior, constraints, rollback of a failed migration, and preservation of newer-version or corrupt files.

**Commit now.** Include all changes for this checkpoint, particularly the new database module, migration SQL, database demonstration, and database tests. Database data files belong outside Git; `.gitignore` excludes them.

Message: `feat(storage): add versioned SQLite database foundation`

The interface is unchanged in this checkpoint. No real requests or responses are stored yet. Next separate checkpoint: collection creation and listing through the main process, preload, and React interface.
