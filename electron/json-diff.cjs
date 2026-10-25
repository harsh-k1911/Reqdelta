const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 128;
const MAX_NODES = 100_000;
const MAX_CHANGES = 500;
const MAX_REPORT_BYTES = 8 * 1024 * 1024;
const MISSING = Symbol('missing JSON member');

class JsonComparisonError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function jsonType(value) {
  if (value === MISSING) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function parseBody(text, label) {
  if (typeof text !== 'string') throw new JsonComparisonError('INVALID_JSON', `${label} response must contain JSON text.`);
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new JsonComparisonError('COMPARISON_LIMIT', `${label} response exceeds the 2 MiB comparison limit.`);
  try {
    return JSON.parse(text);
  } catch {
    // Native parser errors may repeat response data; keep it out of errors.
    throw new JsonComparisonError('INVALID_JSON', `${label} response is not valid JSON.`);
  }
}

function pointerChild(path, key) {
  // JSON Pointer escapes ~ before / so an actual key cannot change the path.
  return `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function compareJsonBodies(beforeBody, afterBody) {
  const before = parseBody(beforeBody, 'First');
  const after = parseBody(afterBody, 'Second');
  let nodes = 0;

  function inspect(value, depth) {
    nodes += 1;
    if (nodes > MAX_NODES) throw new JsonComparisonError('COMPARISON_LIMIT', 'The two responses exceed the 100,000-value comparison limit.');
    if (depth > MAX_DEPTH) throw new JsonComparisonError('COMPARISON_LIMIT', 'JSON nesting exceeds the 128-level comparison limit.');
    const type = jsonType(value);
    if (type === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
      throw new JsonComparisonError('UNSUPPORTED_NUMBER', 'A response contains a number outside the supported finite, safe-integer comparison range.');
    }
    if (type === 'array') {
      for (const item of value) inspect(item, depth + 1);
    } else if (type === 'object') {
      for (const key of Object.keys(value)) inspect(value[key], depth + 1);
    }
  }

  // Inspect whole inputs, including subtrees later reported as one addition.
  inspect(before, 0);
  inspect(after, 0);
  const changes = [];
  const counts = { added: 0, removed: 0, typeChanged: 0, valueChanged: 0, total: 0 };
  let reportBytes = 0;

  function record(kind, path, oldValue, newValue) {
    if (changes.length >= MAX_CHANGES) throw new JsonComparisonError('COMPARISON_LIMIT', 'The comparison exceeds the 500-change limit.');
    const change = { kind, path, beforeType: jsonType(oldValue), afterType: jsonType(newValue) };
    if (oldValue !== MISSING) change.before = oldValue;
    if (newValue !== MISSING) change.after = newValue;
    reportBytes += Buffer.byteLength(JSON.stringify(change), 'utf8');
    if (reportBytes > MAX_REPORT_BYTES) throw new JsonComparisonError('COMPARISON_LIMIT', 'The comparison exceeds the 8 MiB report limit.');
    changes.push(change);
    counts[kind] += 1;
    counts.total += 1;
  }

  function walk(oldValue, newValue, path) {
    if (oldValue === MISSING) return record('added', path, oldValue, newValue);
    if (newValue === MISSING) return record('removed', path, oldValue, newValue);
    const type = jsonType(oldValue);
    if (type !== jsonType(newValue)) return record('typeChanged', path, oldValue, newValue);

    if (type === 'object') {
      const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].sort();
      for (const key of keys) {
        walk(Object.hasOwn(oldValue, key) ? oldValue[key] : MISSING,
          Object.hasOwn(newValue, key) ? newValue[key] : MISSING, pointerChild(path, key));
      }
    } else if (type === 'array') {
      for (let index = 0; index < Math.max(oldValue.length, newValue.length); index += 1) {
        walk(index < oldValue.length ? oldValue[index] : MISSING,
          index < newValue.length ? newValue[index] : MISSING, pointerChild(path, index));
      }
    } else if (oldValue !== newValue) {
      record('valueChanged', path, oldValue, newValue);
    }
  }

  walk(before, after, '');
  return { equal: changes.length === 0, counts, changes };
}

module.exports = { compareJsonBodies, JsonComparisonError };
