const SAMPLE_BODY = JSON.stringify({ name: 'Rahul', branch: 'CSE' }, null, 2);

export default function JsonBodyEditor({ body, method, onChange, disabled }) {
  const isGet = method === 'GET';

  return (
    <section className="json-body-editor" aria-labelledby="body-editor-heading">
      <div className="editor-heading">
        <h3 id="body-editor-heading">Request body</h3>
        <div className="body-editor-actions">
          {body.mode === 'json' && <button type="button" className="add-row-button" disabled={disabled} onClick={() => onChange({ ...body, text: SAMPLE_BODY })}>Use sample JSON</button>}
          <label className="sr-only" htmlFor="body-type">Body type</label>
          <select id="body-type" className="body-type-select" value={body.mode} disabled={disabled} onChange={(event) => onChange({ ...body, mode: event.target.value })}>
            <option value="none">None</option>
            <option value="json" disabled={isGet}>JSON</option>
          </select>
        </div>
      </div>
      {body.mode === 'json' ? (
        <>
          <textarea className="json-body-input" aria-label="JSON request body" aria-describedby="body-editor-help" value={body.text} placeholder={SAMPLE_BODY} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={disabled} onChange={(event) => onChange({ ...body, text: event.target.value })} />
          <p id="body-editor-help">Up to 1 MiB of JSON. Content-Type defaults to application/json unless you set it in Headers.</p>
        </>
      ) : (
        <p className="body-empty">{isGet ? 'GET requests send no body. Choose another method to use JSON; your draft is kept.' : 'No request body will be sent. Choose JSON to include structured data.'}</p>
      )}
    </section>
  );
}
