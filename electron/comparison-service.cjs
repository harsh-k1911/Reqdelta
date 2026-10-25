const { compareJsonBodies, JsonComparisonError } = require('./json-diff.cjs');

const failure = (code, message) => ({ ok: false, error: { code, message } });
const validId = (id) => Number.isSafeInteger(id) && id > 0;

function summarize(entry) {
  // Return only the labels needed by the report, not the entire decrypted request.
  return {
    id: entry.id,
    requestName: entry.requestName,
    method: entry.method,
    statusCode: entry.statusCode,
    executedAt: entry.executedAt,
  };
}

function createComparisonService(history) {
  return {
    async compare(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || !validId(input.beforeId) || !validId(input.afterId)) {
        return failure('INVALID_SELECTION', 'Choose two stored executions as Before and After.');
      }
      if (input.beforeId === input.afterId) {
        return failure('INVALID_SELECTION', 'Choose two different executions for comparison.');
      }

      try {
        const entries = [];
        for (const [label, id] of [['Before', input.beforeId], ['After', input.afterId]]) {
          // Reading a snapshot decrypts and validates it; it never executes HTTP.
          const result = await history.get({ id });
          if (!result.ok) return failure(result.error.code, `${label}: ${result.error.message}`);
          if (!result.entry.outcome.ok) {
            return failure('NO_RESPONSE', `${label} execution has no HTTP response. Choose an execution with a JSON response.`);
          }
          if (result.entry.outcome.response.format !== 'json') {
            return failure('NOT_JSON', `${label} response is not JSON. Choose two JSON responses.`);
          }
          entries.push(result.entry);
        }
        const [before, after] = entries;
        const report = compareJsonBodies(before.outcome.response.body, after.outcome.response.body);
        return { ok: true, comparison: { before: summarize(before), after: summarize(after), ...report } };
      } catch (error) {
        if (error instanceof JsonComparisonError) return failure(error.code, error.message);
        return failure('COMPARISON_FAILED', 'Could not compare these snapshots. Return to History and try again.');
      }
    },
  };
}

module.exports = { createComparisonService };
