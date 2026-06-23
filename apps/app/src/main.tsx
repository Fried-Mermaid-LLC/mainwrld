// MUST be the first import: registers error handlers + a native splash
// backstop as import side-effects, BEFORE ./App (→ lib/firebase.ts) evaluates.
// If a later import throws (e.g. a missing VITE_ env var), this is the only
// code guaranteed to have run, so it's what prevents an invisible frozen-splash
// boot crash. See bootGuard.ts.
import './bootGuard'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from './App'
import { playLaunchChime } from './launchChime'
import './index.css'

// Shared-book deep links on native (F09). The bundled iOS app loads from
// capacitor://localhost, so window.location is never the tapped share URL — a
// Universal Link tap (`https://mainwrld.com/book/<id>`) arrives here instead.
// Stash the id where resolveInitialView reads it (cold start) AND dispatch an
// event the AppProvider listens for (warm tap). Registered before React mounts
// so a cold-start tap is captured even if it fires early. Universal Links are
// fully configured: the apple-app-site-association is hosted (public/.well-known/)
// and App.entitlements carries the Associated Domains key (applinks:mainwrld.com),
// granted by the MainWRLD provisioning profile. So an installed app receives the
// tap here; without the app installed the link falls back to the Safari web
// preview. Legacy web.app links open only via that web preview (not listed in
// applinks).
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

// Fire the launch jingle as early as possible so it overlaps the splash. On
// native this plays through AVAudioPlayer (immune to WebView autoplay rules);
// on web it arms on the first gesture. Fail-soft — never blocks the launch.
playLaunchChime()

// On Capacitor we pick a status-bar style that contrasts with the bg-white
// app shell. No-op on web, so the guard is just a fast bail-out. The native
// splash is NOT hidden here — it stays up through the `splash` view and is
// dismissed by AppShell once auth resolves and the app navigates away (with a
// failsafe timer in AppShell so it can never hang if auth stalls).
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
}
