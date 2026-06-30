import { useEffect, useRef } from 'react';
import { resyncLocalBlobs, useTracks } from './storage';
import TrackList from './TrackList';
import './App.css';

function App() {
  const { tracks, setTracks } = useTracks();
  const resynced = useRef(false);

  useEffect(() => {
    if (resynced.current || tracks.length === 0) return;
    resynced.current = true;
    resyncLocalBlobs(tracks);
  }, [tracks]);

  return <TrackList tracks={tracks} setTracks={setTracks} />;
}

export default App;
