import { useEffect, useRef, useState } from 'react';
import { resyncLocalBlobs, useTracks } from './storage';
import TrackList from './TrackList';
import DrummerView from './DrummerView';
import DrummerSongView from './DrummerSongView';
import './App.css';

type View = { name: 'tracks' } | { name: 'drummer-list' } | { name: 'drummer-song'; id: string };

const DRUMMER_PASSCODE = '2323';
const UNLOCK_KEY = 'drummer-view-unlocked';

function App() {
  const { tracks, setTracks } = useTracks();
  const resynced = useRef(false);
  const [view, setView] = useState<View>({ name: 'tracks' });
  const [passcodePrompt, setPasscodePrompt] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  useEffect(() => {
    if (resynced.current || tracks.length === 0) return;
    resynced.current = true;
    resyncLocalBlobs(tracks);
  }, [tracks]);

  function openDrummerView() {
    if (sessionStorage.getItem(UNLOCK_KEY) === '1') {
      setView({ name: 'drummer-list' });
      return;
    }
    setPasscodeInput('');
    setPasscodeError(false);
    setPasscodePrompt(true);
  }

  function submitPasscode() {
    if (passcodeInput === DRUMMER_PASSCODE) {
      sessionStorage.setItem(UNLOCK_KEY, '1');
      setPasscodePrompt(false);
      setView({ name: 'drummer-list' });
    } else {
      setPasscodeError(true);
    }
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

  if (view.name === 'drummer-list') {
    return (
      <DrummerView
        tracks={tracks}
        onBack={() => setView({ name: 'tracks' })}
        onOpenSong={(id) => setView({ name: 'drummer-song', id })}
      />
    );
  }

  if (view.name === 'drummer-song') {
    const track = tracks.find((t) => t.id === view.id);
    if (!track) {
      setView({ name: 'drummer-list' });
      return null;
    }
    return (
      <DrummerSongView
        track={track}
        onBack={() => setView({ name: 'drummer-list' })}
        onUpdate={(updated) => setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
      />
    );
  }

  return (
    <>
      <TrackList tracks={tracks} setTracks={setTracks} onOpenDrummerView={openDrummerView} />
      {passcodeModal}
    </>
  );
}

export default App;
