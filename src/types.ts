export interface LyricBar {
  bar: number;
  text: string;
}

export interface DrumBlock {
  id: string;
  startBar: number;
  lengthBars: number;
  color: string;
  label: string;
  note: string;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  beatsPerBar: number;
  totalBars: number;
  lyrics: LyricBar[];
  drumBlocks: DrumBlock[];
}
