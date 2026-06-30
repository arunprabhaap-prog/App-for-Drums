import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Track } from './types';
import { deleteBlob, newId, saveBlob } from './storage';
import TrackPlayer from './TrackPlayer';

interface Props {
  tracks: Track[];
  setTracks: Dispatch<SetStateAction<Track[]>>;
}

export default function TrackList({ tracks, setTracks }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const sorted = [...tracks].sort((a, b) => a.order - b.order);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const startOrder = tracks.length === 0 ? 0 : Math.max(...tracks.map((t) => t.order)) + 1;
    const newTracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = newId();
      await saveBlob(id, file);
      newTracks.push({
        id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        order: startOrder + i,
        duration: 0,
        markers: [],
      });
    }
    setTracks((prev) => [...prev, ...newTracks]);
  }

  function moveTrack(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((t) => t.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === a.id) return { ...t, order: b.order };
        if (t.id === b.id) return { ...t, order: a.order };
        return t;
      }),
    );
  }

  async function deleteTrack(id: string) {
    if (!confirm('Delete this track and all its flags?')) return;
    await deleteBlob(id);
    setTracks((prev) => prev.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (playingId === id) setPlayingId(null);
  }

  function renameTrack(id: string, title: string) {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }

  function startReplaceTrack(id: string) {
    replaceIdRef.current = id;
    replaceInputRef.current?.click();
  }

  async function handleReplaceFile(files: FileList | null) {
    const id = replaceIdRef.current;
    if (!files || files.length === 0 || !id) return;
    await saveBlob(id, files[0]);
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, markers: [], duration: 0 } : t)));
  }

  return (
    <div className="page">
      <h1>Aarpo Tracks</h1>

      <div className="upload-bar">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            handleReplaceFile(e.target.files);
            e.target.value = '';
          }}
        />
        <button className="primary" onClick={() => fileInputRef.current?.click()}>
          + Upload tracks
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="empty-hint">No tracks yet. Upload your drum audio files to get started.</p>
      )}

      <ul className="track-list">
        {sorted.map((track, idx) => (
          <li key={track.id} className={`track-item ${expandedId === track.id ? 'expanded' : ''}`}>
            <div className="track-row">
              <button
                className="play-btn"
                onClick={() => {
                  setExpandedId(track.id);
                  setPlayingId(track.id);
                }}
                aria-label="Play"
              >
                ▶
              </button>

              <input
                className="track-title"
                value={track.title}
                onChange={(e) => renameTrack(track.id, e.target.value)}
              />

              <div className="track-actions">
                <button onClick={() => moveTrack(track.id, -1)} disabled={idx === 0} aria-label="Move up">
                  ↑
                </button>
                <button
                  onClick={() => moveTrack(track.id, 1)}
                  disabled={idx === sorted.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  className="expand-btn"
                  onClick={() => setExpandedId(expandedId === track.id ? null : track.id)}
                >
                  {expandedId === track.id ? 'Hide' : 'Flags'}
                </button>
                <button onClick={() => startReplaceTrack(track.id)} aria-label="Replace audio">
                  ⟳
                </button>
                <button className="danger" onClick={() => deleteTrack(track.id)} aria-label="Delete">
                  ✕
                </button>
              </div>
            </div>

            {expandedId === track.id && (
              <TrackPlayer
                track={track}
                autoPlay={playingId === track.id}
                onConsumeAutoPlay={() => setPlayingId(null)}
                onUpdate={(updated) =>
                  setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                }
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
