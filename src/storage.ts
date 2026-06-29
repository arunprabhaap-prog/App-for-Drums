import { useEffect, useState } from 'react';
import type { Song } from './types';

const STORAGE_KEY = 'drum-arrangement-songs';

function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Song[];
  } catch {
    return [];
  }
}

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>(loadSongs);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  }, [songs]);

  return { songs, setSongs };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
