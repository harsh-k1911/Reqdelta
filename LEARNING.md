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
3. The UI calls `window.reqdelta.sendRequest({ method, url })` and awaits the result. The selected method starts as GET. `await` pauses this function until its promise settles; it does not freeze the whole application.
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
2. `handleSend` now passes `{ method, url }`. That is object shorthand for `{ method: method, url: url }`.
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

Next separate checkpoint: add a query parameter editor.
