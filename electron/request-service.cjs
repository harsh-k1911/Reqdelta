const { performance } = require('node:perf_hooks');
const { validateHeaderName, validateHeaderValue } = require('node:http');

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const MANAGED_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade', 'expect', 'proxy-connection']);

class RequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function buildHeaders(rows = []) {
  if (!Array.isArray(rows)) {
    throw new RequestError('INVALID_HEADERS', 'Request headers must be a list of name/value rows.');
  }
  const headers = new Headers();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row.key !== 'string' || typeof row.value !== 'string' || typeof row.enabled !== 'boolean') {
      throw new RequestError('INVALID_HEADERS', `Header ${index + 1} has an invalid name, value, or enabled flag.`);
    }
    if (!row.enabled || (row.key === '' && row.value === '')) continue;
    const name = row.key.trim();
    if (!name) {
      throw new RequestError('INVALID_HEADERS', `Header ${index + 1} needs a name. Enter one or disable the row.`);
    }
    try {
      validateHeaderName(name);
      validateHeaderValue(name, row.value);
    } catch {
      // Native validation errors can include the value; don't expose a credential.
      throw new RequestError('INVALID_HEADERS', `Header ${index + 1} has an invalid name or value. Use a valid header name and a value without line breaks or unsupported characters.`);
    }
    if (MANAGED_HEADERS.has(name.toLowerCase())) {
      throw new RequestError('INVALID_HEADERS', `The HTTP client manages the ${name} header automatically.`);
    }
    if (headers.has(name)) {
      throw new RequestError('INVALID_HEADERS', `Header ${name} is repeated. Keep one enabled row for each header name.`);
    }
    headers.set(name, row.value);
  }
  return headers;
}

function buildRequestBody(body, method, headers) {
  if (body === undefined) return undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !['none', 'json'].includes(body.mode) || typeof body.text !== 'string') {
    throw new RequestError('INVALID_BODY', 'Choose None or JSON for the request body and provide body text.');
  }
  if (body.mode === 'none') return undefined;
  if (method === 'GET') {
    throw new RequestError('INVALID_BODY', 'GET requests cannot send a body. Choose None or use another method.');
  }
  if (Buffer.byteLength(body.text, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new RequestError('BODY_TOO_LARGE', 'The request body exceeds the 1 MiB limit.');
  }
  if (!body.text.trim()) {
    throw new RequestError('INVALID_BODY', 'Enter a JSON body or choose None.');
  }
  try {
    JSON.parse(body.text);
  } catch {
    // Parser errors may repeat request data, so return a helpful generic message.
    throw new RequestError('INVALID_BODY', 'The request body is not valid JSON. Check double quotes, commas, and brackets.');
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  // Validate by parsing, then send the original text without serializing it again.
  return body.text;
}

function validateRequest(request) {
  if (!request || typeof request.url !== 'string' || !request.url.trim()) {
    throw new RequestError('INVALID_URL', 'Enter an API URL beginning with http:// or https://.');
  }
  let url;
  try {
    url = new URL(request.url.trim());
  } catch {
    throw new RequestError('INVALID_URL', 'Use a complete URL, for example http://localhost:3030/students/101.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new RequestError('INVALID_URL', 'Only HTTP and HTTPS URLs are supported.');
  }
  if (url.username || url.password) {
    throw new RequestError('INVALID_URL', 'URLs containing usernames or passwords are not supported.');
  }
  if (!SUPPORTED_METHODS.includes(request.method)) {
    throw new RequestError('INVALID_METHOD', 'Choose GET, POST, PUT, or DELETE.');
  }

  const queryParams = request.queryParams === undefined ? [] : request.queryParams;
  if (!Array.isArray(queryParams)) {
    throw new RequestError('INVALID_PARAMS', 'Query parameters must be a list of name/value rows.');
  }
  for (const [index, param] of queryParams.entries()) {
    if (!param || typeof param.key !== 'string' || typeof param.value !== 'string' || typeof param.enabled !== 'boolean') {
      throw new RequestError('INVALID_PARAMS', `Query parameter ${index + 1} has an invalid name, value, or enabled flag.`);
    }
    if (!param.enabled || (param.key === '' && param.value === '')) continue;
    if (!param.key.trim()) {
      throw new RequestError('INVALID_PARAMS', `Query parameter ${index + 1} needs a name. Enter one or disable the row.`);
    }
    // append preserves repeated names and safely encodes spaces, &, +, and Unicode.
    url.searchParams.append(param.key, param.value);
  }
  const headers = buildHeaders(request.headers);
  const body = buildRequestBody(request.body, request.method, headers);
  return { url: url.href, method: request.method, headers, body };
}

async function readBody(response, controller, maxBytes) {
  if (!response.body) return { body: '', sizeBytes: 0 };
  const reader = response.body.getReader();
  const chunks = [];
  let sizeBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sizeBytes += value.byteLength;
      if (sizeBytes > maxBytes) {
        controller.abort();
        throw new RequestError('RESPONSE_TOO_LARGE', 'Response exceeds the 2 MB viewing limit. Try a smaller endpoint.');
      }
      chunks.push(Buffer.from(value));
    }
    return { body: Buffer.concat(chunks).toString('utf8'), sizeBytes };
  } finally {
    reader.releaseLock();
  }
}

async function executeRequest(request, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  let timer;
  try {
    const { url, method, headers, body: requestBody } = validateRequest(request);
    const startedAt = performance.now();
    // The timeout covers downloading the body as well as receiving headers.
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { method, headers, body: requestBody, signal: controller.signal, redirect: 'follow' });
    const { body, sizeBytes } = await readBody(response, controller, maxBytes);
    let format = 'text';
    try {
      JSON.parse(body);
      format = 'json';
    } catch {
      // A text/HTML response or invalid JSON is still useful to inspect.
    }
    return {
      ok: true,
      response: {
        method,
        url: response.url || url,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers, ([name, value]) => ({ name, value })),
        body,
        format,
        sizeBytes,
        durationMs: Math.round(performance.now() - startedAt),
      },
    };
  } catch (error) {
    if (error instanceof RequestError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (controller.signal.aborted) {
      return { ok: false, error: { code: 'TIMEOUT', message: `The server did not finish responding within ${timeoutMs / 1000} seconds.` } };
    }
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Could not reach the API. Check the URL, your connection, and whether the server is running.' } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { executeRequest, validateRequest, RequestError };
