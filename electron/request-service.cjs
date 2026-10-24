const { performance } = require('node:perf_hooks');

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

class RequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
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
  if (request.method !== 'GET') {
    throw new RequestError('INVALID_METHOD', 'This milestone supports GET requests.');
  }
  return url.href;
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
    const url = validateRequest(request);
    const startedAt = performance.now();
    // The timeout covers downloading the body as well as receiving headers.
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
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
        method: 'GET',
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

module.exports = { executeRequest };
