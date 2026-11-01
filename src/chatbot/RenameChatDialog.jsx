import { useEffect, useRef, useState } from 'react';

export default function RenameChatDialog({ title, onSave, onCancel }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const [name, setName] = useState(title);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    inputRef.current.focus();
    inputRef.current.select();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog ref={dialogRef} className="pedro-rename-dialog" aria-labelledby="pedro-rename-title"
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onCancel();
      }}>
      <form onSubmit={event => { event.preventDefault(); if (name.trim()) onSave(name.trim()); }}>
        <h2 id="pedro-rename-title">Rename conversation</h2>
        <label htmlFor="pedro-conversation-name">Conversation name</label>
        <input ref={inputRef} id="pedro-conversation-name" value={name} onChange={event => setName(event.target.value)} required />
        <div className="pedro-rename-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={!name.trim()}>Save name</button>
        </div>
      </form>
    </dialog>
  );
}
