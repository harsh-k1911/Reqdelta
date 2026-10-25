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

Schema note: this lesson describes the version 1 foundation at that checkpoint. Lesson 8 upgrades saved requests to version 2; Lesson 9 upgrades history to version 3. The current `db:demo` uses placeholder BLOB bytes for both its made-up saved request and execution snapshot. Only Electron performs real encryption.

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

In `scripts/database-demo.cjs`, statements use `?` placeholders and `.run(...)` arguments. Those **bound parameters** keep values separate from SQL text. `.get()` reads one result, and `.all()` reads a list of results. The current demonstration reads the status metadata column through a join; its BLOBs are opaque placeholders. The real app serializes and encrypts configurations/snapshots as explained in Lessons 8 and 9.

Try changing the example collection or request name and run the exercise again. Each run uses a fresh file and prints its path. It does not seed your actual workspace or make a real network request.

Checkpoint questions: What is the difference between a primary key and a foreign key? Why does history keep separate snapshots? What happens when a saved request is deleted? Why do migration statements and the version update share one transaction? Why can the demo read a record after closing the connection?

### Git checkpoint 6

Verification passed: all 116 tests, the production build, the isolated database demonstration, and the Electron desktop check with an actual app restart. Database checks cover empty setup, persisted rows, foreign keys, deletion behavior, constraints, rollback of a failed migration, and preservation of newer-version or corrupt files.

**Commit now.** Include all changes for this checkpoint, particularly the new database module, migration SQL, database demonstration, and database tests. Database data files belong outside Git; `.gitignore` excludes them.

Message: `feat(storage): add versioned SQLite database foundation`

The interface was unchanged in this checkpoint. Collection creation and listing are covered in Lesson 7 below. Real requests and responses are still not stored yet.

## Lesson 7: create and list collections

A collection is a named group that will contain saved requests. This checkpoint implements the **Create** and **Read** parts of CRUD (Create, Read, Update, Delete). It uses the existing `collections` table, so its structure and schema version stay at 1. Request saving, renaming, and deletion are separate work.

### Follow one creation

1. In `src/components/CollectionsPanel.jsx`, **+** opens a controlled form. The input's `value` comes from `name` state; `onChange` updates that state. Cancel clears the draft without calling the bridge.
2. Submitting calls `handleCreate`, which sets `saving` to disable repeated submissions and calls `window.reqdelta.createCollection({ name })`.
3. `electron/preload.cjs` forwards that specific operation to `collections:create`. The bridge now exposes three functions: `sendRequest`, `listCollections`, and `createCollection`. It still exposes neither SQL nor `ipcRenderer`.
4. `electron/main.cjs` checks the window, main frame, and page URL with `isTrustedSender`, then calls `createCollection(database, input)` in the collection service. HTTP and collection handlers share the same sender check.
5. `electron/collections-service.cjs` validates the incoming object and name, trims surrounding whitespace, and allows 1–100 Unicode code points. `Array.from(name).length` counts an emoji such as 😀 once, whereas JavaScript's ordinary `.length` counts its two UTF-16 units. Null characters are rejected because SQLite string length treats them specially.
6. The service prepares `INSERT INTO collections (name) VALUES (?) RETURNING ...` and calls `.get(name)`. Here `?` is a bound value. SQLite inserts the row and `RETURNING` gives us that same row's ID, name, and timestamps. `.get()` reads its single returned row.
7. Only after SQLite succeeds does React prepend the returned record with `setCollections((current) => [result.collection, ...current])`. The functional update uses the latest list. `collection.id` is the permanent React list key, even if two records have the same name.
8. The form closes on success. On failure it preserves your draft and displays a creation error; `finally` re-enables the controls.

Bound parameters keep data separate from SQL instructions. A name such as `Harsh's API` is one text value; its apostrophe does not end an SQL string. The SQL field list is a constant in our code, while only the user's name is bound. React also displays names as text, so a name containing `<b>` does not become HTML.

