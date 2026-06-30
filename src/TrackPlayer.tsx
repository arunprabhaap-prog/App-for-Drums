import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Track, Marker } from './types';
import { getBlob, newId } from './storage';

const MARKER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
];

export interface TrackPlayerHandle {
  togglePlay: () => void;
  pause: () => void;
}

interface Props {
  track: Track;
  compact: boolean;
  onPlayingChange: (playing: boolean) => void;
  onUpdate: (track: Track) => void;
}

function formatTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TrackPlayer = forwardRef<TrackPlayerHandle, Props>(function TrackPlayer(
  { track, compact, onPlayingChange, onUpdate },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration);
  const [pending, setPending] = useState<{ time: number } | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const wantsPlayRef = useRef(false);

  // Preload the audio source as soon as the track mounts (rather than
  // waiting for a play tap) so that togglePlay() can call audio.play()
  // synchronously within the user gesture - iOS Safari silently drops
  // play() calls that aren't tied directly to a tap.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setLoadError(null);
    setCurrentTime(0);
    setDuration(track.duration);
    getBlob(track.id, track.mimeType)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load audio:', track.id, err);
        setLoadError(err?.code || err?.message || String(err));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // track.duration is intentionally excluded: onLoadedMetadata below writes
    // a duration back onto the track, and including it here would re-trigger
    // this effect on every write - reloading the audio (interrupting
    // playback) and re-firing onLoadedMetadata in a loop, with each iteration
    // writing a stale `track` closure that could clobber markers added or
    // removed in between.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  function playNow() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch((err) => {
      console.error('Playback failed:', track.id, err);
      setLoadError(err?.message || String(err));
    });
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!url) {
      // Blob is still loading (e.g. first tap right after the track became
      // visible) - remember the request and fire it as soon as the source
      // is ready instead of silently no-op'ing, which is what made play
      // sometimes need 2-3 taps before anything happened.
      wantsPlayRef.current = true;
      return;
    }
    if (audio.paused) playNow();
    else audio.pause();
  }

  useEffect(() => {
    if (url && wantsPlayRef.current) {
      wantsPlayRef.current = false;
      playNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useImperativeHandle(ref, () => ({
    togglePlay,
    pause: () => audioRef.current?.pause(),
  }));

  function seek(time: number, play = true) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
    if (play) audio.play().catch(() => {});
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const time = ratio * duration;
    seek(time, false);
    setPending({ time });
    setLabelDraft('');
  }

  function addMarker() {
    if (!pending) return;
    const marker: Marker = {
      id: newId(),
      time: pending.time,
      label: labelDraft.trim() || 'Untitled',
      color: MARKER_COLORS[track.markers.length % MARKER_COLORS.length],
    };
    const markers = [...track.markers, marker].sort((a, b) => a.time - b.time);
    onUpdate({ ...track, markers });
    setPending(null);
    setLabelDraft('');
  }

  function deleteMarker(id: string) {
    onUpdate({ ...track, markers: track.markers.filter((m) => m.id !== id) });
  }

  function renameMarker(id: string, label: string) {
    onUpdate({ ...track, markers: track.markers.map((m) => (m.id === id ? { ...m, label } : m)) });
  }

  const audio = (
    <audio
      ref={audioRef}
      src={url || undefined}
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration;
        setDuration(d);
        // Decoders can report a duration that's a hair off from a previous
        // load (floating-point jitter), not a meaningful change - only
        // persist when it actually differs enough to matter, otherwise this
        // would write back on nearly every load.
        if (isFinite(d) && Math.abs(d - track.duration) > 0.5) onUpdate({ ...track, duration: d });
      }}
      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      onPlay={() => onPlayingChange(true)}
      onPause={() => onPlayingChange(false)}
      onEnded={() => onPlayingChange(false)}
      onError={(e) => {
        const mediaError = e.currentTarget.error;
        console.error('Audio element error:', track.id, mediaError);
        setLoadError(mediaError?.message || `decode error (code ${mediaError?.code})`);
      }}
    />
  );

  const errorNotice = loadError ? <p className="load-error">⚠ Couldn't load audio: {loadError}</p> : null;

  // audio and errorNotice must stay in the same position in the tree
  // regardless of `compact` - if the root element type changes (Fragment vs
  // div) React tears down and remounts the whole subtree, which pauses
  // playback every time the track is expanded or collapsed.
  return (
    <>
      {audio}
      {errorNotice}
      {!compact && (
        <div className="track-player">
          <div className="player-controls">
            <span className="time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <p className="hint">Tap the timeline to drop a flag at that point.</p>

          <div className="timeline" ref={timelineRef} onClick={handleTimelineClick}>
            <div
              className="timeline-progress"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
            {track.markers.map((m) => (
              <button
                key={m.id}
                className="timeline-flag"
                style={{ left: duration ? `${(m.time / duration) * 100}%` : '0%', background: m.color }}
                title={m.label}
                onClick={(e) => {
                  e.stopPropagation();
                  seek(m.time);
                }}
              />
            ))}
          </div>

          {pending && (
            <div className="marker-add-form">
              <span className="marker-add-time">{formatTime(pending.time)}</span>
              <input
                autoFocus
                placeholder="Label, e.g. Breakdown, Groove..."
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMarker()}
              />
              <button className="primary" onClick={addMarker}>
                Add flag
              </button>
              <button onClick={() => setPending(null)}>Cancel</button>
            </div>
          )}

          {track.markers.length > 0 && (
            <ul className="marker-list">
              {track.markers.map((m) => (
                <li key={m.id} className="marker-item">
                  <span className="marker-dot" style={{ background: m.color }} />
                  <button className="marker-jump" onClick={() => seek(m.time)}>
                    {formatTime(m.time)}
                  </button>
                  <input
                    className="marker-label-input"
                    value={m.label}
                    onChange={(e) => renameMarker(m.id, e.target.value)}
                  />
                  <button className="danger" onClick={() => deleteMarker(m.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
});

export default TrackPlayer;
