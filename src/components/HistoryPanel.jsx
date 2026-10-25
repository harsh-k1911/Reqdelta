import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

export default function HistoryPanel({ refreshKey, onOpen, disabled, openError, pair, onPick, onClear, onSwap, onCompare }) {
  const [entries, setEntries] = useState([]);
  const [beforeId, setBeforeId] = useState(null);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  function changePage(cursor) {
    setLoading(true);
    setBeforeId(cursor);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    async function load() {
      try {
        if (!window.reqdelta) throw new Error('Open the desktop app to use history.');
        const result = await window.reqdelta.listHistory({ beforeId });
        if (!active) return;
        if (!result.ok) throw new Error(result.error.message);
        setEntries(result.entries);
        setNextBeforeId(result.nextBeforeId);
      } catch (error) {
        if (active) setError(error.message || 'Could not load history. Try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [beforeId, refreshKey, reload]);

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">A RECORD OF WHAT CAME BACK</p><h1>Execution history</h1><p className="page-description">Reopen a past response without sending another request.</p></div><Icon name="history" size={28} /></div>
      <section className="history-panel" aria-label="Execution history" aria-busy={loading || disabled}>
        <div className="history-comparison" aria-label="Comparison selection">
          <h2>Compare stored responses</h2>
          <p className="comparison-help">Choose a Before and an After execution below. JSON is checked when you compare; network failures have no response to select.</p>
          <div className="history-comparison-pair">{['before', 'after'].map((side) => <div key={side}><span className="comparison-label">{side === 'before' ? 'Before' : 'After'}</span><span>{pair[side] ? `#${pair[side].id} · ${pair[side].requestName || 'Unsaved request'} · ${pair[side].method}` : 'Choose an execution'}</span></div>)}</div>
          <div className="comparison-actions"><button className="comparison-primary" type="button" disabled={disabled || !pair.before || !pair.after} onClick={onCompare}>Compare responses <Icon name="arrow" size={14} /></button><button className="add-row-button" type="button" disabled={disabled || !pair.before || !pair.after} onClick={onSwap}>Swap selection</button><button className="add-row-button" type="button" disabled={disabled || (!pair.before && !pair.after)} onClick={onClear}>Clear selection</button></div>
        </div>
        <div className="history-topline"><h2>Recent executions</h2><button className="add-row-button" type="button" onClick={() => { changePage(null); setReload((current) => current + 1); }} disabled={loading || disabled}>Refresh history</button></div>
        <p className="history-retention">Keeps the newest 100 executions within 50 MiB of encrypted snapshot data. Lists 20 at a time.</p>
        {openError && <p className="save-error" role="alert">{openError}</p>}
        {loading ? <p className="history-message" role="status">Loading history…</p> : error ? <div className="history-message"><p className="save-error" role="alert">{error}</p><button type="button" className="add-row-button" onClick={() => setReload((current) => current + 1)}>Retry history</button></div> : entries.length === 0 ? <p className="history-message">{beforeId ? 'No older executions are available.' : 'No executions yet. Send a request to start your history.'}</p> : (
          <div className="history-table-scroll"><table className="history-table"><caption className="sr-only">Recorded request executions</caption><thead><tr><th scope="col">Before</th><th scope="col">After</th><th scope="col">Request</th><th scope="col">Result</th><th scope="col">Duration</th><th scope="col">Started</th><th scope="col"><span className="sr-only">Open snapshot</span></th></tr></thead><tbody>
            {entries.map((entry) => <tr key={entry.id}>
              {['before', 'after'].map((side) => <td key={side} className="history-pick"><input type="radio" name={`comparison-${side}`} aria-label={`Use history entry ${entry.id} as ${side}`} checked={pair[side]?.id === entry.id} disabled={disabled || entry.statusCode === null || pair[side === 'before' ? 'after' : 'before']?.id === entry.id} onChange={() => onPick(side, entry)} /></td>)}
              <td><span className="history-request-name">{entry.requestName || 'Unsaved request'}</span><span className="history-method">{entry.method} · #{entry.id}</span></td>
              <td><span className={entry.statusCode === null || entry.statusCode >= 400 ? 'history-result history-result-error' : 'history-result'}>{entry.statusCode === null ? entry.errorCode.replaceAll('_', ' ') : `HTTP ${entry.statusCode}`}</span></td>
              <td className="history-duration">{entry.durationMs} ms</td>
              <td><time dateTime={entry.executedAt}>{new Date(entry.executedAt).toLocaleString()}</time></td>
              <td><button className="add-row-button" type="button" aria-label={`Open history entry ${entry.id}`} disabled={disabled} onClick={() => onOpen(entry.id)}>Open <Icon name="arrow" size={12} /></button></td>
            </tr>)}
          </tbody></table></div>
        )}
        <div className="history-pagination"><button className="add-row-button" type="button" disabled={loading || disabled || beforeId === null} onClick={() => changePage(null)}>Newest executions</button><button className="add-row-button" type="button" disabled={loading || disabled || !nextBeforeId || Boolean(error)} onClick={() => changePage(nextBeforeId)}>Older executions</button></div>
      </section>
    </>
  );
}
