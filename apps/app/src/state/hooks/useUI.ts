import { useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { parsePath, isPublicInitialView } from '@/navigation/routes'
import type { View, Book, User, ReaderSettings } from '@/types'

// Resolve the view to paint before auth settles, straight from the URL. Covers:
//   • the Firebase password-reset link (?mode=resetPassword&oobCode=…) — without
//     this the SPA shows splash → landing and the link appears to "lead nowhere";
//   • a shared book deep-link (F09): a `/book/<id>` link (or the `?book=<id>` the
//     ogBook function redirects humans to) opens the public preview and stashes
//     the id for the post-auth upgrade;
//   • any other no-auth view (login / signup / legal) so a cold-loaded or
//     deep-linked URL paints immediately instead of flashing the wrong screen.
// Everything else falls back to `splash` until the auth listener decides
// home vs landing (and useUrlSync re-applies authed deep routes).
function resolveInitialView(): View {
  if (typeof window === 'undefined') return 'splash'
  const route = parsePath(window.location.pathname, window.location.search)
  if (route) {
    if (
      (route.view === 'public-book' || route.view === 'book-detail') &&
      route.bookId
    ) {
      try {
        sessionStorage.setItem('pendingShareBookId', route.bookId)
      } catch {}
      return 'public-book'
    }
    if (isPublicInitialView(route.view)) return route.view
  }
  return 'splash'
}

// UI / navigation / coordinating-selection state. Foundation hook with no
// cross-domain dependencies: it owns `view` (navigation), the toast/confirm
// primitives, the currently-selected book/profile/chat, reader settings, the
// 3D move vector, and the comment-scroll coordinates. Extracted verbatim from
// the former App body (Phase B) — hook order and the clipboard effect's `[view]`
// dependency are preserved, so runtime behaviour is unchanged.
export function useUI() {
  const [view, setView] = useState<View>(resolveInitialView)
  const [toast, setToast] = useState<{ message: string; icon: string } | null>(
    null
  )
  const showToast = useCallback(
    (message: string, icon: string = 'check_circle') => {
      setToast({ message, icon })
      setTimeout(() => setToast(null), 2500)
    },
    []
  )
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    icon?: string
    iconBg?: string
    onConfirm: () => void
    onCancel?: () => void
  } | null>(null)
  const showConfirm = useCallback(
    (opts: {
      title: string
      message: string
      confirmLabel?: string
      cancelLabel?: string
      icon?: string
      iconBg?: string
      onConfirm: () => void
      onCancel?: () => void
    }) => {
      setConfirmModal(opts)
    },
    []
  )
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [readingChapterIndex, setReadingChapterIndex] = useState(0)
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(
    null
  )
  const [selectedChatUser, setSelectedChatUser] = useState<string | null>(null)
  // Whose social lists (Mutuals / Admirers / Admiring) the SocialListView shows.
  // null = the signed-in user (opened from the Me profile, Back → self-profile);
  // a username = another person (opened from their Profile, Back → profile).
  const [socialListUsername, setSocialListUsername] = useState<string | null>(
    null
  )
  const [moveDir, setMoveDir] = useState(new THREE.Vector3())
  // Defaults applied until the persisted readerSettings (if any) hydrate from
  // the profile in useUserDataLoader. Kept here (not on `user`) so the reader
  // slice stays self-contained; persistence is wired through usePersist.
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>({
    fontSize: 13,
    inverted: false,
    scrollMode: true
  })
  const [activeCommentChapterKey, setActiveCommentChapterKey] = useState<
    string | null
  >(null)
  const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(
    null
  )
  // Distraction-free writing mode: WriteView flips this on while the editor is
  // focused so the app shell can hide the bottom nav and reclaim vertical space.
  const [isWriting, setIsWriting] = useState(false)
  // Where the WriteView back button should return to. Set when the editor is
  // opened from a specific origin (e.g. a draft tapped on the profile), so Back
  // goes there instead of the default Home. Cleared on plain tab navigation.
  const [writeReturnView, setWriteReturnView] = useState<View | null>(null)
  // Which screen the Studio (WriteView) shows: the Library-like grid of the
  // author's works ('list') or the chapter editor for one book ('editor').
  // Shared (not WriteView-local) so it survives round-trips to the Publishing /
  // Monetization sub-screens and back. Tab navigation resets it to 'list'.
  const [writeMode, setWriteMode] = useState<'list' | 'editor'>('list')
  // One-shot request to open the chapter editor on a specific book/chapter from
  // OUTSIDE WriteView (e.g. after the new-book setup screen creates the draft).
  // WriteView consumes it, adopts the target into its local selection, then
  // clears it. `chapterIndex: ''` lands on the empty "start a chapter" state.
  const [editorTarget, setEditorTarget] = useState<{
    bookId: string
    chapterIndex: string
  } | null>(null)

  useEffect(() => {
    if (view !== 'home') return

    const preventClipboard = (e: Event) => e.preventDefault()
    const preventClipboardShortcuts = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'x', 'v'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault()
      }
    }

    document.addEventListener('copy', preventClipboard)
    document.addEventListener('cut', preventClipboard)
    document.addEventListener('paste', preventClipboard)
    document.addEventListener('keydown', preventClipboardShortcuts)

    return () => {
      document.removeEventListener('copy', preventClipboard)
      document.removeEventListener('cut', preventClipboard)
      document.removeEventListener('paste', preventClipboard)
      document.removeEventListener('keydown', preventClipboardShortcuts)
    }
  }, [view])

  return {
    view,
    setView,
    toast,
    setToast,
    showToast,
    confirmModal,
    setConfirmModal,
    showConfirm,
    selectedBook,
    setSelectedBook,
    readingChapterIndex,
    setReadingChapterIndex,
    selectedProfileUser,
    setSelectedProfileUser,
    selectedChatUser,
    setSelectedChatUser,
    socialListUsername,
    setSocialListUsername,
    moveDir,
    setMoveDir,
    readerSettings,
    setReaderSettings,
    activeCommentChapterKey,
    setActiveCommentChapterKey,
    scrollToCommentId,
    setScrollToCommentId,
    isWriting,
    setIsWriting,
    writeReturnView,
    setWriteReturnView,
    writeMode,
    setWriteMode,
    editorTarget,
    setEditorTarget
  }
}
