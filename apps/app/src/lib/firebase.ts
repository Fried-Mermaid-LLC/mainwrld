import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'

const requireEnv = (key: keyof ImportMetaEnv): string => {
  const value = import.meta.env[key]
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env.local and fill in Firebase config.`
    )
  }
  return value
}

const firebaseConfig = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  // Realtime Database backs presence (onDisconnect). The JS URL and the native
  // GoogleService-Info.plist must point at the SAME RTDB instance/region.
  databaseURL: requireEnv('VITE_FIREBASE_DATABASE_URL'),
}

const app = initializeApp(firebaseConfig)

// Firebase's default `getAuth(app)` opens a hidden iframe pointing at
// <project>.firebaseapp.com to manage session and OAuth redirect state.
// In a Capacitor WKWebView the page lives on `capacitor://localhost`, so
// cross-origin postMessage to that iframe never settles and
// onAuthStateChanged never fires — the splash hangs forever.
//
// `initializeAuth` lets us skip the iframe by picking an explicit
// persistence and *not* registering a popup/redirect resolver (the app
// only uses email + password auth, no Google/Apple OAuth, so the
// resolver is unused). IndexedDB works in both WKWebView and modern
// browsers; browserLocalPersistence is the fallback.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})

// Offline-first Firestore: persist the cache to IndexedDB so repeat launches
// hydrate instantly from local data while the network catches up in the
// background. This is the main win for cold-start latency on the listings.
// `persistentMultipleTabManager` keeps multiple browser tabs consistent.
//
// IndexedDB can be unavailable (private mode, locked DB, some WebViews) — in
// that case initializeFirestore throws, so we fall back to the in-memory
// default rather than letting the whole app fail to start.
const initFirestore = (): Firestore => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch (err) {
    console.warn('[MainWRLD] Persistent Firestore cache unavailable:', err)
    return getFirestore(app)
  }
}

export const db = initFirestore()
export const storage = getStorage(app)
// Realtime Database — used only for presence (.info/connected + onDisconnect).
export const rtdb = getDatabase(app)
export default app
