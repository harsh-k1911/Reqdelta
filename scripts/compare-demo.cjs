const { compareJsonBodies } = require('../electron/json-diff.cjs');

// Made-up example values. This exercise does not open the workspace or an API.
const before = { id: 101, name: 'Rahul', age: 20, active: true };
const after = { id: 101, fullName: 'Rahul', age: '20', active: true };

try {
  const report = compareJsonBodies(JSON.stringify(before), JSON.stringify(after));
  console.log('Comparing the original student with version 2...');
  console.table(report.changes.map((change) => ({
    path: change.path || '(root)',
    change: change.kind,
    before: Object.hasOwn(change, 'before') ? JSON.stringify(change.before) : '(missing)',
    after: Object.hasOwn(change, 'after') ? JSON.stringify(change.after) : '(missing)',
  })));
  console.log(`${report.counts.total} changes: ${report.counts.added} added, ${report.counts.removed} removed, ${report.counts.typeChanged} type changed, ${report.counts.valueChanged} value changed.`);
  console.log('Changes describe differences; they are not automatic breaking-change verdicts.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
