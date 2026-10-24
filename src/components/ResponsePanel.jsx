import { useState } from 'react';
import Icon from './Icon.jsx';

function formatSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ResponsePanel({ response, loading }) {
  const [tab, setTab] = useState('body');
  const [pretty, setPretty] = useState(true);
  const displayedBody = response?.format === 'json' && pretty
    ? JSON.stringify(JSON.parse(response.body), null, 2)
    : response?.body;

  return (
    <section className="response-panel" aria-labelledby="response-heading" aria-busy={loading}>
      <div className="panel-heading">
        <div className="section-label"><span className="status-dot" /><h2 id="response-heading">Response</h2></div>
        {response ? (
          <div className="response-metrics" aria-live="polite">
            <span className={`http-status ${response.status >= 400 ? 'http-error' : ''}`}>{response.status} {response.statusText}</span>
            <span>{response.durationMs} ms</span><span>{formatSize(response.sizeBytes)}</span>
          </div>
        ) : <span className="muted small">{loading ? 'Connecting to your API…' : 'No response yet'}</span>}
      </div>

      {!response ? (
        <div className="empty-response">
          <div className={`response-illustration ${loading ? 'is-loading' : ''}`}><Icon name="terminal" size={33} /></div>
          <h3>{loading ? 'A request is on its way' : 'Make your first connection.'}</h3>
          <p>{loading ? 'Waiting for the server to return a response.' : 'Send a request to see its status, headers, and body here.'}</p>
          <span className="empty-caption">LESS GUESSWORK. MORE CLARITY.</span>
        </div>
      ) : (
        <>
          <div className="response-toolbar">
            <div className="response-tabs" role="tablist" aria-label="Response details">
              <button type="button" role="tab" id="body-tab" aria-controls="response-body" aria-selected={tab === 'body'} onClick={() => setTab('body')}>Body</button>
              <button type="button" role="tab" id="headers-tab" aria-controls="response-headers" aria-selected={tab === 'headers'} onClick={() => setTab('headers')}>Headers <span className="count">{response.headers.length}</span></button>
            </div>
            {tab === 'body' && <div className="body-controls">
              <span className="format-label">{response.format === 'json' ? 'JSON' : 'TEXT'}</span>
              {response.format === 'json' && <button type="button" className="pretty-toggle" aria-pressed={pretty} onClick={() => setPretty(!pretty)}>{pretty ? 'Pretty' : 'Raw'}</button>}
            </div>}
          </div>
          {tab === 'body' ? (
            <div className="response-content" role="tabpanel" id="response-body" aria-labelledby="body-tab" tabIndex={0}>
              {displayedBody ? <pre>{displayedBody}</pre> : <p className="muted">This response has an empty body.</p>}
            </div>
          ) : (
            <div className="response-content" role="tabpanel" id="response-headers" aria-labelledby="headers-tab" tabIndex={0}>
              <table className="headers-table"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>
                {response.headers.map(({ name, value }) => <tr key={name}><td>{name}</td><td>{value}</td></tr>)}
              </tbody></table>
            </div>
          )}
          <div className="response-bottom"><span>{response.format === 'json' ? 'Valid JSON' : 'Text response'}</span><span title={response.url}>{response.url}</span></div>
        </>
      )}
    </section>
  );
}
