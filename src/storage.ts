import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import type { Track } from './types';
import { authReady, db, storage } from './firebase';

const META_KEY = 'drum-tracks-meta';
const DB_NAME = 'drum-tracks-db';
const STORE_NAME = 'blobs';
const TRACKS_COLLECTION = 'tracks';

function loadCachedTracks(): Track[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Track[];
  } catch {
    return [];
  }
}

export function useTracks(): { tracks: Track[]; setTracks: Dispatch<SetStateAction<Track[]>> } {
  const [tracks, setTracksState] = useState<Track[]>(loadCachedTracks);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    authReady.then(() => {
      unsubscribe = onSnapshot(
        collection(db, TRACKS_COLLECTION),
        (snapshot) => {
          const remote = snapshot.docs.map((d) => d.data() as Track);
          setTracksState(remote);
          localStorage.setItem(META_KEY, JSON.stringify(remote));
        },
        (err) => console.error('Firestore sync error:', err.code, err.message),
      );
    });
    return () => unsubscribe?.();
  }, []);

  const setTracks: Dispatch<SetStateAction<Track[]>> = (value) => {
    const next = typeof value === 'function' ? (value as (prev: Track[]) => Track[])(tracksRef.current) : value;
    const prevIds = new Set(tracksRef.current.map((t) => t.id));
    const nextIds = new Set(next.map((t) => t.id));

    setTracksState(next);
    localStorage.setItem(META_KEY, JSON.stringify(next));

    authReady.then(() => {
      next.forEach((track) => {
        try {
          setDoc(doc(db, TRACKS_COLLECTION, track.id), track).catch((err) =>
            console.error('Firestore write error:', err),
          );
        } catch (err) {
          console.error('Firestore write error:', err);
        }
      });
      prevIds.forEach((id) => {
        if (!nextIds.has(id)) {
          try {
            deleteDoc(doc(db, TRACKS_COLLECTION, id)).catch((err) =>
              console.error('Firestore delete error:', err),
            );
          } catch (err) {
            console.error('Firestore delete error:', err);
          }
        }
      });
    });
  };

  return { tracks, setTracks };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function hasLocalBlob(id: string): Promise<boolean> {
  const idb = await openDb();
  const count = await new Promise<number>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  idb.close();
  return count > 0;
}

async function putLocalBlob(id: string, blob: Blob): Promise<void> {
  const idb = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
}

// uploadBytesResumable reads the File/Blob across multiple chunked requests,
// which trips Chrome's net::ERR_UPLOAD_FILE_CHANGED safety check whenever the
// OS reports any metadata change between reads (cloud-synced folders like
// OneDrive/Dropbox touching the file, antivirus scans, etc). uploadBytes
// reads the file exactly once and avoids this entirely, so we use it with a
// generous, file-size-scaled timeout instead (assumes a conservative 100kB/s
// minimum so large files on slow connections aren't killed prematurely).
function uploadTimeoutFor(blob: Blob): number {
  return Math.max(30000, (blob.size / (100 * 1024)) * 1000);
}

function uploadWithTimeout(path: string, blob: Blob): Promise<void> {
  return Promise.race([
    uploadBytes(ref(storage, path), blob).then(() => {}),
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error('Upload timed out - check your network connection')),
        uploadTimeoutFor(blob),
      ),
    ),
  ]);
}

export async function saveBlob(
  id: string,
  blob: Blob,
  onSynced?: (ok: boolean, error?: string) => void,
): Promise<void> {
  await putLocalBlob(id, blob);
  uploadBlobInBackground(id, blob, onSynced);
}

function uploadBlobInBackground(id: string, blob: Blob, onSynced?: (ok: boolean, error?: string) => void): void {
  authReady
    .then(() => uploadWithTimeout(`audio/${id}`, blob))
    .then(() => onSynced?.(true))
    .catch((err) => {
      console.error('Storage upload error:', err);
      onSynced?.(false, err?.code || err?.message || String(err));
    });
}

// getBytes has no built-in timeout (unlike uploadBytes, which we already wrap),
// so a stalled connection leaves callers hanging forever. Cap it generously,
// scaled to a conservative 100kB/s minimum, matching the upload timeout logic.
const DOWNLOAD_TIMEOUT_MS = 60000;

function downloadWithTimeout(path: string): Promise<ArrayBuffer> {
  return Promise.race([
    getBytes(ref(storage, path)),
    new Promise<ArrayBuffer>((_, reject) =>
      setTimeout(
        () => reject(new Error('Download timed out - check your network connection')),
        DOWNLOAD_TIMEOUT_MS,
      ),
    ),
  ]);
}

function normalizeBlob(bytes: ArrayBuffer, mimeType?: string): Blob {
  // audio/x-m4a is a non-standard alias that some browsers' media pipelines
  // refuse to decode for a Blob reconstructed from raw bytes (no filename
  // hint, unlike a locally-picked File) - normalize to the standard mp4 type.
  const normalizedType = mimeType === 'audio/x-m4a' ? 'audio/mp4' : mimeType || 'audio/mpeg';
  return new Blob([bytes], { type: normalizedType });
}

export async function getBlob(id: string, mimeType?: string): Promise<Blob | undefined> {
  const idb = await openDb();
  const local = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  idb.close();
  if (local) return local.type ? local : new Blob([local], { type: mimeType || 'audio/mpeg' });

  await authReady;
  const bytes = await downloadWithTimeout(`audio/${id}`);
  const blob = normalizeBlob(bytes, mimeType);
  await putLocalBlob(id, blob);
  return blob;
}

// Forces a fresh download from Cloud Storage, bypassing any local IndexedDB
// cache (unlike getBlob, which returns the cached copy if present). Used by
// the manual "Sync tracks" button to actually fetch tracks uploaded from
// other devices instead of silently no-op'ing on an already-cached id.
export async function syncBlob(id: string, mimeType?: string): Promise<Blob> {
  await authReady;
  const bytes = await downloadWithTimeout(`audio/${id}`);
  const blob = normalizeBlob(bytes, mimeType);
  await putLocalBlob(id, blob);
  return blob;
}

// One-time repair pass: re-upload any locally-cached blob whose cloud
// upload may have failed/been interrupted previously (fire-and-forget
// uploads before this was fixed to be awaited).
export async function resyncLocalBlobs(tracks: Track[]): Promise<void> {
  await authReady;
  for (const track of tracks) {
    try {
      const idb = await openDb();
      const blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(track.id);
        req.onsuccess = () => resolve(req.result as Blob | undefined);
        req.onerror = () => reject(req.error);
      });
      idb.close();
      if (blob) {
        await uploadWithTimeout(`audio/${track.id}`, blob);
      }
    } catch (err) {
      console.error('Resync upload error:', track.id, err);
    }
  }
}

export async function deleteBlob(id: string): Promise<void> {
  const idb = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
  try {
    await authReady;
    await deleteObject(ref(storage, `audio/${id}`));
  } catch (err) {
    console.error('Storage delete error:', err);
  }
}