### How reopening restores the list

`useState` alone cannot survive quitting. `useEffect` in `CollectionsPanel` loads collections when the component mounts. It calls `listCollections` through preload, and the service runs `SELECT ... ORDER BY id DESC` with `.all()`. `.all()` reads every returned row. IDs give a consistent newest-first order even when two rows have the same timestamp.

The effect stores those database rows in React state. On a later app launch, the new component begins with an empty array and fills it from the same SQLite file. React is the screen's current view; SQLite is the persistent source.

The effect has a cleanup function that sets `active = false`. An old asynchronous reply is then ignored if the component has unmounted or a retry has replaced the load. Creation happens in the submit handler, outside the effect, so mounting or retrying a list load cannot create a collection.

Loading, load errors, creation errors, and successful notices are separate interface states. Retry changes `reload`, which causes the effect to run again. The main process returns short storage messages instead of raw SQL errors or file paths.

### Practise it

1. Restart the desktop app so the new main-process handlers and preload functions are loaded. This feature does not need the demo API.
2. Create `Student API`, then create a second collection with your name. Notice that the newest appears first.
3. Submit spaces alone. Explain why trimming produces an invalid empty name, even though the input contained characters. Correct the name and try again.
4. Open the form, enter a name, and cancel. Explain why no database row appears.
5. Quit with Command+Q and reopen. Trace how the collections return without relying on the previous React state.
6. Read `createCollection` and point out the SQL placeholder and the separately supplied value. Explain why a collection ID is a better list key than its name.

Checkpoint questions: Why validate in the main process? What does `RETURNING` return? How do `.get()` and `.all()` differ? What is the difference between initial loading in `useEffect` and creation in an event handler? Why does a second collection with the same name still have a different identity?

### Git checkpoint 7

Verification passed: all 134 tests, the production build, and the desktop check. Checks cover collection validation, SQL-looking names, Unicode limits, duplicate names, stable ordering, and storage failures, plus the existing database and HTTP behavior. The desktop check creates collections through the real bridge, verifies cancellation and the smaller-window layout, then quits and reopens the app to confirm that the same records load into the sidebar.

**Commit now** after completing the exercise. Include the new collection service, sidebar component, and service tests, along with the main/preload bridge changes, App integration, icon, styles, desktop check, README, and this lesson.

Message: `feat(collections): add persistent collection creation and listing`

Saving a configuration and loading it back into the request builder are covered in Lesson 8 below.

### Delivery question: does a desktop app need deployment?

Your college accepts the app and its source code, so no hosted website is required. Packaging bundles the application with Electron into a macOS `.app` that runs without a development server; that is a later checkpoint. SQLite remains on the user's Mac. The demo API remains a separate local process, while requests to remote APIs need their usual network access. See [Electron application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).

