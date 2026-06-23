// Push notifications (X01). Native-only, fail-soft on web. Registers the device
// APNs/FCM token onto users/{uid}.fcmTokens and deep-links on tap via a shared
// router. The server-side sendPushOnNotification trigger does all push gating
// (per-category prefs, master toggle, stale-token pruning).
import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import * as fbService from '@/services/firebaseService'

type PushRouter = (data: Record<string, string>) => void

let registered = false
let lastToken: string | null = null

// Persist push:true/false on the user's notificationPrefs without clobbering the
// other category flags.
const setPushPref = async (uid: string, enabled: boolean) => {
  try {
    const profile: any = await fbService.getUserProfile(uid)
    const prefs = profile?.notificationPrefs ?? {
      newAdmirers: true,
      bookLikes: true,
      comments: true,
      appUpdates: true
    }
    await fbService.updateUserProfile(uid, {
      notificationPrefs: { ...prefs, push: enabled }
    })
  } catch (err) {
    console.warn('[MainWRLD] setPushPref failed:', err)
  }
}

export const registerForPush = async (
  firebaseUid: string,
  onPushTap?: PushRouter
): Promise<void> => {
  if (!Capacitor.isNativePlatform() || registered) return
  try {
    const { receive } = await FirebaseMessaging.requestPermissions()
    if (receive !== 'granted') {
      await setPushPref(firebaseUid, false)
      return
    }
    const { token } = await FirebaseMessaging.getToken()
    if (token) {
      lastToken = token
      await fbService.addFcmToken(firebaseUid, token)
    }
    await setPushPref(firebaseUid, true)

    // Re-persist on token refresh.
    await FirebaseMessaging.addListener('tokenReceived', async ({ token: t }) => {
      if (!t || t === lastToken) return
      lastToken = t
      await fbService.addFcmToken(firebaseUid, t).catch(() => {})
    })
    // Deep-link on tap using the shared router (reconstructs from FCM data).
    await FirebaseMessaging.addListener(
      'notificationActionPerformed',
      (event: any) => {
        const data = (event?.notification?.data || {}) as Record<string, string>
        onPushTap?.(data)
      }
    )
    registered = true
  } catch (err) {
    // Never block app start on push.
    console.warn('[MainWRLD] registerForPush failed:', err)
  }
}

export const unregisterPush = async (firebaseUid: string): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return
  try {
    const token = lastToken
    await FirebaseMessaging.deleteToken().catch(() => {})
    if (token) await fbService.removeFcmToken(firebaseUid, token).catch(() => {})
    await setPushPref(firebaseUid, false)
    await FirebaseMessaging.removeAllListeners().catch(() => {})
  } catch (err) {
    console.warn('[MainWRLD] unregisterPush failed:', err)
  } finally {
    registered = false
    lastToken = null
  }
}
