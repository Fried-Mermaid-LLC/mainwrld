import { useEffect, useState } from 'react'
import * as worldService from '@/services/worldService'
import { rtdb } from '@/lib/firebase'

export interface ProfilePresence {
  // True only while the world layer is active (VITE_FIREBASE_DATABASE_URL set).
  // When false the caller should fall back to the Firestore presence mirror, so
  // a deployment without RTDB doesn't show everyone permanently offline.
  rtdbAvailable: boolean
  // False until the first /world snapshot lands. The caller should keep showing
  // the Firestore mirror until then, so opening a profile doesn't flash "Offline"
  // before RTDB confirms presence.
  ready: boolean
  // Presence in /world === online (RTDB onDisconnect removes the node on a socket
  // drop), so this can never go stale the way the Firestore isOnline mirror does.
  isOnline: boolean
  // The live world activity ('Exploring' | 'Reading' | 'Writing') — already the
  // same vocabulary the 3D avatar renders, so no Idle→Exploring remap is needed.
  activity: string | null
}

// Live presence for a single profile, read straight from the RTDB /world node —
// the exact source the 3D-world avatars render from. Driving the profile's status
// line from this (instead of the Firestore users/{uid} mirror) means the two can
// never disagree: /world updates in real time and self-clears on disconnect,
// whereas the mirror trails the ~30s heartbeat and can stay 'online' after a hard
// kill. Mounts a /world subscription for the profile's lifetime (the home view's
// view-gated subscription is torn down once we leave the world, so we can't reuse
// its store here).
export function useProfilePresence(username: string): ProfilePresence {
  const [presence, setPresence] = useState<ProfilePresence>({
    rtdbAvailable: rtdb != null,
    ready: false,
    isOnline: false,
    activity: null,
  })

  useEffect(() => {
    // Reset to not-ready while (re)subscribing so a username switch falls back to
    // the new user's Firestore value until their first /world snapshot arrives,
    // rather than briefly showing the previous user's live presence.
    setPresence({
      rtdbAvailable: rtdb != null,
      ready: false,
      isOnline: false,
      activity: null,
    })
    if (!rtdb || !username) return
    const unsub = worldService.subscribeWorld(entries => {
      const entry = entries.find(e => e.username === username)
      setPresence({
        rtdbAvailable: true,
        ready: true,
        isOnline: !!entry,
        activity: entry?.activity ?? null,
      })
    })
    return unsub
  }, [username])

  return presence
}
