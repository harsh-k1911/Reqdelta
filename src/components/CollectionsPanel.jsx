import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function CollectionsPanel() {
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
          <li key={collection.id}><Icon name="layers" size={15} /><span title={collection.name}>{collection.name}</span></li>
        ))}</ul>)}
      <p className="collection-notice" role="status">{notice}</p>
      <p className="collections-hint">Collections stay on this Mac.<br />Saving requests comes next.</p>
    </section>
  );
}
