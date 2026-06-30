import { useState } from 'react';
import type { DrumBlock } from './types';

export const BLOCK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
];

function formatTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

interface Props {
  initial: Pick<DrumBlock, 'startTime' | 'endTime'> & Partial<DrumBlock>;
  onSave: (block: Omit<DrumBlock, 'id'> & { id?: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function BlockEditor({ initial, onSave, onDelete, onClose }: Props) {
  const [color, setColor] = useState(initial.color ?? BLOCK_COLORS[0]);
  const [label, setLabel] = useState(initial.label ?? '');
  const [note, setNote] = useState(initial.note ?? '');

  function handleSave() {
    onSave({
      id: initial.id,
      startTime: initial.startTime,
      endTime: initial.endTime,
      color,
      label,
      note,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {formatTime(initial.startTime)} – {formatTime(initial.endTime)}
        </h3>

        <label className="modal-field">
          Label
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Verse groove"
          />
        </label>

        <label className="modal-field">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Drum pattern, fills, dynamics..."
            rows={3}
          />
        </label>

        <div className="modal-field">
          <span>Color</span>
          <div className="color-swatches">
            {BLOCK_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${c === color ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          {onDelete && (
            <button className="danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <div className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
