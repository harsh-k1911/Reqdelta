export default function QueryParamsEditor({ params, onChange, disabled }) {
  const activeCount = params.filter((param) => param.enabled && param.key.trim()).length;

  function updateParam(id, changes) {
    // Replace the changed row rather than mutating React's existing state.
    onChange(params.map((param) => param.id === id ? { ...param, ...changes } : param));
  }

  function addParam() {
    onChange([...params, { id: crypto.randomUUID(), enabled: true, key: '', value: '' }]);
  }

  return (
    <section className="query-editor" aria-labelledby="query-heading">
      <div className="query-heading">
        <h3 id="query-heading">Query parameters <span className="count">{activeCount}</span></h3>
        <button type="button" className="add-param-button" disabled={disabled} onClick={addParam}>+ Add parameter</button>
      </div>
      <div className="query-table-scroll">
        <table className="query-table" aria-describedby="query-help">
          <thead><tr><th scope="col">Use</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {params.length === 0 && <tr><td colSpan={4} className="query-empty">No additional parameters. Add a row to include one.</td></tr>}
            {params.map((param, index) => (
              <tr key={param.id} className={param.enabled ? '' : 'query-row-disabled'}>
                <td><input type="checkbox" aria-label={`Enable parameter ${index + 1}`} checked={param.enabled} disabled={disabled} onChange={(event) => updateParam(param.id, { enabled: event.target.checked })} /></td>
                <td><input type="text" aria-label={`Parameter ${index + 1} name`} value={param.key} placeholder="e.g. page" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled} onChange={(event) => updateParam(param.id, { key: event.target.value })} /></td>
                <td><input type="text" aria-label={`Parameter ${index + 1} value`} value={param.value} placeholder="e.g. 1" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled} onChange={(event) => updateParam(param.id, { value: event.target.value })} /></td>
                <td><button type="button" className="remove-param-button" aria-label={`Remove parameter ${index + 1}`} disabled={disabled} onClick={() => onChange(params.filter((row) => row.id !== param.id))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id="query-help">URL parameters are kept. Enabled rows are appended when you send.</p>
    </section>
  );
}
