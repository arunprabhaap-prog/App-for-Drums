import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyD-QW_qQB67QPwGoZWNC20PrF9jZ6WDZic',
  authDomain: 'aarpo-setlist-3cfe0.firebaseapp.com',
  projectId: 'aarpo-setlist-3cfe0',
  storageBucket: 'aarpo-setlist-3cfe0.firebasestorage.app',
  messagingSenderId: '11996317236',
  appId: '1:11996317236:web:069d484dd907573a19ac61',
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const storage = getStorage(app);
const auth = getAuth(app);

export const authReady: Promise<void> = new Promise((resolve) => {
  const timeout = setTimeout(() => {
    console.error('Anonymous sign-in timed out after 10s');
    resolve();
  }, 10000);
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    } else {
      signInAnonymously(auth).catch((err) => {
        console.error('Anonymous sign-in failed:', err.code, err.message);
        clearTimeout(timeout);
        resolve();
      });
    }
  });
});
