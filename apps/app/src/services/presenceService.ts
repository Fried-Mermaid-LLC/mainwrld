// RTDB-backed presence (X06). The Realtime Database server itself detects a
// dropped socket and runs the onDisconnect write server-side, which is what
// gives accurate online/offline even on iOS force-quit / crash / network loss
// (the WKWebView never fires beforeunload/pagehide there). A Cloud Function
// mirrors /status/{uid} into Firestore users/{uid} so the rest of the app keeps
// reading presence from the existing users subscription.
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database'
import { rtdb } from '@/lib/firebase'

export type Activity = 'Reading' | 'Writing' | 'Idle'

interface PresenceHandle {
  connRef: DatabaseReference
  detach: Unsubscribe
}

// One handle per uid so foreground/background re-registration is idempotent.
const handles = new Map<string, PresenceHandle>()

const statusRef = (uid: string) => ref(rtdb, `status/${uid}`)

const offlinePayload = () => ({
  state: 'offline',
  activity: 'Idle' as Activity,
  currentBookId: null,
  lastChanged: serverTimestamp(),
})

export const goOnline = (uid: string): void => {
  if (!uid || handles.has(uid)) return
  // One child per live socket so multi-tab/device is handled: the user is
  // online while ANY connection child exists.
  const connRef = push(ref(rtdb, `connections/${uid}`))
  const connectedRef = ref(rtdb, '.info/connected')
  const detach = onValue(connectedRef, snap => {
    if (snap.val() !== true) return
    // Register the disconnect actions FIRST, so they are armed on the server
    // before we announce ourselves online.
    onDisconnect(connRef)
      .remove()
      .then(() => onDisconnect(statusRef(uid)).set(offlinePayload()))
      .then(() => {
        void set(connRef, {
          activity: 'Idle',
          currentBookId: null,
          connectedAt: serverTimestamp(),
        })
        void set(statusRef(uid), {
          state: 'online',
          activity: 'Idle',
          currentBookId: null,
          lastChanged: serverTimestamp(),
        })
      })
      .catch(() => {})
  })
  handles.set(uid, { connRef, detach })
}

export const setActivity = (
  uid: string,
  activity: Activity,
  currentBookId: string | null
): void => {
  if (!uid) return
  const handle = handles.get(uid)
  if (handle) {
    void update(handle.connRef, { activity, currentBookId })
  }
  void update(statusRef(uid), {
    activity,
    currentBookId,
    lastChanged: serverTimestamp(),
  })
}

export const goOffline = (uid: string): void => {
  if (!uid) return
  const handle = handles.get(uid)
  if (handle) {
    handle.detach()
    void remove(handle.connRef)
    handles.delete(uid)
  }
  void set(statusRef(uid), offlinePayload())
}
