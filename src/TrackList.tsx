import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Track } from './types';
import { deleteBlob, newId, saveBlob } from './storage';
import TrackPlayer, { type TrackPlayerHandle } from './TrackPlayer';

interface Props {
  tracks: Track[];
  setTracks: Dispatch<SetStateAction<Track[]>>;
}

export default function TrackList({ tracks, setTracks }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIdRef = useRef<string | null>(null);
  const playerRefs = useRef<Map<string, TrackPlayerHandle>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  type SyncState = { status: 'syncing' } | { status: 'error'; message: string };
  const [syncStatus, setSyncStatus] = useState<Map<string, SyncState>>(new Map());

  useEffect(() => {
    const hasSyncing = [...syncStatus.values()].some((s) => s.status === 'syncing');
    if (!hasSyncing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [syncStatus]);

  const sorted = [...tracks].sort((a, b) => a.order - b.order);

  function setStatus(id: string, state: SyncState | null) {
    setSyncStatus((prev) => {
      const next = new Map(prev);
      if (state) next.set(id, state);
      else next.delete(id);
      return next;
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const startOrder = tracks.length === 0 ? 0 : Math.max(...tracks.map((t) => t.order)) + 1;
    const newTracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = newId();
      setStatus(id, { status: 'syncing' });
      await saveBlob(id, file, (ok, error) =>
        setStatus(id, ok ? null : { status: 'error', message: error || 'unknown error' }),
      );
      newTracks.push({
        id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        order: startOrder + i,
        duration: 0,
        markers: [],
        mimeType: file.type || undefined,
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
    playerRefs.current.delete(id);
  }

  function renameTrack(id: string, title: string) {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }

  function handlePlayClick(id: string) {
    playerRefs.current.get(id)?.togglePlay();
  }

  function startReplaceTrack(id: string) {
    replaceIdRef.current = id;
    replaceInputRef.current?.click();
  }

  async function handleReplaceFile(files: FileList | null) {
    const id = replaceIdRef.current;
    if (!files || files.length === 0 || !id) return;
    const file = files[0];
    setStatus(id, { status: 'syncing' });
    await saveBlob(id, file, (ok, error) =>
      setStatus(id, ok ? null : { status: 'error', message: error || 'unknown error' }),
    );
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, markers: [], duration: 0, mimeType: file.type || undefined } : t)),
    );
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
                onClick={() => handlePlayClick(track.id)}
                aria-label={playingId === track.id ? 'Pause' : 'Play'}
              >
                {playingId === track.id ? '⏸' : '▶'}
              </button>

              {syncStatus.get(track.id)?.status === 'syncing' && (
                <span className="sync-badge" title="Uploading to cloud - keep this open until it finishes">
                  ☁ syncing…
                </span>
              )}
              {syncStatus.get(track.id)?.status === 'error' && (
                <span className="sync-badge error" title="Cloud upload failed - this track won't be available on other devices yet">
                  ⚠ {(syncStatus.get(track.id) as { status: 'error'; message: string }).message}
                </span>
              )}

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
                  aria-label={expandedId === track.id ? 'Hide flags' : 'Show flags'}
                >
                  Flags {expandedId === track.id ? '▲' : '▼'}
                </button>
                <button onClick={() => startReplaceTrack(track.id)} aria-label="Replace audio">
                  ⟳
                </button>
                <button className="danger" onClick={() => deleteTrack(track.id)} aria-label="Delete">
                  ✕
                </button>
              </div>
            </div>

            <TrackPlayer
              ref={(el) => {
                if (el) playerRefs.current.set(track.id, el);
                else playerRefs.current.delete(track.id);
              }}
              track={track}
              compact={expandedId !== track.id}
              onPlayingChange={(playing) =>
                setPlayingId((prev) => (playing ? track.id : prev === track.id ? null : prev))
              }
              onUpdate={(updated) =>
                setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
