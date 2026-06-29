import { useState } from 'react';
import { BAR_WIDTH } from './BarGrid';
import type { DrumBlock } from './types';
import BlockEditor, { BLOCK_COLORS } from './BlockEditor';
import { newId } from './storage';

interface Props {
  totalBars: number;
  blocks: DrumBlock[];
  onChange: (blocks: DrumBlock[]) => void;
}

export default function DrumTrack({ totalBars, blocks, onChange }: Props) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [editing, setEditing] = useState<
    | { mode: 'new'; startBar: number; lengthBars: number }
    | { mode: 'edit'; block: DrumBlock }
    | null
  >(null);

  function barFromIndex(i: number) {
    return i + 1;
  }

  function handleMouseDown(bar: number) {
    setDragStart(bar);
    setDragEnd(bar);
  }

  function handleMouseEnter(bar: number) {
    if (dragStart !== null) setDragEnd(bar);
  }

  function handleMouseUp() {
    if (dragStart !== null && dragEnd !== null) {
      const startBar = Math.min(dragStart, dragEnd);
      const lengthBars = Math.abs(dragEnd - dragStart) + 1;
      setEditing({ mode: 'new', startBar, lengthBars });
    }
    setDragStart(null);
    setDragEnd(null);
  }

  function saveBlock(data: Omit<DrumBlock, 'id'> & { id?: string }) {
    if (data.id) {
      onChange(blocks.map((b) => (b.id === data.id ? { ...b, ...data, id: b.id } : b)));
    } else {
      onChange([...blocks, { ...data, id: newId() }]);
    }
    setEditing(null);
  }

  function deleteBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
    setEditing(null);
  }

  const selecting =
    dragStart !== null && dragEnd !== null
      ? { start: Math.min(dragStart, dragEnd), end: Math.max(dragStart, dragEnd) }
      : null;

  return (
    <div className="track-row drum-track" onMouseUp={handleMouseUp} onMouseLeave={() => setDragStart(null)}>
      {Array.from({ length: totalBars }, (_, i) => barFromIndex(i)).map((bar) => (
        <div
          key={bar}
          className={`drum-cell ${bar % 4 === 1 ? 'bar-group-start' : ''} ${
            selecting && bar >= selecting.start && bar <= selecting.end ? 'selecting' : ''
          }`}
          style={{ width: BAR_WIDTH }}
          onMouseDown={() => handleMouseDown(bar)}
          onMouseEnter={() => handleMouseEnter(bar)}
        />
      ))}

      {blocks.map((block) => (
        <div
          key={block.id}
          className="drum-block"
          style={{
            left: (block.startBar - 1) * BAR_WIDTH,
            width: block.lengthBars * BAR_WIDTH - 2,
            background: block.color,
          }}
          onClick={() => setEditing({ mode: 'edit', block })}
        >
          <div className="drum-block-label">{block.label || '(untitled)'}</div>
          {block.note && <div className="drum-block-note">{block.note}</div>}
        </div>
      ))}

      {editing && editing.mode === 'new' && (
        <BlockEditor
          initial={{ startBar: editing.startBar, lengthBars: editing.lengthBars, color: BLOCK_COLORS[0] }}
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
