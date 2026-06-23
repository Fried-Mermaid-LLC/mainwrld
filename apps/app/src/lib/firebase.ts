import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth'

// Firebase is now used ONLY for Auth (login/signup/session/reset). All data
// access (Firestore/Storage/RTDB) and callables moved to the NestJS API — see
// services/api/* + apiClient/sseClient. Native FCM/Crashlytics use the
// @capacitor-firebase plugins + GoogleService-Info.plist, not this JS config.

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

// `initializeAuth` (not getAuth) skips the hidden cross-origin iframe that hangs
// onAuthStateChanged in a Capacitor WKWebView. IndexedDB persistence works in
// both WKWebView and modern browsers; browserLocalPersistence is the fallback.
// The app only uses email+password auth, so no popup/redirect resolver is needed.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})

export default app
