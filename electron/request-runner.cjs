const { performance } = require('node:perf_hooks');
const { copyRequest } = require('./request-config.cjs');
const { RequestError } = require('./request-service.cjs');

function createRequestRunner(executeRequest, history) {
  return async function runRequest(input) {
    let request;
    try {
      request = copyRequest(input);
      if (input.savedRequestId !== undefined && input.savedRequestId !== null
        && (!Number.isSafeInteger(input.savedRequestId) || input.savedRequestId <= 0)) {
        throw new RequestError('INVALID_SAVED_REQUEST', 'Choose a valid saved request.');
      }
    } catch (error) {
      return { ok: false, error: { code: error instanceof RequestError ? error.code : 'INVALID_REQUEST', message: error instanceof RequestError ? error.message : 'Provide a valid request configuration.' } };
    }

    const executedAt = new Date().toISOString();
    const startedAt = performance.now();
    let outcome;
    try {
      outcome = await executeRequest(request);
    } catch {
      outcome = { ok: false, error: { code: 'REQUEST_ERROR', message: 'The request could not be completed.' } };
    }
    const durationMs = outcome.ok ? outcome.response.durationMs : Math.round(performance.now() - startedAt);
    let stored;
    try {
      stored = await history.append({ request, outcome, savedRequestId: input.savedRequestId ?? null, durationMs, executedAt });
    } catch {
      stored = { ok: false, error: { message: 'This execution could not be saved to history.' } };
    }
    // A storage failure must not hide a response or trigger a second HTTP call.
    return { ...outcome, history: stored.ok ? { saved: true, id: stored.id } : { saved: false, message: stored.error.message } };
  };
}

module.exports = { createRequestRunner };
