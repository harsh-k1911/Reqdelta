import { useState } from 'react';
import Icon from './Icon.jsx';

const kinds = { added: 'Added', removed: 'Removed', typeChanged: 'Type changed', valueChanged: 'Value changed' };
const PREVIEW_LENGTH = 600;

function SourceCard({ label, source }) {
  return <div className="comparison-source"><span className="comparison-label">{label}</span>{source ? <>
    <strong>{source.requestName || 'Unsaved request'}</strong>
    <span className="comparison-source-meta">#{source.id} · {source.method} · HTTP {source.statusCode}</span>
    <time dateTime={source.executedAt}>{new Date(source.executedAt).toLocaleString()}</time>
  </> : <span className="comparison-source-empty">Choose an execution in History</span>}</div>;
}

function DiffValue({ change, side }) {
  const [expanded, setExpanded] = useState(false);
  if (!Object.hasOwn(change, side)) return <span className="comparison-missing">Missing</span>;
  const text = JSON.stringify(change[side]);
  const long = text.length > PREVIEW_LENGTH;
  return <div className="comparison-value">
    <span className="comparison-type">{change[`${side}Type`]}</span>
    <pre>{long && !expanded ? `${text.slice(0, PREVIEW_LENGTH)}…` : text}</pre>
    {long && <><span className="comparison-preview-note">{expanded ? 'Full value' : 'Preview truncated'}</span><button className="add-row-button" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? 'Show preview' : 'Show full value'}</button></>}
  </div>;
}

export default function ComparisonPanel({ pair, report, loading, error, onChoose, onCompare, onReverse }) {
  const ready = pair.before && pair.after;
  return <>
    <div className="page-heading"><div><p className="eyebrow">SEE WHAT CHANGED</p><h1>Response comparison</h1><p className="page-description">Compare two stored JSON responses, field by field.</p></div><Icon name="compare" size={28} /></div>
    <section className="comparison-panel" aria-label="Response comparison" aria-busy={loading}>
      <div className="comparison-actions"><button className="add-row-button" type="button" onClick={onChoose} disabled={loading}>Change selection</button><button className="add-row-button" type="button" onClick={onReverse} disabled={loading || !ready}>Reverse comparison</button>{!report && ready && <button className="comparison-primary" type="button" onClick={onCompare} disabled={loading}>Compare responses</button>}</div>
      <div className="comparison-sources"><SourceCard label="Before" source={report?.before || pair.before} /><SourceCard label="After" source={report?.after || pair.after} /></div>
      <p className="comparison-help">Compares JSON bodies. Status codes, headers, and timing are not compared. No request is sent.</p>
      {loading ? <p className="comparison-message" role="status">Comparing stored responses…</p> : error ? <p className="save-error comparison-message" role="alert">{error}</p> : !report ? <div className="comparison-message"><p>Choose two executions in History, then compare their JSON responses.</p><button className="add-row-button" type="button" onClick={onChoose}>Choose in History</button></div> : <>
        <div className="comparison-summary" role="status"><h2>{report.equal ? 'No JSON value differences' : `${report.counts.total} ${report.counts.total === 1 ? 'change' : 'changes'}`}</h2><p>{report.equal ? 'The parsed JSON values match. Formatting and object member order are ignored.' : 'Changes describe differences; they are not automatic breaking-change verdicts.'}</p></div>
        <dl className="comparison-counts">{Object.entries(kinds).map(([kind, label]) => <div key={kind} data-kind={kind}><dt>{label}</dt><dd>{report.counts[kind]}</dd></div>)}</dl>
        {!report.equal && <div className="comparison-table-scroll"><table className="comparison-table"><caption className="sr-only">JSON body changes</caption><thead><tr><th scope="col">Path</th><th scope="col">Change</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{report.changes.map((change) => <tr key={change.path} data-kind={change.kind}>
          <th scope="row"><code>{change.path === '' ? '(root)' : change.path}</code></th><td><span className="comparison-kind">{kinds[change.kind]}</span></td><td><DiffValue change={change} side="before" /></td><td><DiffValue change={change} side="after" /></td>
        </tr>)}</tbody></table></div>}
        <p className="comparison-help">Paths use JSON Pointer; (root) means the entire value. Arrays are compared by index. An added, removed, or changed-type branch is listed once.</p>
      </>}
    </section>
  </>;
}
