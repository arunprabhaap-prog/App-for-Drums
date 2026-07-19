import { useState } from 'react';
import type { SetList, Track } from './types';
import { newId } from './storage';

interface Props {
  setLists: SetList[];
  tracks: Track[];
  onOpen: (setListId: string) => void;
  onCreateSetList: (sl: SetList) => void;
  onDeleteSetList: (id: string) => void;
  onRenameSetList: (id: string, name: string) => void;
}

const DELETE_PASSCODE = '2323';

export default function HomePage({ setLists, tracks, onOpen, onCreateSetList, onDeleteSetList, onRenameSetList }: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SetList | null>(null);
  const [deletePasscode, setDeletePasscode] = useState('');
  const [deletePasscodeError, setDeletePasscodeError] = useState(false);

  const sorted = [...setLists].sort((a, b) => a.order - b.order);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const maxOrder = setLists.length === 0 ? 0 : Math.max(...setLists.map((s) => s.order)) + 1;
    onCreateSetList({ id: newId(), name, order: maxOrder });
    setNewName('');
    setCreating(false);
  }

  function requestDelete(sl: SetList) {
    setDeletePasscode('');
    setDeletePasscodeError(false);
    setDeleteTarget(sl);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deletePasscode !== DELETE_PASSCODE) {
      setDeletePasscodeError(true);
      return;
    }
    onDeleteSetList(deleteTarget.id);
    setDeleteTarget(null);
  }

  function trackCount(setListId: string) {
    return tracks.filter((t) => t.setListId === setListId).length;
  }

  return (
    <div className="page">
      <h1>Shows &amp; Practice</h1>

      <div className="upload-bar">
        <button className="primary" onClick={() => { setCreating(true); setNewName(''); }}>
          + New set list
        </button>
      </div>

      {creating && (
        <div className="new-setlist-form">
          <input
            autoFocus
            placeholder="Set list name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button className="primary" onClick={handleCreate} disabled={!newName.trim()}>
            Create
          </button>
          <button onClick={() => setCreating(false)}>Cancel</button>
        </div>
      )}

      {sorted.length === 0 && !creating && (
        <p className="empty-hint">No set lists yet. Create one to get started.</p>
      )}

      <ul className="setlist-list">
        {sorted.map((sl) => (
          <li key={sl.id} className="setlist-item">
            <button className="setlist-main" onClick={() => onOpen(sl.id)}>
              <span className="setlist-name">{sl.name}</span>
              <span className="setlist-meta">{trackCount(sl.id)} track{trackCount(sl.id) === 1 ? '' : 's'}</span>
            </button>
            <div className="setlist-actions">
              <input
                className="setlist-rename"
                value={sl.name}
                onChange={(e) => onRenameSetList(sl.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Rename set list"
              />
              <button
                className="danger"
                onClick={() => requestDelete(sl)}
                aria-label="Delete set list"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete "{deleteTarget.name}"?</h3>
            <p className="hint">This removes the set list and all its tracks. Enter the passcode to confirm.</p>
            <label className="modal-field">
              Passcode
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                value={deletePasscode}
                onChange={(e) => {
                  setDeletePasscode(e.target.value);
                  setDeletePasscodeError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && confirmDelete()}
              />
            </label>
            {deletePasscodeError && <p className="load-error">⚠ Incorrect passcode</p>}
            <div className="modal-actions">
              <div className="spacer" />
              <button onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
