import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Capacitor } from '@capacitor/core'
import * as fbService from '@/services/firebaseService'
import { convertFirestoreBook } from '@/utils/bookConverter'
import {
  parsePath,
  routeToPath,
  needsClientApply,
  isPublicView,
  type Route,
} from '@/navigation/routes'
import type { View, Book, User } from '@/types'

interface UrlSyncDeps {
  // Navigation + selection state (read).
  view: View
  selectedBook: Book | null
  selectedProfileUser: User | null
  selectedChatUser: string | null
  readingChapterIndex: number
  // Setters.
  setView: Dispatch<SetStateAction<View>>
  setSelectedBook: Dispatch<SetStateAction<Book | null>>
  setSelectedProfileUser: Dispatch<SetStateAction<User | null>>
  setSelectedChatUser: Dispatch<SetStateAction<string | null>>
  setReadingChapterIndex: Dispatch<SetStateAction<number>>
  // Data for in-memory lookups + book conversion.
  registeredUsers: User[]
  mutuals: User[]
  favoriteBookIds: Set<string>
  // Auth gating.
  firebaseUid: string | null
  authLoading: boolean
}

// Two-way navigation <-> URL sync for the web build (History API). The app's
// `view` + selection state stays the source of truth; this hook (a) pushes a
// readable path whenever navigation changes so the address bar tracks the
// current screen and Back/Forward work, and (b) restores the view + selection
// from the URL on Back/Forward and on a cold deep-load. Native (capacitor://)
// is a no-op — deep links there flow through main.tsx's appUrlOpen instead.
export function useUrlSync(deps: UrlSyncDeps) {
  const isWeb = !Capacitor.isNativePlatform()

  // Latest deps in a ref so the popstate listener (bound once) and the async
  // route applier never read stale state.
  const ref = useRef(deps)
  ref.current = deps

  // Gate the outbound push until the initial deep-load has been applied, so we
  // never overwrite a deep-linked URL with the bootstrap view (`home`).
  const bootstrappedRef = useRef(false)
  // Suppresses the outbound push triggered by our own inbound apply (the apply
  // sets the URL-matching state, so a push would be redundant — and during the
  // multi-setState book fetch it could momentarily push a half-applied path).
  const applyingRef = useRef(false)

  // Resolve a parsed Route into view + selection state, fetching the book /
  // profile by id when it isn't already in memory. Shared by the cold deep-load
  // and the Back/Forward handler.
  const applyRoute = async (route: Route) => {
    const d = ref.current
    applyingRef.current = true
    try {
      // Back/Forward (or a hand-edited URL) can target an auth-only view while
      // signed out — keep such a visitor on landing instead of a broken screen.
      if (!d.firebaseUid && !isPublicView(route.view)) {
        d.setView('landing')
        return
      }
      switch (route.view) {
        case 'profile': {
          if (!route.username) return
          if (d.selectedProfileUser?.username === route.username) {
            d.setView('profile')
            return
          }
          const inMemory =
            d.registeredUsers.find(u => u.username === route.username) ||
            d.mutuals.find(u => u.username === route.username) ||
            null
          const user = inMemory ?? (await fbService.getUserByUsername(route.username))
          if (user) {
            d.setSelectedProfileUser(user as User)
            d.setView('profile')
          } else {
            d.setView('home')
          }
          return
        }
        case 'chat-conversation': {
          if (!route.chatUsername) return
          d.setSelectedChatUser(route.chatUsername)
          d.setView('chat-conversation')
          return
        }
        case 'book-detail':
        case 'public-book':
        case 'reading':
        case 'comments': {
          if (!route.bookId) return
          if (d.selectedBook?.id !== route.bookId) {
            const fb = await fbService.getBook(route.bookId)
            if (!fb) {
              d.setView('home')
              return
            }
            d.setSelectedBook(convertFirestoreBook(fb, d.favoriteBookIds))
          }
          if (route.view === 'reading') {
            d.setReadingChapterIndex(route.chapterIndex ?? 0)
            d.setView('reading')
          } else if (route.view === 'comments') {
            d.setView('comments')
          } else {
            d.setView('book-detail')
          }
          return
        }
        default:
          d.setView(route.view)
      }
    } finally {
      // Release on the next microtask so the state updates from this apply have
      // committed before the outbound effect re-evaluates.
      Promise.resolve().then(() => {
        applyingRef.current = false
      })
    }
  }

  // (a) Outbound: navigation state -> address bar.
  useEffect(() => {
    if (!isWeb) return
    if (!bootstrappedRef.current) return
    if (applyingRef.current) return
    const path = routeToPath({
      view: deps.view,
      bookId: deps.selectedBook?.id,
      username: deps.selectedProfileUser?.username,
      chatUsername: deps.selectedChatUser ?? undefined,
      chapterIndex: deps.readingChapterIndex,
    })
    if (!path) return
    // Already reflected (e.g. just restored from the URL) — nothing to write.
    if (path === window.location.pathname) return
    window.history.pushState({}, '', path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deps.view,
    deps.selectedBook?.id,
    deps.selectedProfileUser?.username,
    deps.selectedChatUser,
    deps.readingChapterIndex,
  ])

  // (b) Inbound on cold deep-load: once auth settles, apply the URL's route for
  // authed views the auth listener would otherwise have replaced with `home`.
  useEffect(() => {
    if (!isWeb) return
    if (bootstrappedRef.current) return
    if (deps.authLoading) return // wait for the auth listener to settle
    if (deps.firebaseUid) {
      const route = parsePath(window.location.pathname, window.location.search)
      if (route && needsClientApply(route.view)) void applyRoute(route)
    }
    bootstrappedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.authLoading, deps.firebaseUid])

  // (b) Inbound on Back/Forward.
  useEffect(() => {
    if (!isWeb) return
    const onPop = () => {
      const route = parsePath(window.location.pathname, window.location.search)
      if (route) {
        void applyRoute(route)
      } else {
        void applyRoute({ view: ref.current.firebaseUid ? 'home' : 'landing' })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
