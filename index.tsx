import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from './App'
import './index.css'

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
