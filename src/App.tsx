import { useEffect, useRef, useState } from 'react';
import { newId, resyncLocalBlobs, useSetLists, useTracks } from './storage';
import HomePage from './HomePage';
import TrackList from './TrackList';
import DrummerView from './DrummerView';
import DrummerSongView from './DrummerSongView';
import type { SetList } from './types';
import './App.css';

type View =
  | { name: 'home' }
  | { name: 'tracks'; setListId: string }
  | { name: 'drummer-list'; setListId: string }
  | { name: 'drummer-song'; id: string; setListId: string };

const DRUMMER_PASSCODE = '2323';
const UNLOCK_KEY = 'drummer-view-unlocked';
const MIGRATED_KEY = 'setlist-migration-v1';

function App() {
  const { tracks, setTracks } = useTracks();
  const { setLists, setSetLists } = useSetLists();
  const resynced = useRef(false);
  const migrated = useRef(false);
  const [view, setView] = useState<View>({ name: 'home' });
  const [passcodePrompt, setPasscodePrompt] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  useEffect(() => {
    if (resynced.current || tracks.length === 0) return;
    resynced.current = true;
    resyncLocalBlobs(tracks);
  }, [tracks]);

  // One-time migration: if tracks exist without a setListId (i.e. created
  // before set lists were introduced), bundle them into a default set list
  // called "Aarpo July 3rd Show" so nothing is lost.
  useEffect(() => {
    if (migrated.current) return;
    if (localStorage.getItem(MIGRATED_KEY) === '1') {
      migrated.current = true;
      return;
    }
    // Wait until both Firestore subscriptions have fired at least once
    // before deciding whether migration is needed.
    const untagged = tracks.filter((t) => !t.setListId);
    if (tracks.length === 0 && setLists.length === 0) return; // still loading
    if (untagged.length === 0) {
      // No legacy tracks — nothing to migrate.
      localStorage.setItem(MIGRATED_KEY, '1');
      migrated.current = true;
      return;
    }

    migrated.current = true;
    localStorage.setItem(MIGRATED_KEY, '1');

    const id = newId();
    const defaultSetList: SetList = { id, name: 'Aarpo July 3rd Show', order: 0 };
    setSetLists((prev) => [...prev, defaultSetList]);
    setTracks((prev) =>
      prev.map((t) => (t.setListId ? t : { ...t, setListId: id })),
    );
  }, [tracks, setLists, setSetLists, setTracks]);

  function openDrummerView(setListId: string) {
    if (sessionStorage.getItem(UNLOCK_KEY) === '1') {
      setView({ name: 'drummer-list', setListId });
      return;
    }
    setPasscodeInput('');
    setPasscodeError(false);
    setPasscodePrompt(true);
    // Store the intended destination so submitPasscode can navigate there.
    pendingSetListId.current = setListId;
  }

  const pendingSetListId = useRef<string | null>(null);

  function submitPasscode() {
    if (passcodeInput === DRUMMER_PASSCODE) {
      sessionStorage.setItem(UNLOCK_KEY, '1');
      setPasscodePrompt(false);
      const id = pendingSetListId.current ?? (view.name === 'tracks' ? view.setListId : '');
      setView({ name: 'drummer-list', setListId: id });
    } else {
      setPasscodeError(true);
    }
  }

  function handleDeleteSetList(id: string) {
    // Delete all tracks belonging to this set list.
    setTracks((prev) => prev.filter((t) => t.setListId !== id));
    setSetLists((prev) => prev.filter((s) => s.id !== id));
    if (view.name !== 'home') setView({ name: 'home' });
  }

  const passcodeModal = passcodePrompt && (
    <div className="modal-backdrop" onClick={() => setPasscodePrompt(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Drummer view</h3>
        <label className="modal-field">
          Enter passcode
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            value={passcodeInput}
            onChange={(e) => {
              setPasscodeInput(e.target.value);
              setPasscodeError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submitPasscode()}
          />
        </label>
        {passcodeError && <p className="load-error">⚠ Incorrect passcode</p>}
        <div className="modal-actions">
          <div className="spacer" />
          <button onClick={() => setPasscodePrompt(false)}>Cancel</button>
          <button className="primary" onClick={submitPasscode}>
            Unlock
          </button>
        </div>
      </div>
    </div>
  );

  if (view.name === 'home') {
    return (
      <>
        <HomePage
          setLists={setLists}
          tracks={tracks}
          onOpen={(setListId) => setView({ name: 'tracks', setListId })}
          onCreateSetList={(sl) => setSetLists((prev) => [...prev, sl])}
          onDeleteSetList={handleDeleteSetList}
          onRenameSetList={(id, name) =>
            setSetLists((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
          }
        />
        {passcodeModal}
      </>
    );
  }

  if (view.name === 'tracks') {
    const { setListId } = view;
    const setList = setLists.find((s) => s.id === setListId);
    const setListTracks = tracks.filter((t) => t.setListId === setListId);
    return (
      <>
        <TrackList
          setListName={setList?.name ?? ''}
          tracks={setListTracks}
          setTracks={(value) => {
            setTracks((prev) => {
              const updated = typeof value === 'function'
                ? (value as (p: typeof setListTracks) => typeof setListTracks)(setListTracks)
                : value;
              const updatedIds = new Set(updated.map((t) => t.id));
              // Ensure every new/updated track carries the setListId.
              const tagged = updated.map((t) => ({ ...t, setListId }));
              return [
                ...prev.filter((t) => t.setListId !== setListId && !updatedIds.has(t.id)),
                ...tagged,
              ];
            });
          }}
          onBack={() => setView({ name: 'home' })}
          onOpenDrummerView={() => openDrummerView(setListId)}
        />
        {passcodeModal}
      </>
    );
  }

  if (view.name === 'drummer-list') {
    const { setListId } = view;
    const setListTracks = tracks.filter((t) => t.setListId === setListId);
    return (
      <DrummerView
        tracks={setListTracks}
        onBack={() => setView({ name: 'tracks', setListId })}
        onOpenSong={(id) => setView({ name: 'drummer-song', id, setListId })}
      />
    );
  }

  if (view.name === 'drummer-song') {
    const { id, setListId } = view;
    const track = tracks.find((t) => t.id === id);
    if (!track) {
      setView({ name: 'drummer-list', setListId });
      return null;
    }
    return (
      <DrummerSongView
        track={track}
        onBack={() => setView({ name: 'drummer-list', setListId })}
        onUpdate={(updated) => setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
      />
    );
  }

  return null;
}

export default App;
