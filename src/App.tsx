import { useTracks } from './storage';
import TrackList from './TrackList';
import './App.css';

function App() {
  const { tracks, setTracks } = useTracks();

  return <TrackList tracks={tracks} setTracks={setTracks} />;
}

export default App;
