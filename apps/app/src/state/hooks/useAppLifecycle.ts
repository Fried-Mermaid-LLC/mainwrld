import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import * as presenceService from '@/services/presenceService'

// Native foreground/background presence (X06). The iOS WKWebView does not fire
// beforeunload/pagehide on background or force-quit, so we proactively flip
// presence on @capacitor/app's appStateChange. RTDB onDisconnect still covers
// hard kills/crashes/network loss (the socket drops and the server runs the
// offline write even when JS never executes on quit).
export function useAppLifecycle(firebaseUid: string | null) {
  useEffect(() => {
    if (!firebaseUid || !Capacitor.isNativePlatform()) return

    let handle: PluginListenerHandle | undefined
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) presenceService.goOnline(firebaseUid)
      else presenceService.goOffline(firebaseUid)
    }).then(h => {
      handle = h
    })

    return () => {
      handle?.remove()
    }
  }, [firebaseUid])
}
