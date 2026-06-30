export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface DrumBlock {
  id: string;
  startTime: number;
  endTime: number;
  color: string;
  label: string;
  note: string;
}

export interface Track {
  id: string;
  title: string;
  order: number;
  duration: number;
  markers: Marker[];
  mimeType?: string;
  drumBlocks?: DrumBlock[];
  bpm?: number;
  beatsPerBar?: number;
  gridOffset?: number;
}
