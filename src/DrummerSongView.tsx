import { useEffect, useRef, useState } from 'react';
import type { DrumBlock, Track } from './types';
import { getBlob, newId } from './storage';
import BlockEditor, { BLOCK_COLORS } from './BlockEditor';

const PX_PER_SEC = 80;
const DEFAULT_BEATS_PER_BAR = 4;

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export default function DrummerSongView({ track, onBack, onUpdate }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(track.duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragRange, setDragRange] = useState<{ start: number; end: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const [resizing, setResizing] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ id: string; startTime: number; endTime: number } | null>(null);
  const [editing, setEditing] = useState<
    | { mode: 'new'; startTime: number; endTime: number }
    | { mode: 'edit'; block: DrumBlock }
    | null
  >(null);

  const bpm = track.bpm ?? null;
  const beatsPerBar = track.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
  const gridOffset = track.gridOffset ?? 0;
  const [bpmDraft, setBpmDraft] = useState(bpm ? String(bpm) : '');
  const [beatsDraft, setBeatsDraft] = useState(String(beatsPerBar));
  const tapTimesRef = useRef<number[]>([]);
  const [tapCount, setTapCount] = useState(0);

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

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  // Track the scroller's width so the playhead can be pinned at its
  // horizontal center while the waveform/drum track scroll underneath it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Keeps the playhead fixed at the horizontal center of the viewport while
  // playback progresses, by sliding the track content underneath it instead
  // - clamped so the content doesn't scroll past its own start/end edges.
  const trackOffset = clamp(containerWidth / 2 - currentTime * PX_PER_SEC, Math.min(0, containerWidth - width), 0);

  const beatInterval = bpm ? 60 / bpm : null;
  const barInterval = beatInterval ? beatInterval * beatsPerBar : null;
  const gridLines: { time: number; isBar: boolean }[] = [];
  if (beatInterval && barInterval) {
    const firstBeatIndex = Math.ceil((0 - gridOffset) / beatInterval);
    for (let n = firstBeatIndex; ; n++) {
      const t = gridOffset + n * beatInterval;
      if (t > duration) break;
      if (t < 0) continue;
      const barsFromOffset = Math.round((t - gridOffset) / barInterval);
      const isBar = Math.abs(t - (gridOffset + barsFromOffset * barInterval)) < 0.01;
      gridLines.push({ time: t, isBar });
    }
  }

  function pixelToTime(clientX: number): number {
    if (!scrollRef.current) return 0;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = clientX - rect.left - trackOffset;
    return clamp(x / PX_PER_SEC, 0, duration);
  }

  function snapToBeat(time: number): number {
    if (!beatInterval) return time;
    const n = Math.round((time - gridOffset) / beatInterval);
    return clamp(gridOffset + n * beatInterval, 0, duration);
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

  // Drag-resize an existing block's edge. Listens on window so the drag
  // keeps tracking even if the cursor leaves the block/track while dragging.
  useEffect(() => {
    if (!resizing) return;
    const original = blocks.find((b) => b.id === resizing.id);
    if (!original) return;

    function onMove(e: MouseEvent) {
      const t = snapToBeat(pixelToTime(e.clientX));
      if (resizing!.edge === 'start') {
        setResizePreview({ id: resizing!.id, startTime: Math.min(t, original!.endTime - 0.05), endTime: original!.endTime });
      } else {
        setResizePreview({ id: resizing!.id, startTime: original!.startTime, endTime: Math.max(t, original!.startTime + 0.05) });
      }
    }

    function onUp() {
      setResizePreview((preview) => {
        if (preview) {
          const nextBlocks = blocks.map((b) =>
            b.id === preview.id ? { ...b, startTime: preview.startTime, endTime: preview.endTime } : b
          );
          onUpdate({ ...track, drumBlocks: nextBlocks });
        }
        return null;
      });
      setResizing(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  function handleTrackMouseDown(e: React.MouseEvent) {
    const t = snapToBeat(pixelToTime(e.clientX));
    dragStartRef.current = t;
    setDragRange({ start: t, end: t });
  }

  function handleTrackMouseMove(e: React.MouseEvent) {
    if (dragStartRef.current === null) return;
    setDragRange({ start: dragStartRef.current, end: snapToBeat(pixelToTime(e.clientX)) });
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

  function applyManualTempo() {
    const parsedBpm = parseFloat(bpmDraft);
    const parsedBeats = parseInt(beatsDraft, 10);
    if (!isFinite(parsedBpm) || parsedBpm <= 0) return;
    onUpdate({
      ...track,
      bpm: parsedBpm,
      beatsPerBar: isFinite(parsedBeats) && parsedBeats > 0 ? parsedBeats : DEFAULT_BEATS_PER_BAR,
      gridOffset: track.gridOffset ?? 0,
    });
  }

  function handleTap() {
    const now = performance.now();
    const audioTime = audioRef.current?.currentTime ?? currentTime;
    tapTimesRef.current = [...tapTimesRef.current, now].slice(-8);
    setTapCount(tapTimesRef.current.length);
    const taps = tapTimesRef.current;
    if (taps.length < 2) return;
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const detectedBpm = Math.round((60000 / avgMs) * 10) / 10;
    setBpmDraft(String(detectedBpm));
    onUpdate({
      ...track,
      bpm: detectedBpm,
      beatsPerBar: track.beatsPerBar ?? DEFAULT_BEATS_PER_BAR,
      gridOffset: audioTime,
    });
  }

  function resetTaps() {
    tapTimesRef.current = [];
    setTapCount(0);
  }

  function clearTempo() {
    resetTaps();
    setBpmDraft('');
    onUpdate({ ...track, bpm: undefined, beatsPerBar: undefined, gridOffset: undefined });
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
        <button
          className={`mute-btn ${muted ? 'active' : ''}`}
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <span className="time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="tempo-panel">
        <span className="tempo-label">Tempo</span>
        <input
          className="tempo-input"
          type="number"
          min={1}
          placeholder="BPM"
          value={bpmDraft}
          onChange={(e) => setBpmDraft(e.target.value)}
          onBlur={applyManualTempo}
          onKeyDown={(e) => e.key === 'Enter' && applyManualTempo()}
        />
        <span className="tempo-x">×</span>
        <input
          className="tempo-input beats"
          type="number"
          min={1}
          value={beatsDraft}
          onChange={(e) => setBeatsDraft(e.target.value)}
          onBlur={applyManualTempo}
          onKeyDown={(e) => e.key === 'Enter' && applyManualTempo()}
        />
        <span className="tempo-x">beats/bar</span>
        <button onClick={handleTap}>Tap tempo{tapCount > 0 ? ` (${tapCount})` : ''}</button>
        {bpm && (
          <button onClick={clearTempo} className="danger">
            Clear grid
          </button>
        )}
      </div>

      <p className="hint">
        Click the waveform to scrub. Drag on the drum track below to add a segment
        {bpm ? ' - it snaps to the beat grid.' : '.'}
      </p>

      <div className="drummer-scroll" ref={scrollRef}>
        <div className="playhead" />
        <div className="drummer-tracks" style={{ width, transform: `translateX(${trackOffset}px)` }}>
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

          <div className="waveform-row" onClick={handleWaveformClick} style={{ width }}>
            {!peaks && <div className="waveform-loading">Loading waveform…</div>}
            <canvas ref={canvasRef} />
            {track.markers.map((m) => (
              <div key={m.id} className="flag-line" style={{ left: m.time * PX_PER_SEC, background: m.color }} />
            ))}
            {gridLines.map((g) => (
              <div
                key={g.time}
                className={`grid-line ${g.isBar ? 'bar' : 'beat'}`}
                style={{ left: g.time * PX_PER_SEC }}
              />
            ))}
            {blocks.map((block) => {
              const b = resizePreview?.id === block.id ? resizePreview : block;
              return (
                <div key={block.id}>
                  <div className="block-guide-line" style={{ left: b.startTime * PX_PER_SEC }} />
                  <div className="block-guide-line" style={{ left: b.endTime * PX_PER_SEC }} />
                </div>
              );
            })}
          </div>

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
            {gridLines.map((g) => (
              <div
                key={g.time}
                className={`grid-line ${g.isBar ? 'bar' : 'beat'}`}
                style={{ left: g.time * PX_PER_SEC }}
              />
            ))}
            {blocks.map((block) => {
              const b = resizePreview?.id === block.id ? resizePreview : block;
              return (
                <div key={block.id}>
                  <div className="block-guide-line" style={{ left: b.startTime * PX_PER_SEC }} />
                  <div className="block-guide-line" style={{ left: b.endTime * PX_PER_SEC }} />
                </div>
              );
            })}
            {dragRange && (
              <div
                className="drum-block selecting"
                style={{
                  left: Math.min(dragRange.start, dragRange.end) * PX_PER_SEC,
                  width: Math.abs(dragRange.end - dragRange.start) * PX_PER_SEC,
                }}
              />
            )}
            {blocks.map((block) => {
              const b = resizePreview?.id === block.id ? resizePreview : block;
              return (
                <div
                  key={block.id}
                  className="drum-block"
                  style={{
                    left: b.startTime * PX_PER_SEC,
                    width: Math.max(2, (b.endTime - b.startTime) * PX_PER_SEC - 2),
                    background: block.color,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!resizing) setEditing({ mode: 'edit', block });
                  }}
                >
                  <div
                    className="block-handle left"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setResizing({ id: block.id, edge: 'start' });
                    }}
                  />
                  <div className="drum-block-label">{block.label || '(untitled)'}</div>
                  {block.note && <div className="drum-block-note">{block.note}</div>}
                  <div
                    className="block-handle right"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setResizing({ id: block.id, edge: 'end' });
                    }}
                  />
                </div>
              );
            })}
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
