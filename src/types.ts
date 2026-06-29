export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface Track {
  id: string;
  title: string;
  order: number;
  duration: number;
  markers: Marker[];
}
