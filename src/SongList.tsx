import { useState } from 'react';
import type { Song } from './types';
import { newId } from './storage';

interface Props {
  songs: Song[];
  onAdd: (song: Song) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function SongList({ songs, onAdd, onDelete, onOpen }: Props) {
  const [title, setTitle] = useState('');
  const [bpm, setBpm] = useState(120);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [totalBars, setTotalBars] = useState(32);

  function handleAdd() {
    if (!title.trim()) return;
    onAdd({
      id: newId(),
      title: title.trim(),
      bpm,
      beatsPerBar,
      totalBars,
      lyrics: [],
      drumBlocks: [],
    });
    setTitle('');
    setBpm(120);
    setBeatsPerBar(4);
    setTotalBars(32);
  }

  return (
    <div className="page">
      <h1>Setlist</h1>

      <div className="add-song-form">
        <input
          placeholder="Song title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <label>
          BPM
          <input
            type="number"
            min={20}
            max={300}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </label>
        <label>
          Beats/Bar
          <input
            type="number"
            min={1}
            max={12}
            value={beatsPerBar}
            onChange={(e) => setBeatsPerBar(Number(e.target.value))}
          />
        </label>
        <label>
          Bars
          <input
            type="number"
            min={1}
            max={500}
            value={totalBars}
            onChange={(e) => setTotalBars(Number(e.target.value))}
          />
        </label>
        <button onClick={handleAdd}>Add song</button>
      </div>

      {songs.length === 0 && <p className="empty-hint">No songs yet. Add your first song above.</p>}

      <ul className="song-list">
        {songs.map((song) => (
          <li key={song.id} className="song-row">
            <button className="song-row-main" onClick={() => onOpen(song.id)}>
              <span className="song-title">{song.title}</span>
              <span className="song-meta">
                {song.bpm} BPM · {song.beatsPerBar}/4 · {song.totalBars} bars
              </span>
            </button>
            <button
              className="delete-btn"
              title="Delete song"
              onClick={() => {
                if (confirm(`Delete "${song.title}"?`)) onDelete(song.id);
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
