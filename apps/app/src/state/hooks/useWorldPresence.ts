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
// Self-presence (joinWorld + onDisconnect) is armed while the user is in the 3D
// world OR doing a world-visible activity (reading/writing), so peers keep seeing
// the avatar — now labelled Reading/Writing instead of Exploring — instead of it
// vanishing the moment a book is opened. The avatar is removed on navigate-away
// to a non-world view and on socket drop.
//
// Rendering of OTHER avatars (the /world subscription) stays scoped to view ===
// 'home': a reader doesn't need everyone else streamed in while the book is open.
const PRESENT_VIEWS = new Set(['home', 'reading', 'write', 'publishing'])

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
  // this is the explicit clean leave on navigate-away to a non-world view / unmount.
  //
  // Keyed on a boolean (not raw `view`) so moving between world-present views
  // (home → reading → write) does NOT churn leave/rejoin — that would drop the
  // /world node and respawn the avatar at the origin, losing its position. The
  // node persists; only its activity label changes (via setWorldActivity).
  const present = PRESENT_VIEWS.has(view)
  useEffect(() => {
    if (!firebaseUid || !username || !present) return
    worldService.joinWorld(firebaseUid, username)
    return () => worldService.leaveWorld(firebaseUid)
  }, [firebaseUid, username, present])

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
