import { useEffect, useState } from 'react';

export default function SaveRequestForm({ request, initialName, onSaved, onCancel, onBusyChange, disabled = false }) {
  const [collections, setCollections] = useState([]);
  const [collectionId, setCollectionId] = useState('');
  const [name, setName] = useState(initialName || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    async function load() {
      try {
        if (!window.reqdelta) throw new Error('Open the desktop app to save requests.');
        const result = await window.reqdelta.listCollections();
        if (!active) return;
        if (!result.ok) throw new Error(result.error.message);
        setCollections(result.collections);
        setCollectionId((current) => result.collections.some((item) => String(item.id) === current) ? current : String(result.collections[0]?.id || ''));
      } catch (error) {
        if (active) setError(error.message || 'Could not load collections. Try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [reload]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving || disabled || loading || !collectionId) return;
    setSaving(true);
    onBusyChange(true);
    setError('');
    try {
      const result = await window.reqdelta.createSavedRequest({ name, collectionId: Number(collectionId), request });
      if (!result.ok) throw new Error(result.error.message);
      onSaved(result.savedRequest);
    } catch (error) {
      setError(error.message || 'Could not save the request. Your draft is still available.');
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <form className="save-request-form" aria-label="Save request" onSubmit={handleSubmit}>
      <div className="save-form-heading"><h3>Save a request</h3><span>Creates a new saved copy</span></div>
      {loading ? <p className="save-help" role="status">Loading collections…</p> : (
        <>
          {collections.length === 0 && !error && <p className="save-help">Create a collection with + in the sidebar, then refresh this list.</p>}
          <div className="save-fields">
            <label>Request name<input value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="e.g. Get student" disabled={saving || disabled} autoFocus /></label>
            <label>Collection<select value={collectionId} onChange={(event) => setCollectionId(event.target.value)} disabled={saving || disabled || !collections.length}>
              {!collections.length && <option value="">No collections available</option>}
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select></label>
          </div>
        </>
      )}
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="save-form-actions">
        <button className="save-primary" type="submit" disabled={loading || saving || disabled || !collectionId}>{saving ? 'Saving…' : 'Save to collection'}</button>
        <button type="button" onClick={onCancel} disabled={saving || disabled}>Cancel save</button>
        <button type="button" onClick={() => setReload((current) => current + 1)} disabled={loading || saving || disabled}>Refresh collections</button>
      </div>
      <p className="save-help">Saves the method, URL, parameters, headers, and body. Loading it later does not send it.</p>
    </form>
  );
}
