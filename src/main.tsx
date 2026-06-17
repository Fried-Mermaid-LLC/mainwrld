import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
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

// On Capacitor we need to hide the native splash explicitly and pick a
// status-bar style that contrasts with the bg-white app shell. Both APIs
// are no-ops on web, so the guard is just a fast bail-out.
if (Capacitor.isNativePlatform()) {
  // Give React one paint to mount the splash view so the native splash
  // cross-fades into the React splash instead of flashing to blank.
  requestAnimationFrame(() => {
    SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
    StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  })
}