Public distribution adds signing and notarization work; that is separate from our current college delivery plan. See [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

## Lesson 8: save and restore request configurations

Checkpoint note: Lesson 8 describes the application before automatic history. Lesson 9 adds execution snapshots; `copyRequest` now lives in `electron/request-config.cjs` so saving and execution share the same bounded configuration copy.

A **request configuration** is the set of inputs needed to make a request: method, original URL, query rows, headers, and body mode/text. A **response** is what the server returns after execution. This checkpoint persists configurations only. Saving or opening one does not contact the API, and it does not save a response or create history.

### The new database layout

`saved_requests` still belongs to a collection through `collection_id`. Its readable columns are ID, collection ID, request name, HTTP method, and creation/update timestamps. The new `request_encrypted` column is a **BLOB**: a sequence of bytes containing the protected configuration.

The original version 1 layout had separate plaintext URL/header/body fields. Those could contain credentials. Rather than trying to guess which header or JSON field is a secret, we protect the complete configuration. SQL can check the BLOB's type and size, but cannot inspect the encrypted JSON; the service validates the configuration before encryption and after decryption.

`002-protected-requests.sql` creates the replacement table, removes the empty old one, renames the replacement, and recreates its collection index. `openDatabase` applies this inside the existing startup transaction and changes `PRAGMA user_version` to 2. Your collections keep their IDs and names. The first migration stays unchanged so older workspaces have a defined upgrade path.

The previous interface could not save requests, so its saved-request table should be empty. If someone manually inserted version 1 request rows, a guard refuses the upgrade and preserves that file for manual conversion. It does not silently drop those rows. Both the normal collection-preserving upgrade and this refusal are tested. A version 2 file skips the migrations on later launches.

### Follow Save to collection

1. `src/App.jsx` continues to own the builder's method, URL, rows, and body. It passes the current configuration to `SaveRequestForm`. The child owns only its request name, collection choice, and save-form messages.
2. Opening the save form loads the available collections. The form uses their IDs as option values and their names as labels. If there are none, saving is disabled and you can create one in the sidebar, then refresh the form's list.
3. Submitting calls `window.reqdelta.createSavedRequest({ name, collectionId, request })`. The preload forwards it to `saved-requests:create`; the main handler checks the sender before calling the service.
4. `electron/saved-requests-service.cjs` checks the collection ID/name and calls the shared `validateRequest` function. That function builds and validates HTTP inputs but does not execute `fetch`. Saving can therefore reject an invalid active JSON body or duplicate enabled header without contacting the API.
5. `copyRequest` keeps only the supported fields, gives editor rows their own IDs, and checks a 2 MiB configuration limit. It preserves disabled rows and exact body text. It keeps the original URL separate from parameter rows: storing the validator's already-appended URL would append those rows again on the next send.
6. `electron/secure-storage.cjs` serializes `{ version: 1, request }` with `JSON.stringify`, then asks Electron's asynchronous `safeStorage` API to encrypt that string. This payload format version is separate from the SQLite schema version.
7. The service binds the resulting bytes into one `INSERT ... RETURNING` statement with the readable metadata. No URL, header value, or body text is passed into a plaintext SQL column.
8. Only after the insert succeeds does React show the saved record, expand its collection, and refresh that collection's request list. The returned database ID identifies the saved request. Cancel save makes no insert, and a failure keeps your builder draft available.

### Serialization and encryption do different jobs

`JSON.stringify` converts a JavaScript object to text so it can be stored and reconstructed. It does **not** hide the data. Encryption turns that text into bytes that require the appropriate key to decrypt. Base64 encoding alone would not provide that protection either.

We use macOS's existing protection through Electron, rather than implementing our own cryptography or storing an encryption key beside the database. The key is backed by the macOS Keychain. The asynchronous API keeps the operation promise-based; it is the current API in Electron 45. See [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

There is no plaintext fallback if encryption is unavailable. Names and methods remain visible metadata, so do not put credentials into names. This protection applies to saved configuration bytes on disk; the running application must still hold the opened configuration in memory to let you edit and send it. Copying the database to another Mac/account does not copy the Keychain key. Packaged-build identity and signing are separate delivery checks.

### Follow opening a saved request

1. `CollectionsPanel` expands one collection and calls `listSavedRequests({ collectionId })`. This reads metadata only, so listing names does not need to decrypt every configuration.
2. Clicking a request passes its permanent ID to `App`'s `handleOpenRequest`. The bridge calls `getSavedRequest({ id })`.
3. The main service reads that row, decrypts its BLOB through the secure-storage adapter, parses the JSON, checks the payload version, and validates its request fields again. A missing or unreadable record returns a short error and is kept in place.
4. `App` restores method, original URL, query rows, headers, and body together. It clears the previous response and returns the request tabs to Params. Press Send yourself to execute the restored configuration.
5. Late sidebar replies are ignored when a collection changes. The list also tracks which collection its rows belong to, so switching groups cannot briefly display another group's requests.

The editor row IDs are temporary UI identities; the saved request's database ID is the permanent record identity. They solve different problems. A disabled row stays disabled after loading even though editor row IDs can be regenerated.

The native decryptor can also request re-encryption after a key change. The adapter returns replacement ciphertext in that case, and the service updates just that BLOB. A key refresh does not change the record's name, ID, or user-edit timestamp.

### Editing does not overwrite the saved copy

Once a request is opened, changes affect React's current draft. **Save as new** creates another database row, potentially with the same name but a different ID. The original stays intact. An explicit update operation will need its own handler and UI; we have not implemented one yet. Renaming and deleting saved requests are also pending.

### Practise it

1. Quit and restart the desktop app to load the new preload, handlers, and database migration. Your collections should remain.
2. Start the demo API. Choose Method echo, select POST, add a query parameter and an `X-Demo-Client` header, choose JSON, and insert sample JSON.
3. Choose Save request, name it `Student echo`, select `Student API`, and save. Notice that saving alone produces no response.
4. Choose Student JSON to replace the current draft. Expand Student API and click Student echo. Confirm that POST, your rows, and your JSON draft return. Send to see the echoed inputs.
5. Change a value, use Save as new, and give the new record another name. Reopen the first saved request and confirm its original value remains.
6. Quit with Command+Q and reopen. Open the saved request again and explain where each restored field came from. Do not confuse the restored configuration with a stored response; responses are not persisted yet.

Checkpoint questions: Why does saving share request validation but not execute a request? Why keep the original URL separate from extra rows? How does JSON serialization differ from encryption? Why can the sidebar list names without decrypting? Which ID identifies an editor row, and which identifies a stored request? Why does editing React state leave the original saved request unchanged?

### Git checkpoint 8

Verification passed: all 176 tests, the production build, the database exercise, and the desktop check. The desktop check uses real macOS encryption with made-up credentials, confirms those values are absent from database bytes, verifies no network execution during save/load, and restores a configuration after quitting and reopening. Tests also cover the version 1 collection upgrade, preservation of unexpected manually seeded data, validation, grouping, cancellation, disabled rows, exact body text, and the smaller-window layout.

**Commit now** after completing the exercise. Include all changes for this feature, including the second migration, saved-request service, secure-storage adapter, save form, new tests, bridge/database changes, sidebar and App integration, styles, updated database exercise, desktop check, and documentation.

Message: `feat(requests): save and restore encrypted request configurations`

Execution history and stored response inspection are covered in Lesson 9 below.

## Lesson 9: execution history and response snapshots

A saved request is a reusable configuration. A history entry is a copy of the configuration and the outcome of **one execution**. Executing a saved request twice creates two history entries. Unsaved requests get history too. Changing a later draft does not change either earlier snapshot.

### Trace one Send action

1. `App` sends the configuration and an optional `savedRequestId` through the existing `sendRequest` bridge. A modified draft may still link to its originating saved request; its snapshot captures the inputs actually used.
2. The trusted main-process handler calls `request-runner.cjs`. It uses `copyRequest` from `request-config.cjs` to validate, copy supported fields, and enforce the 2 MiB configuration limit before making any HTTP call. Invalid input returns an error without history.
3. The runner records a start timestamp, then calls the existing `executeRequest` service **once**. An HTTP response, including 404, is `ok: true`. A timeout, network failure, or response-size failure is an error outcome.
4. For a response, the existing duration measures receiving headers and body. For a failure, the runner measures elapsed attempt time. The later encryption/database time is not added to the HTTP duration.
5. `history-service.cjs` copies the configuration and serializes `{ version: 1, request, outcome }`. The existing secure-storage adapter encrypts that whole snapshot, including response headers/body or the failure message. The serialized snapshot has a 16 MiB limit.
6. After encryption finishes, the service starts a short SQLite transaction, inserts the encrypted snapshot and readable metadata, prunes older entries if required, and commits. Neither network I/O nor an encryption await occurs while that transaction is open.
7. The runner returns the HTTP outcome with a separate `history` result. React renders the response or request error and refreshes history after a successful insert.

### A history failure is separate from an HTTP failure

Suppose a POST reaches the API and returns HTTP 200, but SQLite cannot save its snapshot. Reporting only a request error could encourage repeating an operation that the server already completed.

The runner preserves the HTTP outcome and returns `history: { saved: false, message }`. The interface shows **History was not saved** alongside the response. There is no automatic HTTP retry. If the API itself failed too, the original request error is still shown. Unit tests and an actual desktop database-failure check verify this behavior.

### Schema version 3

`003-protected-history.sql` replaces the previously unused history layout. The readable metadata is ID, optional saved-request ID, method, status/error code, duration, and start time. `snapshot_encrypted` stores the protected request/outcome bytes. There are no plaintext URL, response-body, response-header, or error-message columns.

The SQL check permits either a status code or an error code. An HTTP 404 is the status-code case; a network failure has no inspectable HTTP response and uses the error-code case.

A version 2 app workspace upgrades without changing its existing encrypted saved-request bytes. The old interfaces did not create history. Unexpected manually inserted older history causes the upgrade to stop and preserve the file rather than delete those records. Versions 1 and 2 migration files stay unchanged. Startup still applies pending migrations and version changes in one transaction.

The foreign key is optional and uses `ON DELETE SET NULL`. Removing a saved request or its collection can detach the link, while the encrypted execution copy stays available. The history list uses a linked request's current name when it exists; that label is separate from the stored configuration and outcome.

### Retention and transactions

History retains the newest 100 entries within 50 MiB of encrypted snapshot bytes. After inserting, the service reads IDs and BLOB lengths in descending ID order, accumulates their sizes, and removes entries beyond either limit. This measures retained payloads; SQLite's physical file can remain larger while pages wait to be reused.

The insert and pruning share a transaction. If pruning fails, rollback also removes the attempted insert, leaving existing history intact. If encryption fails, no transaction begins and no plaintext fallback is used. The unit tests lower the limits to verify count-based and byte-based pruning without filling the real workspace.

Snapshots keep their captured content until retention removes the record. Opening one does not update its contents. The only internal rewrite is equivalent ciphertext when the native key provider requests re-encryption.

### Listing and opening history

`HistoryPanel` loads 20 metadata rows through `listHistory`. It does not decrypt every response just to draw a list. Pagination uses the last visible ID as `beforeId`: the next query reads IDs below it. This avoids duplicate rows if a new execution arrives between pages. The query uses bound values and a fixed page size.

Clicking Open calls `getHistoryEntry({ id })`. The main process decrypts and checks the payload, then returns its request and outcome. `App` restores them into the builder, shows a **Saved execution** banner, and does not call Send. This works even when the API is stopped and after the desktop app has restarted.

Opening history creates an independent draft, without modifying a saved request. Editing the URL, method, parameter rows, headers, or body clears the historical result from the screen. Pressing Send explicitly executes that draft again and creates a new history entry. The original snapshot remains unchanged.

The bridge now has eight narrow operations. The two additions read history: `listHistory` and `getHistoryEntry`. There is no public history-insert operation; recording occurs inside the main-process runner after execution. The dependency passed into the runner lets unit tests substitute an executor and history writer without making real network calls.

### Practise it

1. Restart the desktop app to load the new handlers and migration. Existing collections and saved requests should remain.
2. Start the demo API, choose Student JSON, and send. Add the query parameter `version=2` and send again. You now have two execution snapshots with different student JSON.
3. Choose History and open the earlier entry. It should contain `name` and numeric `age: 20`. Open the later one and find `fullName` and string `age: "20"`.
4. Stop the demo API and open those entries again. Explain why they still display even though sending would fail.
5. Try sending while the server is stopped, then inspect that failure in History. Explain why it has an error code rather than HTTP 404.
6. Quit with Command+Q, reopen, and inspect a response snapshot. Edit its URL and observe the saved-execution banner and displayed response clear. Open the entry again to confirm that its stored content did not change.

Checkpoint questions: How does a saved request differ from a history entry? Why store a copy rather than only a foreign key? Why does a 404 have a response snapshot? Why must a storage failure never trigger an automatic POST retry? Why encrypt before starting the SQL transaction? What does an ID cursor solve? What happens when either retention limit is reached?

### Git checkpoint 9

Verification passed: all 210 tests, the production build, the database exercise, and the desktop check. Checks cover encrypted responses/failures, independent snapshots, cursor paging, both retention limits, rollback, existing-workspace upgrades, offline inspection after restarting, and a real history-write failure that preserves the HTTP response without retrying it. The previous request-builder, collection, and saved-request flows still pass.

**Commit now** after completing the exercise. Include the new history migration/service, request runner, shared configuration module, History panel, and new tests, along with main/preload/App integration, response states, icons/styles, updated database checks/demo, desktop check, README, and this lesson.

Message: `feat(history): persist encrypted execution snapshots`

The recursive comparison engine is covered in Lesson 10 below. Connecting it to stored responses is the following checkpoint.

## Lesson 10: the recursive JSON comparison engine

This checkpoint implements the comparison algorithm as an independent function in `electron/json-diff.cjs`. It has no database, Electron, or HTTP dependency. Its inputs are JSON text strings, and its output is a change report. The next checkpoint will call it with response bodies read from History.

Start with `npm run compare:demo`. The exercise compares the original student with version 2 and prints these observations:

| Path | Change | Before | After |
| --- | --- | --- | --- |
| `/age` | Type changed | Number `20` | String `"20"` |
| `/fullName` | Added | Missing | `"Rahul"` |
| `/name` | Removed | `"Rahul"` | Missing |

The program does not know that `name` was renamed. It observes one removal and one addition. It also cannot know whether these changes break a particular client; that depends on how the client uses the API.

### What recursion means here

Recursion means a function solves a smaller version of its own problem by calling itself. Our `walk(oldValue, newValue, path)` compares one pair of values. If they are objects or arrays, it calls `walk` on smaller pairs inside them.

For the student example:

1. `compareJsonBodies` parses both strings with `JSON.parse`. This gives JavaScript values rather than text lines.
2. `walk(before, after, '')` begins with the two root objects.
3. It gathers the union of their keys using `Set`, then sorts those keys for stable output order.
4. At the key `age`, it calls `walk(20, '20', '/age')`. The number and string types differ, so `record` adds a type change and that call returns.
5. The root call continues with its remaining keys. `fullName` exists only on the second side, so it records an addition. `name` exists only on the first side, so it records a removal.
6. When all child calls return, the root call finishes. The returned report includes the change list, counts by kind, and an `equal` boolean.

For a nested city, the calls become smaller step by step:

```text
walk(root objects, '')
  walk(student objects, '/student')
    walk(address objects, '/student/address')
      walk('Pune', 'Mumbai', '/student/address/city')
        record a value change, then return
```

The **base cases** are an added member, a removed member, different types, or primitive values. These cases do not recurse further. Matching objects and arrays are the recursive cases. Each call has its own arguments and local variables on the call stack, while all calls collect changes in the same result array.

### Read the four helpers first

`parseBody` checks text input and byte size before parsing. It replaces native syntax-error messages with a generic message, because parser errors can repeat response contents.

`jsonType` handles two JavaScript surprises explicitly: `typeof null` is `object`, and arrays also have type `object`. We need separate `null`, `array`, and `object` categories to report type changes correctly.

`pointerChild` appends a property name or array index to the current path. We use [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901), where `/student/age` identifies a nested value and `''` identifies the root. The escapes `~0` and `~1` keep literal tilde/slash characters inside a key unambiguous. An empty-string key has path `/`, which differs from the root.

`record` creates one change, updates its category count, and enforces output limits. It includes the before/after values only when those sides exist. A missing member is not represented as `null`.

### Missing is different from empty or false

The unique `MISSING` Symbol marks a member that does not exist on one side. JSON cannot contain that Symbol, so it cannot be confused with an actual API value.

`Object.hasOwn(value, key)` checks whether a member exists. Checking `if (value[key])` would be wrong: valid values such as `false`, `0`, `''`, and `null` are falsy. Even keys named `__proto__` or `constructor` are treated as ordinary own JSON members; the algorithm reads them without assigning them to a shared prototype.

An added object is one added branch, carrying its object value. We do not also report each of its leaves as separate additions. Similarly, replacing an object with an array is one type change. This keeps the change counts clear and avoids describing the same replacement many times.

### How arrays are compared

Arrays use indexes, not object keys or IDs. The loop runs from 0 to the greater length. If one array has no item at an index, that side receives `MISSING`.

Comparing `[1, 2]` with `[0, 1, 2]` reports value changes at `/0` and `/1`, then an addition at `/2`. The engine does not infer an insertion at the front or match objects by an `id` field. This is a deliberate first-version rule that you should explain during your demo.

### Limits and number semantics

Before comparing, `inspect` walks both complete inputs. It checks depth, total values, and supported numbers, including inside a branch that may later be reported as one addition. This prevents an unusually deep added object from escaping the checks.

The bounds are 2 MiB of UTF-8 text per response, depth 128 with the root at 0, 100,000 values across both inputs, 500 changes, and 8 MiB of serialized change records. The last limit also bounds repeated long paths. Exceeding a limit throws a controlled error rather than returning an incomplete report that looks complete.

Comparisons use parsed JavaScript values. Formatting and object member order do not matter. `1`, `1.0`, and `1e0` represent the same number here. Unsafe integers and non-finite numbers are refused; ordinary decimals still follow JavaScript floating-point rounding, so this is not exact decimal arithmetic. Duplicate member names follow `JSON.parse` behavior, keeping the final occurrence. Preserve the original response text for inspection when those distinctions matter.

The work follows the input tree, with extra sorting cost for object keys. The recursive call stack grows with nesting depth, not with the total number of sibling fields. The parsed inputs, key lists, and change records also use memory, which is why the limits matter.

### Practise it

1. Run `npm run compare:demo` and point to the three records above. No desktop window or demo API is needed.
2. In `scripts/compare-demo.cjs`, change `fullName` back to `name`. Predict how many changes remain before running the script again.
3. Change the candidate age from string `'20'` to number `21`. Explain why the remaining age record becomes a value change rather than a type change.
4. Add `address: { city: 'Pune' }` to the original and `address: { city: 'Mumbai' }` to the candidate. Predict the path, then trace the calls through `walk`.
5. Try `[1, 2]` and `[0, 1, 2]` as the example values. Explain the three index-based changes.
6. Restore the original example values before committing so the demo remains consistent with these notes.

Checkpoint questions: What are the base and recursive cases? Why handle null and arrays before using `typeof`? Why use `Object.hasOwn`? Why is missing different from null? How does a child call return control to its parent? Why does a rename produce two observations? Why must hitting a limit produce an error instead of a partial “complete” report?

### Git checkpoint 10

Verification passed: all 257 tests, the production build, and the standalone comparison demo. Checks cover the three-change student example, nested values, arrays, whole-branch changes, escaped paths, prototype-looking keys, missing/null distinctions, number handling, and every resource limit. The algorithm is independent of the running desktop app; the interface and storage schema are unchanged in this checkpoint.

**Commit now** after completing the exercise and restoring its original values. Include `electron/json-diff.cjs`, `scripts/compare-demo.cjs`, `tests/json-diff.test.mjs`, the new package script, README, and this lesson.

Message: `feat(compare): add recursive JSON response diff engine`

Next checkpoint: select two History entries, compare their stored JSON response bodies, and display the change report in the desktop app.
