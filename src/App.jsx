import { useState } from 'react';
import Icon from './components/Icon.jsx';
import ResponsePanel from './components/ResponsePanel.jsx';
import KeyValueEditor from './components/KeyValueEditor.jsx';
import JsonBodyEditor from './components/JsonBodyEditor.jsx';
import CollectionsPanel from './components/CollectionsPanel.jsx';
import SaveRequestForm from './components/SaveRequestForm.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ComparisonPanel from './components/ComparisonPanel.jsx';

const DEMO_ORIGIN = 'http://127.0.0.1:3030';
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const examples = [
  { name: 'Student JSON', path: '/students/101', method: 'GET' },
  { name: 'Plain text', path: '/text', method: 'GET' },
  { name: '404 response', path: '/status/404', method: 'GET' },
  { name: 'Method echo', path: '/echo' },
];

export default function App() {
  const [url, setUrl] = useState(`${DEMO_ORIGIN}/students/101`);
  const [method, setMethod] = useState('GET');
  const [queryParams, setQueryParams] = useState([]);
  const [requestHeaders, setRequestHeaders] = useState([]);
  const [requestBody, setRequestBody] = useState({ mode: 'none', text: '' });
  const [requestTab, setRequestTab] = useState('params');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  const [openingRequest, setOpeningRequest] = useState(false);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [view, setView] = useState('builder');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [activeHistory, setActiveHistory] = useState(null);
  const [historyWarning, setHistoryWarning] = useState('');
  const [comparisonPair, setComparisonPair] = useState({ before: null, after: null });
  const [comparison, setComparison] = useState(null);
  const [comparisonError, setComparisonError] = useState('');
  const [comparing, setComparing] = useState(false);
  const busy = loading || savingRequest || openingRequest || comparing;

  function changeComparisonPair(pair) {
    setComparisonPair(pair);
    setComparison(null);
    setComparisonError('');
  }

  async function handleCompare(pair = comparisonPair) {
    if (busy || !pair.before || !pair.after) return;
    setComparing(true);
    setComparisonPair(pair);
    setComparison(null);
    setComparisonError('');
    setView('compare');
    try {
      if (!window.reqdelta) throw new Error('Open the desktop app to compare stored responses.');
      const result = await window.reqdelta.compareHistory({ beforeId: pair.before.id, afterId: pair.after.id });
      if (!result.ok) throw new Error(result.error.message);
      setComparison(result.comparison);
    } catch (error) {
      setComparisonError(error.message || 'Could not compare these snapshots. Try again.');
    } finally {
      setComparing(false);
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (busy) return;
    setLoading(true);
    setActiveHistory(null);
    setHistoryWarning('');
    setWorkspaceNotice('');
    setError(null);
    setResponse(null);
    try {
      if (!window.reqdelta) throw new Error('Open ReqDelta in the desktop app to send requests.');
      // This calls preload, which forwards a message to the main process.
      const result = await window.reqdelta.sendRequest({ method, url, queryParams, headers: requestHeaders, body: requestBody, savedRequestId: selectedRequest?.id ?? null });
      if (result.ok) setResponse(result.response);
      else setError(result.error.message);
      if (result.history?.saved) setHistoryRefresh((current) => current + 1);
      else if (result.history) setHistoryWarning(`History was not saved. ${result.history.message}`);
    } catch (error) {
      setError(error.message || 'The desktop bridge could not complete this request.');
    } finally {
      setLoading(false);
    }
  }

  function chooseExample({ path, method: exampleMethod }) {
    setUrl(`${DEMO_ORIGIN}${path}`);
    if (exampleMethod) setMethod(exampleMethod);
    setQueryParams([]);
    setRequestHeaders([]);
    setRequestBody({ mode: 'none', text: '' });
    setRequestTab('params');
    setError(null);
    setResponse(null);
    setSelectedRequest(null);
    setSaveFormOpen(false);
    setWorkspaceError('');
    setWorkspaceNotice('');
    setActiveHistory(null);
    setHistoryWarning('');
  }

  function clearDisplayedResult() {
    setError(null);
    setResponse(null);
    setActiveHistory(null);
    setHistoryWarning('');
  }

  function restoreInputs(request) {
    setMethod(request.method);
    setUrl(request.url);
    setQueryParams(request.queryParams);
    setRequestHeaders(request.headers);
    setRequestBody(request.body);
    setRequestTab('params');
    setSaveFormOpen(false);
    setHistoryWarning('');
  }

  async function handleOpenRequest(id) {
    if (busy) return;
    setOpeningRequest(true);
    setWorkspaceError('');
    setWorkspaceNotice('');
    try {
      const result = await window.reqdelta.getSavedRequest({ id });
      if (!result.ok) throw new Error(result.error.message);
      const { request, ...metadata } = result.savedRequest;
      restoreInputs(request);
      setSelectedRequest(metadata);
      clearDisplayedResult();
      setView('builder');
      setWorkspaceNotice('Request loaded. Press Send request when you are ready.');
    } catch (error) {
      setWorkspaceError(error.message || 'Could not load the saved request.');
    } finally {
      setOpeningRequest(false);
    }
  }

  async function handleOpenHistory(id) {
    if (busy) return;
    setOpeningRequest(true);
    setWorkspaceError('');
    setWorkspaceNotice('');
    try {
      const result = await window.reqdelta.getHistoryEntry({ id });
      if (!result.ok) throw new Error(result.error.message);
      const { request, outcome, ...metadata } = result.entry;
      restoreInputs(request);
      setSelectedRequest(null);
      setResponse(outcome.ok ? outcome.response : null);
      setError(outcome.ok ? null : outcome.error.message);
      setActiveHistory(metadata);
      setView('builder');
    } catch (error) {
      setWorkspaceError(error.message || 'Could not open this snapshot.');
    } finally {
      setOpeningRequest(false);
    }
  }

  function handleParamsChange(params) {
    setQueryParams(params);
    clearDisplayedResult();
  }

  function handleHeadersChange(headers) {
    setRequestHeaders(headers);
    clearDisplayedResult();
  }

  function handleBodyChange(body) {
    setRequestBody(body);
    clearDisplayedResult();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="window-drag-space" />
        <div className="brand"><span className="brand-mark">Δ</span><span>ReqDelta<span className="brand-period">.</span></span></div>
        <p className="workspace-label">YOUR WORKSPACE</p>
        <button type="button" className={`sidebar-nav-item ${view === 'builder' ? 'sidebar-active' : ''}`} aria-current={view === 'builder' ? 'page' : undefined} disabled={busy} onClick={() => { setView('builder'); setWorkspaceError(''); }}><Icon name="request" /><span>Request builder</span>{view === 'builder' && <span className="active-indicator" />}</button>
        <button type="button" className={`sidebar-nav-item ${view === 'history' ? 'sidebar-active' : ''}`} aria-current={view === 'history' ? 'page' : undefined} disabled={busy} onClick={() => { setView('history'); setWorkspaceError(''); }}><Icon name="history" /><span>History</span>{view === 'history' && <span className="active-indicator" />}</button>
        <button type="button" className={`sidebar-nav-item ${view === 'compare' ? 'sidebar-active' : ''}`} aria-current={view === 'compare' ? 'page' : undefined} disabled={busy} onClick={() => setView('compare')}><Icon name="compare" /><span>Compare</span>{view === 'compare' && <span className="active-indicator" />}</button>
        <CollectionsPanel onOpenRequest={handleOpenRequest} selectedRequest={selectedRequest} refreshKey={savedRefresh} disabled={busy} />
        <div className="sidebar-bottom"><span className="local-dot" /><span>Local workspace</span><span className="version">v0.1</span></div>
      </aside>

      <main className="workspace">
        <header className="titlebar"><div className="breadcrumb">Workspace <Icon name="chevron" size={12} /><span>{{ builder: 'Request builder', history: 'History', compare: 'Compare' }[view]}</span></div><span className="desktop-badge"><span /> DESKTOP EDITION</span></header>
        <div className="workspace-content">
          {view === 'history' ? <HistoryPanel refreshKey={historyRefresh} onOpen={handleOpenHistory} disabled={busy} openError={workspaceError} pair={comparisonPair} onPick={(side, entry) => changeComparisonPair({ ...comparisonPair, [side]: entry })} onClear={() => changeComparisonPair({ before: null, after: null })} onSwap={() => changeComparisonPair({ before: comparisonPair.after, after: comparisonPair.before })} onCompare={() => handleCompare()} /> : view === 'compare' ? <ComparisonPanel pair={comparisonPair} report={comparison} loading={comparing} error={comparisonError} onChoose={() => { setView('history'); setWorkspaceError(''); }} onCompare={() => handleCompare()} onReverse={() => handleCompare({ before: comparisonPair.after, after: comparisonPair.before })} /> : <>
          <div className="page-heading"><div><p className="eyebrow">THE DETAILS MAKE THE DIFFERENCE</p><h1>A closer look at your API.</h1><p className="page-description">Send a request. Inspect the response. Understand what comes back.</p></div><span className="milestone-badge">01 <span>/ FOUNDATION</span></span></div>

          <section className="request-panel" aria-labelledby="request-heading">
            <div className="request-topline"><h2 id="request-heading"><Icon name="globe" size={17} /> {selectedRequest ? selectedRequest.name : 'New request'}</h2><div className="request-top-actions"><span className="request-limit">15 second timeout</span><button className="add-row-button" type="button" disabled={busy} onClick={() => { setSaveFormOpen((current) => !current); setWorkspaceError(''); setWorkspaceNotice(''); }}>{selectedRequest ? 'Save as new' : 'Save request'}</button></div></div>
            {selectedRequest && <p className="saved-draft-help">Editing a copy. Use Save as new to keep further changes.</p>}
            <form onSubmit={handleSend} onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}>
              <div className="request-bar">
                <select className="method-select" aria-label="HTTP method" data-method={method} value={method} disabled={busy} onChange={(event) => {
                  setMethod(event.target.value);
                  if (event.target.value === 'GET') {
                    setRequestBody((current) => ({ ...current, mode: 'none' }));
                  }
                  clearDisplayedResult();
                }}>
                  {HTTP_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                <input aria-label="Request URL" type="text" value={url} onChange={(event) => { setUrl(event.target.value); clearDisplayedResult(); }} placeholder="https://api.example.com/students" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={busy} />
                <button className="send-button" type="submit" disabled={busy}>{loading ? <><span className="spinner" /> Sending</> : <>Send request <Icon name="arrow" size={18} /></>}</button>
              </div>
              <div className="request-help"><span><span className="subtle-dot" /> HTTP {method} · {requestBody.mode === 'json' ? 'JSON body' : 'No request body'}</span><kbd>⌘ Enter</kbd></div>
              <div className="request-tabs" role="tablist" aria-label="Request options">
                <button type="button" role="tab" id="request-params-tab" aria-controls="request-params" aria-selected={requestTab === 'params'} onClick={() => setRequestTab('params')}>Params</button>
                <button type="button" role="tab" id="request-headers-tab" aria-controls="request-headers" aria-selected={requestTab === 'headers'} onClick={() => setRequestTab('headers')}>Headers</button>
                <button type="button" role="tab" id="request-body-tab" aria-controls="request-body" aria-selected={requestTab === 'body'} onClick={() => setRequestTab('body')}>Body</button>
              </div>
              {requestTab === 'params' && (
                <div role="tabpanel" id="request-params" aria-labelledby="request-params-tab">
                  <KeyValueEditor title="Query parameters" itemLabel="Parameter" rows={queryParams} onChange={handleParamsChange} disabled={busy} namePlaceholder="e.g. page" valuePlaceholder="e.g. 1" help="URL parameters are kept. Enabled rows are appended when you send." />
                </div>
              )}
              {requestTab === 'headers' && (
                <div role="tabpanel" id="request-headers" aria-labelledby="request-headers-tab">
                  <KeyValueEditor title="Request headers" itemLabel="Header" rows={requestHeaders} onChange={handleHeadersChange} disabled={busy} namePlaceholder="e.g. Accept" valuePlaceholder="e.g. application/json" help="Enabled headers are sent with this request. Header names are case-insensitive." />
                </div>
              )}
              {requestTab === 'body' && (
                <div role="tabpanel" id="request-body" aria-labelledby="request-body-tab">
                  <JsonBodyEditor body={requestBody} method={method} onChange={handleBodyChange} disabled={busy} />
                </div>
              )}
            </form>
            {saveFormOpen && <SaveRequestForm request={{ method, url, queryParams, headers: requestHeaders, body: requestBody }} initialName={selectedRequest?.name} disabled={loading || openingRequest} onBusyChange={setSavingRequest} onCancel={() => setSaveFormOpen(false)} onSaved={(savedRequest) => {
              setSelectedRequest(savedRequest);
              setSavedRefresh((current) => current + 1);
              setSaveFormOpen(false);
              setWorkspaceNotice('Request saved to your collection.');
            }} />}
            {openingRequest && <p className="save-help" role="status">Opening saved request…</p>}
            {workspaceError && <p className="save-error" role="alert">{workspaceError}</p>}
            {workspaceNotice && <p className="save-help" role="status">{workspaceNotice}</p>}
          </section>

          <div className="examples"><span>TRY A LOCAL EXAMPLE</span>{examples.map((example) => <button type="button" key={example.path} onClick={() => chooseExample(example)} disabled={busy}>{example.name}<Icon name="arrow" size={13} /></button>)}<span className="demo-hint">Demo API must be running</span></div>

          {activeHistory && <div className="history-source" role="status"><Icon name="history" size={16} /><div><strong>Saved execution #{activeHistory.id}</strong><span>{new Date(activeHistory.executedAt).toLocaleString()} · Stored snapshot. Press Send request to run it again.</span></div></div>}
          {historyWarning && <div className="history-warning" role="alert">{historyWarning}</div>}
          {error && <div className="error-banner" role="alert"><Icon name="alert" size={20} /><div><strong>{activeHistory ? 'Saved execution failed' : 'Request could not be completed'}</strong><p>{error}</p></div></div>}
          <ResponsePanel response={response} loading={loading} failure={Boolean(error)} />
          <footer className="workspace-footer"><span><span className={`footer-dot ${loading ? 'busy' : ''}`} />{loading ? 'Request in progress' : error ? 'Ready to try again' : 'Ready when you are'}</span><span>API TESTING, WITH PERSPECTIVE.</span></footer>
          </>}
        </div>
      </main>
    </div>
  );
}
