import { useId } from 'react';

export default function KeyValueEditor({ title, itemLabel, rows, onChange, disabled, help, namePlaceholder, valuePlaceholder }) {
  const id = useId();
  const itemName = itemLabel.toLowerCase();
  const activeCount = rows.filter((row) => row.enabled && row.key.trim()).length;

  function updateRow(id, changes) {
    // Replace the changed row rather than mutating React's existing state.
    onChange(rows.map((row) => row.id === id ? { ...row, ...changes } : row));
  }

  function addRow() {
    onChange([...rows, { id: crypto.randomUUID(), enabled: true, key: '', value: '' }]);
  }

  return (
    <section className="key-value-editor" aria-labelledby={`${id}-heading`}>
      <div className="editor-heading">
        <h3 id={`${id}-heading`}>{title} <span className="count">{activeCount}</span></h3>
        <button type="button" className="add-row-button" disabled={disabled} onClick={addRow}>+ Add {itemName}</button>
      </div>
      <div className="key-value-table-scroll">
        <table className="key-value-table" aria-describedby={`${id}-help`}>
          <thead><tr><th scope="col">Use</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="editor-empty">No additional {itemName}s. Add a row to include one.</td></tr>}
            {rows.map((row, index) => (
              <tr key={row.id} className={row.enabled ? '' : 'editor-row-disabled'}>
                <td><input type="checkbox" aria-label={`Enable ${itemName} ${index + 1}`} checked={row.enabled} disabled={disabled} onChange={(event) => updateRow(row.id, { enabled: event.target.checked })} /></td>
                <td><input type="text" aria-label={`${itemLabel} ${index + 1} name`} value={row.key} placeholder={namePlaceholder} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled} onChange={(event) => updateRow(row.id, { key: event.target.value })} /></td>
                <td><input type="text" aria-label={`${itemLabel} ${index + 1} value`} value={row.value} placeholder={valuePlaceholder} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled} onChange={(event) => updateRow(row.id, { value: event.target.value })} /></td>
                <td><button type="button" className="remove-row-button" aria-label={`Remove ${itemName} ${index + 1}`} disabled={disabled} onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id={`${id}-help`}>{help}</p>
    </section>
  );
}
