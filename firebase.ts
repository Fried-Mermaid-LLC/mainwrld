import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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

export const db = getFirestore(app)
export default app
