const { randomUUID } = require('node:crypto');
const { validateRequest, RequestError } = require('./request-service.cjs');

function copyRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError('INVALID_REQUEST', 'Provide a request configuration.');
  validateRequest(input);
  const copyRows = (rows = []) => rows.map(({ key, value, enabled }) => ({ id: randomUUID(), key, value, enabled }));
  const request = {
    method: input.method,
    url: input.url.trim(), // Extra query rows stay separate from the original URL.
    queryParams: copyRows(input.queryParams),
    headers: copyRows(input.headers),
    body: input.body === undefined ? { mode: 'none', text: '' } : { mode: input.body.mode, text: input.body.text },
  };
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 2 * 1024 * 1024) {
    throw new RequestError('REQUEST_TOO_LARGE', 'The request exceeds the 2 MiB configuration limit.');
  }
  return request;
}

module.exports = { copyRequest };
