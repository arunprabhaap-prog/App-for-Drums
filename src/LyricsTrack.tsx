import { BAR_WIDTH } from './BarGrid';
import type { LyricBar } from './types';

interface Props {
  totalBars: number;
  lyrics: LyricBar[];
  onChange: (lyrics: LyricBar[]) => void;
}

export default function LyricsTrack({ totalBars, lyrics, onChange }: Props) {
  const lyricMap = new Map(lyrics.map((l) => [l.bar, l.text]));

  function setText(bar: number, text: string) {
    const next = lyrics.filter((l) => l.bar !== bar);
    if (text.trim()) next.push({ bar, text });
    next.sort((a, b) => a.bar - b.bar);
    onChange(next);
  }

  return (
    <div className="track-row lyrics-track">
      {Array.from({ length: totalBars }, (_, i) => i + 1).map((bar) => (
        <div
          key={bar}
          className={`lyric-cell ${bar % 4 === 1 ? 'bar-group-start' : ''}`}
          style={{ width: BAR_WIDTH }}
        >
          <input
            value={lyricMap.get(bar) ?? ''}
            placeholder="·"
            onChange={(e) => setText(bar, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
