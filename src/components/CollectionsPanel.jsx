import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function CollectionsPanel({ onOpenRequest, selectedRequest, refreshKey = 0, disabled = false }) {
  const [collections, setCollections] = useState([]);
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [notice, setNotice] = useState('');
  const newButton = useRef(null);
  const [expandedId, setExpandedId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsStatus, setRequestsStatus] = useState('idle');
  const [requestsForId, setRequestsForId] = useState(null);
  const [requestsError, setRequestsError] = useState('');
  const [requestsRetry, setRequestsRetry] = useState(0);
  const selectedCollectionId = selectedRequest?.collectionId;
  const visibleRequestsStatus = requestsForId === expandedId ? requestsStatus : 'loading';

  useEffect(() => {
    if (selectedCollectionId) setExpandedId(selectedCollectionId);
  }, [selectedRequest?.id, selectedCollectionId]);

  useEffect(() => {
    if (expandedId === null) return;
    let active = true;
    setRequests([]);
    setRequestsForId(expandedId);
    setRequestsStatus('loading');
    setRequestsError('');
    async function load() {
      try {
        const result = await window.reqdelta.listSavedRequests({ collectionId: expandedId });
        if (!active) return;
        if (!result.ok) throw new Error(result.error.message);
        setRequests(result.savedRequests);
        setRequestsStatus('ready');
      } catch (error) {
        if (!active) return;
        setRequestsError(error.message || 'Could not load saved requests. Try again.');
        setRequestsStatus('error');
      }
    }
    load();
    return () => { active = false; };
  }, [expandedId, refreshKey, requestsRetry]);

  useEffect(() => {
    let active = true;
    async function loadCollections() {
      setStatus('loading');
      setLoadError('');
      try {
        if (!window.reqdelta) throw new Error('Open the desktop app to use collections.');
        const result = await window.reqdelta.listCollections();
        if (!active) return;
        if (!result.ok) throw new Error(result.error.message);
        setCollections(result.collections);
        setStatus('ready');
      } catch (error) {
        if (!active) return;
        setLoadError(error.message || 'Could not load collections. Try again.');
        setStatus('error');
      }
    }
    loadCollections();
    // Ignore a pending reply if this component unmounts or a retry replaces it.
    return () => { active = false; };
  }, [reload]);

  function closeForm() {
    setCreating(false);
    setName('');
    setCreateError('');
    requestAnimationFrame(() => newButton.current?.focus());
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setCreateError('');
    try {
      const result = await window.reqdelta.createCollection({ name });
      if (!result.ok) throw new Error(result.error.message);
      // Add only the record SQLite actually returned, including its permanent ID.
      setCollections((current) => [result.collection, ...current]);
      setNotice('Collection created.');
      closeForm();
    } catch (error) {
      setCreateError(error.message || 'Could not create the collection. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="collections-panel" aria-labelledby="collections-heading">
      <div className="collections-heading">
        <h2 id="collections-heading">COLLECTIONS {status === 'ready' && <span className="count">{collections.length}</span>}</h2>
        <button ref={newButton} className="new-collection" type="button" aria-label="New collection" title="New collection" disabled={status !== 'ready' || creating} onClick={() => {
          setCreating(true);
          setNotice('');
        }}><Icon name="plus" size={15} /></button>
      </div>

      {creating && (
        <form className="collection-form" onSubmit={handleCreate}>
          <label htmlFor="collection-name">Collection name</label>
          <input id="collection-name" value={name} onChange={(event) => { setName(event.target.value); setCreateError(''); }} placeholder="e.g. Student API" autoFocus disabled={saving} aria-invalid={Boolean(createError)} aria-describedby={`collection-name-help${createError ? ' collection-create-error' : ''}`} />
          <span id="collection-name-help" className="collection-help">1–100 characters</span>
          {createError && <p id="collection-create-error" className="collection-error" role="alert">{createError}</p>}
          <div className="collection-actions">
            <button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create collection'}</button>
            <button type="button" onClick={closeForm} disabled={saving}>Cancel</button>
          </div>
        </form>
      )}

      {status === 'loading' && <p className="collection-message" role="status">Loading collections…</p>}
      {status === 'error' && <div className="collection-load-error"><p className="collection-error" role="alert">{loadError}</p><button type="button" onClick={() => setReload((current) => current + 1)}>Retry collections</button></div>}
      {status === 'ready' && (collections.length === 0
        ? <p className="collection-message">No collections yet. Use + to create your first group.</p>
        : <ul className="collection-list" aria-label="Collections">{collections.map((collection) => (
          <li key={collection.id}>
            <button className="collection-toggle" type="button" aria-expanded={expandedId === collection.id} aria-controls={`collection-${collection.id}-requests`} disabled={disabled} onClick={() => setExpandedId((current) => current === collection.id ? null : collection.id)}>
              <Icon name="chevron" size={11} /><Icon name="layers" size={15} /><span title={collection.name}>{collection.name}</span>
            </button>
            {expandedId === collection.id && <div id={`collection-${collection.id}-requests`}>
              {visibleRequestsStatus === 'loading' && <p className="collection-message" role="status">Loading requests…</p>}
              {visibleRequestsStatus === 'error' && <div className="collection-load-error"><p className="collection-error" role="alert">{requestsError}</p><button type="button" onClick={() => setRequestsRetry((current) => current + 1)}>Retry saved requests</button></div>}
              {visibleRequestsStatus === 'ready' && (requests.length === 0 ? <p className="collection-message">No saved requests yet.</p> : <ul className="saved-request-list" aria-label={`Requests in ${collection.name}`}>
                {requests.map((request) => <li key={request.id}><button type="button" aria-current={selectedRequest?.id === request.id ? 'true' : undefined} disabled={disabled} onClick={() => onOpenRequest(request.id)}><span className="saved-method" data-method={request.method}>{request.method}</span><span>{request.name}</span></button></li>)}
              </ul>)}
            </div>}
          </li>
        ))}</ul>)}
      <p className="collection-notice" role="status">{notice}</p>
      <p className="collections-hint">Collections stay on this Mac.<br />Open a group to find its requests.</p>
    </section>
  );
}
