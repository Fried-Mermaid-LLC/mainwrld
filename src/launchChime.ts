// Launch chime — plays sky-piano-jingle.wav once while the splash is up.
//
// Why native-audio and not `new Audio().play()`: on a cold start there is no
// user gesture, and iOS WKWebView (like every browser) blocks audio autoplay
// without one — so a WebView-side play() is rejected exactly on the native
// launch path that matters. @capacitor-community/native-audio plays through
// AVAudioPlayer, which is not subject to the WebView autoplay policy, so the
// chime is reliable on a cold native launch. Web has no such escape hatch, so
// there it degrades to an HTML5 Audio armed on the first gesture.

import { Capacitor } from '@capacitor/core'

const ASSET_ID = 'launchChime'

// iOS: Capacitor copies the web `public/` folder into the app bundle as a
// folder reference, so the wav lives at `<App>.app/public/music/...`. The
// plugin resolves the path via Bundle.main.path(forResource:ofType:) after
// splitting assetPath on '.', so it must be a single-dot path pointing inside
// `public/` (sky-piano-jingle.wav has exactly one dot — fine).
const NATIVE_ASSET_PATH = 'public/music/sky-piano-jingle.wav'
const WEB_ASSET_PATH = '/music/sky-piano-jingle.wav'

let started = false

export function playLaunchChime(): void {
  if (started) return
  started = true
  if (Capacitor.isNativePlatform()) {
    void playNative()
  } else {
    playWeb()
  }
}

async function playNative(): Promise<void> {
  try {
    const { NativeAudio } = await import('@capacitor-community/native-audio')
    // focus:false → AVAudioSession `.ambient`: respects the hardware mute
    // switch and MIXES with the user's existing audio (Spotify etc.) instead
    // of interrupting it. A launch jingle must never hijack the audio session.
    await NativeAudio.configure({ focus: false, fade: false })
    await NativeAudio.preload({
      assetId: ASSET_ID,
      assetPath: NATIVE_ASSET_PATH,
      audioChannelNum: 1,
      isUrl: false,
    })
    await NativeAudio.play({ assetId: ASSET_ID })
  } catch {
    // Fail-soft: a missing asset or a re-preload must never break launch.
  }
}

function playWeb(): void {
  const attempt = (): boolean => {
    try {
      const audio = new Audio(WEB_ASSET_PATH)
      audio.play().catch(() => {})
      return true
    } catch {
      return false
    }
  }
  // Try immediately (works if the tab already had a gesture, e.g. a returning
  // PWA). If the browser blocks it, arm a one-shot gesture listener so the
  // chime plays on the user's first interaction instead of being lost.
  attempt()
  const onGesture = () => {
    attempt()
    window.removeEventListener('pointerdown', onGesture)
    window.removeEventListener('keydown', onGesture)
  }
  window.addEventListener('pointerdown', onGesture, { once: true })
  window.addEventListener('keydown', onGesture, { once: true })
}
