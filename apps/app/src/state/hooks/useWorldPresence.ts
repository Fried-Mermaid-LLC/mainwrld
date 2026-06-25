import { useCallback, useEffect, useRef, useState } from 'react'
import * as worldService from '@/services/worldService'
import type { WorldEntry } from '@/types'

interface WorldPresenceDeps {
  firebaseUid: string | null
  username: string
  view: string
}

// Realtime world presence (RTDB). Splits the high-frequency transform stream from
// React rendering: the latest per-user state lives in a ref (read each frame in
// MovingAvatar's useFrame — no re-render), while React state only changes when the
// SET of present users changes (join/leave). Without this split, the ~9 Hz position
// writes from every moving user would re-render the whole app tree.
//
// Self-presence (joinWorld + onDisconnect) stays armed for the whole authenticated
// session — the avatar remains in /world at its last position no matter which menu
// or view the user is on, so peers keep seeing them exactly where they were (its
// label tracks the activity: Reading/Writing while reading/writing, Exploring
// otherwise). It's removed only on logout (unmount) and on socket drop.
//
// Rendering of OTHER avatars (the /world subscription) stays scoped to view ===
// 'home': a reader doesn't need everyone else streamed in while the book is open.

export function useWorldPresence({ firebaseUid, username, view }: WorldPresenceDeps) {
  // Live store, keyed by username (the social-graph join key). Mutated on every
  // RTDB tick WITHOUT setState. MovingAvatar reads it via getWorldEntry each frame.
  const storeRef = useRef<Map<string, WorldEntry>>(new Map())
  const membershipSigRef = useRef('')
  const [worldUsernames, setWorldUsernames] = useState<Set<string>>(new Set())

  // Subscribe to /world only while in the world. Membership re-renders; transforms
  // do not (they flow into storeRef, read per-frame).
  useEffect(() => {
    if (view !== 'home') return
    const unsub = worldService.subscribeWorld(entries => {
      const map = new Map<string, WorldEntry>()
      for (const e of entries) map.set(e.username, e)
      storeRef.current = map
      const sig = [...map.keys()].sort().join('|')
      if (sig !== membershipSigRef.current) {
        membershipSigRef.current = sig
        setWorldUsernames(new Set(map.keys()))
      }
    })
    return () => {
      unsub()
      storeRef.current = new Map()
      membershipSigRef.current = ''
      setWorldUsernames(new Set())
    }
  }, [view])

  // Self join/leave. onDisconnect (in worldService) is the server-side safety net;
  // this is the explicit clean leave on logout / unmount.
  //
  // NOT keyed on `view`: the node persists across every navigation so the avatar
  // never drops out of /world or respawns at the origin — joinWorld is idempotent,
  // and the activity label changes in place via setWorldActivity.
  useEffect(() => {
    if (!firebaseUid || !username) return
    worldService.joinWorld(firebaseUid, username)
    return () => worldService.leaveWorld(firebaseUid)
  }, [firebaseUid, username])

  // Stable reader for the live store (used in useFrame, must not change identity).
  const getWorldEntry = useCallback(
    (name: string): WorldEntry | undefined => storeRef.current.get(name),
    []
  )

  const sendEmote = useCallback(
    (type: string) => {
      if (firebaseUid) worldService.sendEmote(firebaseUid, type)
    },
    [firebaseUid]
  )

  return { worldUsernames, getWorldEntry, sendEmote }
}
