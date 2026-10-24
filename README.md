# ReqDelta

A macOS desktop API testing and JSON response comparison project.

**Current milestone: GET, POST, PUT, and DELETE requests with a query parameter editor.** Custom headers, request bodies, collections, SQLite history, and JSON comparison are planned next; they are not implemented yet. This is source code you can run, not a packaged `.app` installer yet.

## Run the application

Use a recent Node.js version compatible with Vite (22.12 or later). The initial setup was verified with Node 26.7 on Apple silicon macOS. Electron includes its own Node runtime for the desktop application.

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

Press **Send request**. The default URL retrieves a student from the local demo API. You can enter an HTTP/HTTPS URL, including query parameters in the URL, and select GET, POST, PUT, or DELETE. These requests are real network calls. Request bodies and custom headers are not supported yet, so endpoints that require them can return an HTTP error for now.

To practise choosing methods, click **Method echo**, select a method, and send. The local `/echo` endpoint reports the method it received without changing any data. The other example buttons reset the method to GET.

Use **Add parameter** for extra query parameters. Enter a name and value, disable a row with its checkbox, or remove it with ×. Enabled rows are appended to any parameters already in the URL; the URL input itself is not rewritten. Repeated names are preserved. Completely blank rows are ignored, named empty values are sent, and an enabled row with a value but no name shows an error. Example buttons clear extra parameter rows.

For a quick test, select **Student JSON**, add `version` with the value `2`, and send. The demo student should have `fullName` and an age stored as text. Or use **Method echo**, add `search` with a value such as `tea & coffee`, and inspect the returned `queryParams` array.

React changes update while the app is running. Restart `npm run dev` after changing Electron's main process, preload, or request service. Restart `npm run demo` after changing the demo API. Use Control+C in the relevant terminal to stop either process, then run its command again. On macOS, closing the last window leaves the app running; use Command+Q to quit it.

## What works now

- A real Electron desktop window with a React interface.
- GET, POST, PUT, and DELETE requests through the main process and an isolated preload bridge.
- A method selector with main-process validation of supported methods.
- A query parameter editor with add/remove, enabled rows, duplicate names, and automatic URL encoding.
- Response status, total request duration, body size, and response headers.
- Pretty/raw JSON and plain-text viewing. Response HTML is displayed as text.
- Invalid URL, connection failure, 15-second timeout, and a 2 MiB response viewing limit.
- Inspectable 4xx/5xx HTTP responses: these do not become connection errors.
- Command+Enter to send a request from the request form.
- An offline demo API and automated request/desktop checks.

No request or response data is saved by this milestone. Avoid real credentials during these first exercises; credential handling has not been added.

## Local demo endpoints

| URL | Purpose |
| --- | --- |
| `http://127.0.0.1:3030/students/101` | Original student JSON |
| `http://127.0.0.1:3030/students/101?version=2` | Renamed field and changed type, ready for the later comparison feature |
| `http://127.0.0.1:3030/text` | Non-JSON response |
| `http://127.0.0.1:3030/status/404` | An HTTP error response with a body |
| `http://127.0.0.1:3030/slow` | Takes 20 seconds, so the client times out first |
| `http://127.0.0.1:3030/echo` | Reports the received HTTP method and query parameters, preserving repeated names |

The other demo endpoints accept GET only. Sending a different supported method to them returns `405 Method Not Allowed` with an `Allow: GET` response header. The `/echo` endpoint demonstrates the method sent; it does not create, replace, or delete a student.

If the default request fails, check that `npm run demo` is running. If port 3030 is already occupied, stop that process or change the demo server port and the URL you enter. Port 5173 is reserved for the development interface.

If `/echo` returns the older 404 response, or its response is missing `queryParams`, restart the demo API. Editing a server file does not replace the code already loaded by its running process.

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

The desktop test opens and closes an Electron window, starts a temporary local API, and checks the actual UI-to-main-process request path. It checks query parameter editing and encoding, the four methods, response/error behavior, and the smaller window layout. Screenshots are saved under `test-results/`. No external API is needed.

## Code map

| File | Responsibility |
| --- | --- |
| `electron/main.cjs` | Desktop window, local interface loading, trusted IPC handler |
| `electron/preload.cjs` | Exposes the single `window.reqdelta.sendRequest()` operation |
| `electron/request-service.cjs` | Validates requests, fetches responses, limits size/time, returns results |
| `src/App.jsx` | Request form, loading/error state, calling the bridge |
| `src/components/ResponsePanel.jsx` | Response body, headers, and pretty/raw viewing |
| `src/components/QueryParamsEditor.jsx` | Additional name/value rows with enable, add, and remove controls |
| `src/components/Icon.jsx` | Small inline interface icons |
| `src/styles.css` | Interface layout and appearance |
| `scripts/dev.cjs` | Starts Vite and Electron together |
| `scripts/demo-server.cjs` | Local API for learning and demonstrations |
| `tests/request-service.test.mjs` | Request validation and response/error tests |
| `scripts/smoke.cjs` | Checks the running desktop application |
| `vite.config.mjs` | React build/dev setup and interface content policy |

Application logic in Electron uses CommonJS (`require`, `module.exports`). React source uses ES module imports processed by Vite. There is no TypeScript source or TypeScript configuration.

Read [LEARNING.md](./LEARNING.md) for the first lesson, exercises, and the remaining work plan.
