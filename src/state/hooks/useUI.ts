import { useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import type { View, Book, User } from '@/types'

// Firebase appends the reset params to whatever action URL is configured in
// the console (Authentication → Templates → Password reset), so a reset email
// lands on the app as ?mode=resetPassword&oobCode=…. Resolve that into the
// reset-password view before the first paint — otherwise the SPA shows the
// splash → landing screen and the link appears to "lead nowhere".
function resolveInitialView(): View {
  if (typeof window === 'undefined') return 'splash'
  const params = new URLSearchParams(window.location.search)
  if (params.get('mode') === 'resetPassword' && params.get('oobCode')) {
    return 'reset-password'
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
  const [moveDir, setMoveDir] = useState(new THREE.Vector3())
  const [readerSettings, setReaderSettings] = useState({
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
    moveDir,
    setMoveDir,
    readerSettings,
    setReaderSettings,
    activeCommentChapterKey,
    setActiveCommentChapterKey,
    scrollToCommentId,
    setScrollToCommentId
  }
}
