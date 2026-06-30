import type { Track } from './types';

interface Props {
  tracks: Track[];
  onBack: () => void;
  onOpenSong: (id: string) => void;
}

function formatTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DrummerView({ tracks, onBack, onOpenSong }: Props) {
  const sorted = [...tracks].sort((a, b) => a.order - b.order);

  return (
    <div className="page">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1>Drummer view</h1>
      </div>

      {sorted.length === 0 && <p className="empty-hint">No tracks yet.</p>}

      <ul className="song-list">
        {sorted.map((track) => (
          <li key={track.id} className="song-row">
            <button className="song-row-main" onClick={() => onOpenSong(track.id)}>
              <span className="song-title">{track.title}</span>
              <span className="song-meta">
                {formatTime(track.duration)} · {track.markers.length} flag
                {track.markers.length === 1 ? '' : 's'} · {(track.drumBlocks ?? []).length} block
                {(track.drumBlocks ?? []).length === 1 ? '' : 's'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
