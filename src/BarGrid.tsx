export const BAR_WIDTH = 64;

interface BarRulerProps {
  totalBars: number;
  beatsPerBar: number;
}

export function BarRuler({ totalBars, beatsPerBar }: BarRulerProps) {
  return (
    <div className="bar-ruler">
      {Array.from({ length: totalBars }, (_, i) => i + 1).map((bar) => (
        <div
          key={bar}
          className={`bar-ruler-cell ${bar % 4 === 1 ? 'bar-group-start' : ''}`}
          style={{ width: BAR_WIDTH }}
        >
          <span className="bar-number">{bar}</span>
          <div className="bar-ticks">
            {Array.from({ length: beatsPerBar }, (_, b) => (
              <span key={b} className="beat-tick" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
