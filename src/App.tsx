import { useState } from 'react';
import { useSongs } from './storage';
import SongList from './SongList';
import SongDetail from './SongDetail';
import './App.css';

function App() {
  const { songs, setSongs } = useSongs();
  const [openSongId, setOpenSongId] = useState<string | null>(null);

  const openSong = songs.find((s) => s.id === openSongId) ?? null;

  if (openSong) {
    return (
      <SongDetail
        song={openSong}
        onBack={() => setOpenSongId(null)}
        onUpdate={(updated) =>
          setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
        }
      />
    );
  }

  return (
    <SongList
      songs={songs}
      onAdd={(song) => setSongs((prev) => [...prev, song])}
      onDelete={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
      onOpen={(id) => setOpenSongId(id)}
    />
  );
}

export default App;
