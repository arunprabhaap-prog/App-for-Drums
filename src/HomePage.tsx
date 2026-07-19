import { useEffect, useRef, useState } from 'react';
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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<SetList | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SetList | null>(null);
  const [deletePasscode, setDeletePasscode] = useState('');
  const [deletePasscodeError, setDeletePasscodeError] = useState(false);
  const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const sorted = [...setLists].sort((a, b) => a.order - b.order);

  // Close the open menu when clicking outside it
  useEffect(() => {
    if (!menuOpenId) return;
    function onPointerDown(e: MouseEvent) {
      const el = menuRefs.current.get(menuOpenId!);
      if (el && !el.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpenId]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const maxOrder = setLists.length === 0 ? 0 : Math.max(...setLists.map((s) => s.order)) + 1;
    onCreateSetList({ id: newId(), name, order: maxOrder });
    setNewName('');
    setCreating(false);
  }

  function openRename(sl: SetList) {
    setMenuOpenId(null);
    setRenameDraft(sl.name);
    setRenameTarget(sl);
  }

  function confirmRename() {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (name) onRenameSetList(renameTarget.id, name);
    setRenameTarget(null);
  }

  function openDelete(sl: SetList) {
    setMenuOpenId(null);
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
        {sorted.map((sl) => {
          const count = trackCount(sl.id);
          const isMenuOpen = menuOpenId === sl.id;
          return (
            <li key={sl.id} className="setlist-item">
              <button className="setlist-main" onClick={() => onOpen(sl.id)}>
                <span className="setlist-name">{sl.name}</span>
                <span className="setlist-meta">{count} track{count === 1 ? '' : 's'}</span>
              </button>
              <div
                className="setlist-menu-wrap"
                ref={(el) => { if (el) menuRefs.current.set(sl.id, el); else menuRefs.current.delete(sl.id); }}
              >
                <button
                  className="setlist-menu-btn"
                  aria-label="More options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(isMenuOpen ? null : sl.id);
                  }}
                >
                  <span className="hamburger-icon">
                    <span /><span /><span />
                  </span>
                </button>
                {isMenuOpen && (
                  <div className="setlist-dropdown">
                    <button onClick={() => openRename(sl)}>Rename</button>
                    <button className="danger" onClick={() => openDelete(sl)}>Delete</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Rename modal */}
      {renameTarget && (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Rename set list</h3>
            <label className="modal-field">
              Name
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmRename();
                  if (e.key === 'Escape') setRenameTarget(null);
                }}
              />
            </label>
            <div className="modal-actions">
              <div className="spacer" />
              <button onClick={() => setRenameTarget(null)}>Cancel</button>
              <button className="primary" onClick={confirmRename} disabled={!renameDraft.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
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
