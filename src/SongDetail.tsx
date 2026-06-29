import type { Song } from './types';
import { BarRuler } from './BarGrid';
import LyricsTrack from './LyricsTrack';
import DrumTrack from './DrumTrack';

interface Props {
  song: Song;
  onUpdate: (song: Song) => void;
  onBack: () => void;
}

export default function SongDetail({ song, onUpdate, onBack }: Props) {
  return (
    <div className="page">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ← Setlist
        </button>
        <h1>{song.title}</h1>
        <span className="song-meta">
          {song.bpm} BPM · {song.beatsPerBar}/4 · {song.totalBars} bars
        </span>
      </div>

      <div className="track-section">
        <h2>Lyrics</h2>
        <div className="track-scroll">
          <BarRuler totalBars={song.totalBars} beatsPerBar={song.beatsPerBar} />
          <LyricsTrack
            totalBars={song.totalBars}
            lyrics={song.lyrics}
            onChange={(lyrics) => onUpdate({ ...song, lyrics })}
          />
        </div>
      </div>

      <div className="track-section">
        <h2>Drum Arrangement</h2>
        <p className="hint">Click and drag across bars to create a block.</p>
        <div className="track-scroll">
          <BarRuler totalBars={song.totalBars} beatsPerBar={song.beatsPerBar} />
          <DrumTrack
            totalBars={song.totalBars}
            blocks={song.drumBlocks}
            onChange={(drumBlocks) => onUpdate({ ...song, drumBlocks })}
          />
        </div>
      </div>
    </div>
  );
}
