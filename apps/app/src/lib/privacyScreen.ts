import { Capacitor } from '@capacitor/core'

/**
 * iOS-only screenshot detection.
 *
 * iOS gives no API to *prevent* screenshots (unlike Android's FLAG_SECURE), so
 * the native side (AppDelegate.swift) only listens for
 * `UIApplication.userDidTakeScreenshotNotification` and forwards it to the web
 * layer as a plain `ios-screenshot` window event. The app-switcher blur is also
 * handled natively in AppDelegate and needs no JS.
 *
 * Registers a listener and returns a disposer. No-op off iOS.
 */
export function onScreenshot(handler: () => void): () => void {
  if (Capacitor.getPlatform() !== 'ios') return () => {}
  window.addEventListener('ios-screenshot', handler)
  return () => window.removeEventListener('ios-screenshot', handler)
}
