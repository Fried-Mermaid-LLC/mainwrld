// Boot guard — runs as the VERY FIRST import in main.tsx, before App (and
// therefore lib/firebase.ts) is evaluated. ES module import side-effects run
// in source order, so everything here executes even if a later import throws
// at evaluation time (e.g. a missing VITE_FIREBASE_* env var makes requireEnv
// throw in lib/firebase.ts). In that case React never mounts and AppShell's
// splash-dismiss effects never run — with the native splash configured
// launchAutoHide:false, the app would hang on the splash forever (this is the
// exact TestFlight failure mode). The timer scheduled below is already pending
// by then, so it still fires and dismisses the splash, turning an invisible
// boot crash into a visible, logged error instead of a frozen splash.

import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics'

const isNative = Capacitor.isNativePlatform()

// Render a minimal, dependency-free fallback if the app fails to mount. Uses
// inline styles only: index.css is imported AFTER ./App in main.tsx, so on an
// import-time crash no stylesheet is loaded.
function showBootError(detail: string): void {
  const root = document.getElementById('root')
  if (!root || root.childElementCount > 0) return
  root.innerHTML =
    '<div style="position:fixed;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:12px;padding:24px;' +
    'font-family:-apple-system,system-ui,sans-serif;text-align:center;' +
    'background:#fff;color:#111">' +
    '<div style="font-size:15px;font-weight:700">Couldn’t start the app</div>' +
    '<div style="font-size:12px;color:#888;max-width:280px;line-height:1.5">' +
    'Please close and reopen MainWRLD. If it keeps happening, update to the ' +
    'latest version.</div>' +
    '<div style="font-size:10px;color:#ccc;max-width:280px;word-break:break-word">' +
    detail +
    '</div></div>'
}

function report(message: string, stack: string): void {
  // Forward to Crashlytics on native so an otherwise-silent import/boot crash
  // is actually visible in crash reports. recordException's `stacktrace` field
  // wants a parsed StackFrame[] (stacktrace.js), which we don't have, so fold
  // the raw stack into the message. Wrapped in catch so a Crashlytics failure
  // never cascades into the error path it's reporting.
  if (isNative) {
    FirebaseCrashlytics.recordException({
      message: stack ? `${message}\n${stack}` : message,
    }).catch(() => {})
  }
}

// Registered first so import-time throws in later modules are captured —
// main.tsx's module body never runs when an import throws, so error handlers
// can only be relied upon if they live here, ahead of the App import.
window.addEventListener('error', (event) => {
  report(event.message, event.error?.stack ?? '')
  showBootError(event.message || 'startup error')
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = (event as PromiseRejectionEvent).reason
  report(
    `Unhandled promise rejection: ${reason?.message ?? String(reason)}`,
    reason?.stack ?? ''
  )
})

// Native-only splash backstop. Sits just past AppShell's 8s failsafe so the
// normal path (React mounts, AppShell hides on navigation) wins; this only
// matters when React never mounted, in which case it's the sole way to clear
// the splash. Hiding an already-hidden splash is a harmless no-op.
if (isNative) {
  window.setTimeout(() => {
    SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
  }, 10000)
}
