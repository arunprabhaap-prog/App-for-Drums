import { useEffect, useRef, useState } from 'react';
import { resyncLocalBlobs, useTracks } from './storage';
import TrackList from './TrackList';
import DrummerView from './DrummerView';
import DrummerSongView from './DrummerSongView';
import './App.css';

type View = { name: 'tracks' } | { name: 'drummer-list' } | { name: 'drummer-song'; id: string };

function App() {
  const { tracks, setTracks } = useTracks();
  const resynced = useRef(false);
  const [view, setView] = useState<View>({ name: 'tracks' });

  useEffect(() => {
    if (resynced.current || tracks.length === 0) return;
    resynced.current = true;
    resyncLocalBlobs(tracks);
  }, [tracks]);

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
    <TrackList tracks={tracks} setTracks={setTracks} onOpenDrummerView={() => setView({ name: 'drummer-list' })} />
  );
}

export default App;
