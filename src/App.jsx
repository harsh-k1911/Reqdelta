import { useState } from 'react';
import Icon from './components/Icon.jsx';
import ResponsePanel from './components/ResponsePanel.jsx';

const DEMO_ORIGIN = 'http://127.0.0.1:3030';
const examples = [
  { name: 'Student JSON', path: '/students/101' },
  { name: 'Plain text', path: '/text' },
  { name: '404 response', path: '/status/404' },
];

export default function App() {
  const [url, setUrl] = useState(`${DEMO_ORIGIN}/students/101`);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  async function handleSend(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      if (!window.reqdelta) throw new Error('Open ReqDelta in the desktop app to send requests.');
      // This calls preload, which forwards a message to the main process.
      const result = await window.reqdelta.sendRequest({ method: 'GET', url });
      if (result.ok) setResponse(result.response);
      else setError(result.error.message);
    } catch (error) {
      setError(error.message || 'The desktop bridge could not complete this request.');
    } finally {
      setLoading(false);
    }
  }

  function chooseExample(path) {
    setUrl(`${DEMO_ORIGIN}${path}`);
    setError(null);
    setResponse(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="window-drag-space" />
        <div className="brand"><span className="brand-mark">Δ</span><span>ReqDelta<span className="brand-period">.</span></span></div>
        <p className="workspace-label">YOUR WORKSPACE</p>
        <div className="sidebar-active" aria-current="page"><Icon name="request" /><span>Request builder</span><span className="active-indicator" /></div>
        <div className="sidebar-note"><Icon name="layers" size={20} /><p>A little structure.<br />A lot more clarity.</p><span>Collections, history, and comparisons are coming in the next milestones.</span></div>
        <div className="sidebar-bottom"><span className="local-dot" /><span>Local workspace</span><span className="version">v0.1</span></div>
      </aside>

      <main className="workspace">
        <header className="titlebar"><div className="breadcrumb">Workspace <Icon name="chevron" size={12} /><span>Request builder</span></div><span className="desktop-badge"><span /> DESKTOP EDITION</span></header>
        <div className="workspace-content">
          <div className="page-heading"><div><p className="eyebrow">THE DETAILS MAKE THE DIFFERENCE</p><h1>A closer look at your API.</h1><p className="page-description">Send a request. Inspect the response. Understand what comes back.</p></div><span className="milestone-badge">01 <span>/ FOUNDATION</span></span></div>

          <section className="request-panel" aria-labelledby="request-heading">
            <div className="request-topline"><h2 id="request-heading"><Icon name="globe" size={17} /> New request</h2><span className="request-limit">15 second timeout</span></div>
            <form onSubmit={handleSend} onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}>
              <div className="request-bar"><span className="method-label">GET</span><input aria-label="Request URL" type="text" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://api.example.com/students" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={loading} /><button className="send-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Sending</> : <>Send request <Icon name="arrow" size={18} /></>}</button></div>
            </form>
            <div className="request-help"><span><span className="subtle-dot" /> HTTP GET · No request body</span><kbd>⌘ Enter</kbd></div>
          </section>

          <div className="examples"><span>TRY A LOCAL EXAMPLE</span>{examples.map((example) => <button type="button" key={example.path} onClick={() => chooseExample(example.path)} disabled={loading}>{example.name}<Icon name="arrow" size={13} /></button>)}<span className="demo-hint">Demo API must be running</span></div>

          {error && <div className="error-banner" role="alert"><Icon name="alert" size={20} /><div><strong>Request could not be completed</strong><p>{error}</p></div></div>}
          <ResponsePanel response={response} loading={loading} />
          <footer className="workspace-footer"><span><span className={`footer-dot ${loading ? 'busy' : ''}`} />{loading ? 'Request in progress' : error ? 'Ready to try again' : 'Ready when you are'}</span><span>API TESTING, WITH PERSPECTIVE.</span></footer>
        </div>
      </main>
    </div>
  );
}
