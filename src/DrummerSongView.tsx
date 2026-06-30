import { useEffect, useRef, useState } from 'react';
import type { DrumBlock, Track } from './types';
import { getBlob, newId } from './storage';
import BlockEditor, { BLOCK_COLORS } from './BlockEditor';

const PX_PER_SEC = 80;

interface Props {
  track: Track;
  onBack: () => void;
  onUpdate: (track: Track) => void;
}

function formatTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DrummerSongView({ track, onBack, onUpdate }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(track.duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragRange, setDragRange] = useState<{ start: number; end: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const [editing, setEditing] = useState<
    | { mode: 'new'; startTime: number; endTime: number }
    | { mode: 'edit'; block: DrumBlock }
    | null
  >(null);

  const width = Math.max(1, Math.round(duration * PX_PER_SEC));
  const blocks = track.drumBlocks ?? [];

  // Load the blob, build an <audio> source for playback, and decode it
  // separately for waveform peaks - decodeAudioData detaches the buffer it's
  // given, so the audio element needs its own object URL rather than sharing
  // the buffer used for analysis.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setPeaks(null);
    setCurrentTime(0);
    setDuration(track.duration);

    getBlob(track.id, track.mimeType).then(async (blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);

      try {
        const arrayBuffer = await blob.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) return;
        const channel = audioBuffer.getChannelData(0);
        const columns = Math.max(1, Math.round(audioBuffer.duration * PX_PER_SEC));
        const samplesPerColumn = Math.max(1, Math.floor(channel.length / columns));
        const result: number[] = new Array(columns);
        for (let i = 0; i < columns; i++) {
          const start = i * samplesPerColumn;
          const end = Math.min(channel.length, start + samplesPerColumn);
          let max = 0;
          for (let j = start; j < end; j++) {
            const v = Math.abs(channel[j]);
            if (v > max) max = v;
          }
          result[i] = max;
        }
        if (!cancelled) setPeaks(result);
        ctx.close();
      } catch (err) {
        console.error('Failed to decode audio for waveform:', track.id, err);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track.id, track.mimeType, track.duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 120;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#aa3bff';
    ctx.fillStyle = accent;
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1, peaks[i] * (height - 8));
      ctx.fillRect(i, mid - h / 2, 1, h);
    }
  }, [peaks, width]);

  function pixelToTime(clientX: number): number {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left + timelineRef.current.scrollLeft;
    return Math.min(duration, Math.max(0, x / PX_PER_SEC));
  }

  function seek(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function handleWaveformClick(e: React.MouseEvent) {
    seek(pixelToTime(e.clientX));
  }

  function handleTrackMouseDown(e: React.MouseEvent) {
    const t = pixelToTime(e.clientX);
    dragStartRef.current = t;
    setDragRange({ start: t, end: t });
  }

  function handleTrackMouseMove(e: React.MouseEvent) {
    if (dragStartRef.current === null) return;
    setDragRange({ start: dragStartRef.current, end: pixelToTime(e.clientX) });
  }

  function handleTrackMouseUp() {
    if (dragStartRef.current === null || !dragRange) return;
    const startTime = Math.min(dragRange.start, dragRange.end);
    const endTime = Math.max(dragRange.start, dragRange.end);
    dragStartRef.current = null;
    setDragRange(null);
    if (endTime - startTime < 0.05) return;
    setEditing({ mode: 'new', startTime, endTime });
  }

  function saveBlock(data: Omit<DrumBlock, 'id'> & { id?: string }) {
    let nextBlocks: DrumBlock[];
    if (data.id) {
      nextBlocks = blocks.map((b) => (b.id === data.id ? { ...b, ...data, id: b.id } : b));
    } else {
      nextBlocks = [...blocks, { ...data, id: newId() }];
    }
    onUpdate({ ...track, drumBlocks: nextBlocks });
    setEditing(null);
  }

  function deleteBlock(id: string) {
    onUpdate({ ...track, drumBlocks: blocks.filter((b) => b.id !== id) });
    setEditing(null);
  }

  return (
    <div className="page">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1>{track.title}</h1>
      </div>

      <audio
        ref={audioRef}
        src={url || undefined}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || track.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="player-controls">
        <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" />
            </svg>
          )}
        </button>
        <span className="time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <p className="hint">Click the waveform to scrub. Drag on the arrangement track below to add a block.</p>

      <div className="drummer-scroll">
        <div className="drummer-tracks" style={{ width }}>
          {/* Flags overlay, positioned above the waveform */}
          <div className="flags-overlay" style={{ width }}>
            {track.markers.map((m) => (
              <button
                key={m.id}
                className="flag-tag"
                style={{ left: m.time * PX_PER_SEC, background: m.color }}
                onClick={() => seek(m.time)}
                title={m.label}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Waveform */}
          <div className="waveform-row" ref={timelineRef} onClick={handleWaveformClick} style={{ width }}>
            {!peaks && <div className="waveform-loading">Loading waveform…</div>}
            <canvas ref={canvasRef} />
            <div className="playhead" style={{ left: currentTime * PX_PER_SEC }} />
            {track.markers.map((m) => (
              <div key={m.id} className="flag-line" style={{ left: m.time * PX_PER_SEC, background: m.color }} />
            ))}
          </div>

          {/* Drum arrangement track */}
          <div
            className="track-row drum-track"
            style={{ width }}
            onMouseDown={handleTrackMouseDown}
            onMouseMove={handleTrackMouseMove}
            onMouseUp={handleTrackMouseUp}
            onMouseLeave={() => {
              dragStartRef.current = null;
              setDragRange(null);
            }}
          >
            {dragRange && (
              <div
                className="drum-block selecting"
                style={{
                  left: Math.min(dragRange.start, dragRange.end) * PX_PER_SEC,
                  width: Math.abs(dragRange.end - dragRange.start) * PX_PER_SEC,
                }}
              />
            )}
            {blocks.map((block) => (
              <div
                key={block.id}
                className="drum-block"
                style={{
                  left: block.startTime * PX_PER_SEC,
                  width: Math.max(2, (block.endTime - block.startTime) * PX_PER_SEC - 2),
                  background: block.color,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing({ mode: 'edit', block });
                }}
              >
                <div className="drum-block-label">{block.label || '(untitled)'}</div>
                {block.note && <div className="drum-block-note">{block.note}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && editing.mode === 'new' && (
        <BlockEditor
          initial={{ startTime: editing.startTime, endTime: editing.endTime, color: BLOCK_COLORS[0] }}
          onSave={saveBlock}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && editing.mode === 'edit' && (
        <BlockEditor
          initial={editing.block}
          onSave={saveBlock}
          onDelete={() => deleteBlock(editing.block.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
