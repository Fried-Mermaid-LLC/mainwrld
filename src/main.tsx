import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics'
import App from './App'
import './index.css'

// On Capacitor native, forward uncaught JS errors to Firebase Crashlytics
// so they show up alongside native crashes. The plugin is a no-op on web,
// and we wrap each call in a catch so a Crashlytics failure never cascades
// into the error path it's reporting. Native crashes (memory, threading,
// IAP/Firebase native code) are auto-collected by the SDK after
// FirebaseApp.configure() in AppDelegate — this only adds the JS layer.
if (Capacitor.isNativePlatform()) {
  window.addEventListener('error', (event) => {
    FirebaseCrashlytics.recordException({
      message: event.message,
      stacktrace: event.error?.stack ?? '',
    }).catch(() => {})
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    FirebaseCrashlytics.recordException({
      message: `Unhandled promise rejection: ${reason?.message ?? String(reason)}`,
      stacktrace: reason?.stack ?? '',
    }).catch(() => {})
  })
}

// Shared-book deep links on native (F09). The bundled iOS app loads from
// capacitor://localhost, so window.location is never the tapped share URL — a
// Universal Link tap (`https://mainwrld-f7acf.web.app/book/<id>`) arrives here
// instead. Stash the id where resolveInitialView reads it (cold start) AND
// dispatch an event the AppProvider listens for (warm tap). Registered before
// React mounts so a cold-start tap is captured even if it fires early.
// Universal Links are fully configured: the apple-app-site-association is
// hosted (public/.well-known/) and App.entitlements carries the Associated
// Domains key (applinks:mainwrld-f7acf.web.app), granted by the MainWRLD
// provisioning profile. So an installed app receives the tap here; without the
// app installed the link falls back to the Safari web preview.
if (Capacitor.isNativePlatform()) {
  CapApp.addListener('appUrlOpen', ({ url }) => {
    try {
      const m = new URL(url).pathname.match(/^\/book\/([A-Za-z0-9_-]+)$/)
      if (m) {
        try {
          sessionStorage.setItem('pendingShareBookId', m[1])
        } catch {}
        window.dispatchEvent(
          new CustomEvent('mainwrld:open-book', { detail: m[1] })
        )
      }
    } catch {}
  }).catch(() => {})
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Could not find root element to mount to')
}

const root = ReactDOM.createRoot(rootElement)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// On Capacitor we hide the native splash explicitly and pick a status-bar
// style that contrasts with the bg-white app shell. Both APIs are no-ops on
// web, so the guard is just a fast bail-out.
//
// The native splash MUST be dismissed unconditionally here, one paint after
// React mounts — NOT left up until auth resolves. With launchAutoHide:false
// the native splash never self-dismisses, so tying its removal to the auth
// listener (which awaits Firestore over the network) means any slow/hung
// request on a cold iOS start strands the app on the splash forever. The
// `splash` view renders a React placeholder (logo on white) underneath, so
// the hand-off is still flash-free while auth resolves.
if (Capacitor.isNativePlatform()) {
  requestAnimationFrame(() => {
    SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
    StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  })
}
