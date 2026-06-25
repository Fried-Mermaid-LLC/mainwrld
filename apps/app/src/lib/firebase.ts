import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
} from 'firebase/auth'
import { getDatabase, connectDatabaseEmulator } from 'firebase/database'

// Firebase is used for Auth (login/signup/session/reset) and — re-introduced for
// the realtime 3D world layer — the Realtime Database. RTDB carries ONLY the
// ephemeral world state under /world/{uid} (position, rotation, activity, emote)
// with onDisconnect cleanup; everything else (Firestore/Storage/callables) still
// goes through the NestJS API — see services/api/* + apiClient/sseClient. Native
// FCM/Crashlytics use the @capacitor-firebase plugins + GoogleService-Info.plist.

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

// Realtime Database for the world layer. Optional: when VITE_FIREBASE_DATABASE_URL
// is unset, rtdb is null and the world layer disables itself (worldService no-ops)
// so the rest of the app is unaffected. getDatabase reuses this app's authed user,
// so the ID token rides the websocket automatically — gate world ops on a resolved
// firebaseUid or the first writes hit `auth == null` and are rejected by the rules.
const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL
export const rtdb = databaseURL ? getDatabase(app, databaseURL) : null

// Local dev against the Firebase RTDB emulator (web only — on a device 127.0.0.1
// is the device, not your Mac). Opt-in via VITE_USE_FIREBASE_EMULATORS so normal
// dev still hits the real instance.
if (
  rtdb &&
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
) {
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000)
}

export default app
