// Browser notifications (Notification API). Web-only counterpart to pushService:
// on native the Capacitor/FCM path already handles push, so this is a no-op there.
// Foreground-only by design — it surfaces the same notification items the SSE feed
// already delivers (useNotifications) as OS-level banners while a tab is open, with
// no service worker / VAPID / server changes. Tapping a banner deep-links through
// the shared notification router, exactly like a native push tap.
import { Capacitor } from '@capacitor/core'
import * as fbService from '@/services/firebaseService'
import type { NotificationItem } from '@/types'

// App icon shown on the OS banner (NotificationItem.icon holds a material-icon
// name, not a URL, so it can't be used here).
const NOTIFICATION_ICON = '/apple-touch-icon.png'

let registered = false

const supported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window

// Mirror pushService.setPushPref: persist push:true/false onto notificationPrefs
// without clobbering the per-category flags, so the settings/UI gating stays shared.
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
    console.warn('[MainWRLD] web setPushPref failed:', err)
  }
}

// Ask for permission once auth resolves. Idempotent and fail-soft — never blocks
// app start. On a prior 'denied' we leave it alone (the browser won't re-prompt).
export const registerForWebNotifications = async (
  firebaseUid: string
): Promise<void> => {
  if (Capacitor.isNativePlatform() || registered || !supported()) return
  registered = true
  try {
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      await setPushPref(firebaseUid, result === 'granted')
    } else if (Notification.permission === 'granted') {
      await setPushPref(firebaseUid, true)
    }
  } catch (err) {
    console.warn('[MainWRLD] registerForWebNotifications failed:', err)
  }
}

export const canShowWebNotification = (): boolean =>
  supported() && Notification.permission === 'granted'

// Surface one notification item as an OS banner. `tag` = item id so a repeat of
// the same item replaces rather than stacks. onClick refocuses the tab and routes.
export const showWebNotification = (
  n: NotificationItem,
  onClick: (n: NotificationItem) => void
): void => {
  if (!canShowWebNotification()) return
  try {
    const notification = new Notification(n.title, {
      body: n.message,
      icon: NOTIFICATION_ICON,
      tag: n.id
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      onClick(n)
    }
  } catch (err) {
    console.warn('[MainWRLD] showWebNotification failed:', err)
  }
}
