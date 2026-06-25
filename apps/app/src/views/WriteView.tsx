import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, CoverImg } from '@/components/sharedComponents'
import { MAX_WORD_COUNT, MIN_WORD_COUNT, isChapterPublished } from '@/config/constants'
import type { Book } from '@/types'
import * as fbService from '@/services/firebaseService'
import { useApp } from '@/state/AppContext'

// Formatting actions shown in the horizontal toolbar pinned above the keyboard.
// `null` entries render a thin vertical divider between groups.
const FORMAT_ACTIONS: ({ cmd: string; icon: string; title: string } | null)[] = [
  { cmd: 'bold', icon: 'format_bold', title: 'Bold' },
  { cmd: 'italic', icon: 'format_italic', title: 'Italic' },
  { cmd: 'underline', icon: 'format_underlined', title: 'Underline' },
  null,
  { cmd: 'justifyLeft', icon: 'format_align_left', title: 'Align Left' },
  { cmd: 'justifyCenter', icon: 'format_align_center', title: 'Align Center' },
  { cmd: 'justifyRight', icon: 'format_align_right', title: 'Align Right' },
  null,
  { cmd: 'insertUnorderedList', icon: 'format_list_bulleted', title: 'Bullet List' }
]

export const WriteView = () => {
  const {
    books,
    user,
    lastSelectedBookId,
    lastSelectedChapterIndex,
    setLastSelectedBookId,
    setLastSelectedChapterIndex,
    handleSaveDraft,
    setCurrentPublishingId,
    setCurrentPublishingTitle,
    setCurrentPublishingContent,
    setCurrentPublishingChapterTitle,
    setCurrentPublishingChapterIndex,
    setPublishingInitialData,
    setView,
    handleUnpublishChapter,
    handleRepublishChapter,
    handleDeleteChapter,
    showToast,
    setNotifications,
    isWriting,
    setIsWriting,
    writeReturnView,
    setWriteReturnView,
    writeMode,
    setWriteMode
  } = useApp()
  const initialBookId = lastSelectedBookId
  const initialChapterIndex = lastSelectedChapterIndex
  const onSelectionChange = (id: string, ch: string) => {
    setLastSelectedBookId(id)
    setLastSelectedChapterIndex(ch)
  }
  const onPublish = async (
    id: string | null,
    title: string,
    content: string,
    chapterIndex: number | null,
    chapterTitle: string
  ) => {
    let effectiveId = id
    // Persist the draft first (schema 2: light book doc + chapter subcollection).
    // handleSaveDraft creates the book for a new id and returns the real doc id.
    try {
      const savedId = await handleSaveDraft(
        id,
        title,
        content,
        chapterIndex,
        chapterTitle
      )
      if (!effectiveId) {
        if (!savedId) return
        effectiveId = savedId
      }
    } catch (err) {
      console.error('Failed to save book:', err)
      return
    }

    if (effectiveId) {
      const existingBook = books.find(b => b.id === effectiveId)
      setCurrentPublishingId(effectiveId)
      setCurrentPublishingTitle(title)
      setCurrentPublishingContent(content)
      setCurrentPublishingChapterTitle(chapterTitle.trim())
      setCurrentPublishingChapterIndex(chapterIndex)
      setPublishingInitialData(
        existingBook
          ? {
              tagline: existingBook.tagline,
              genres: existingBook.genres,
              hashtags: existingBook.hashtags,
              isMature: existingBook.isMature,
              commentsEnabled: existingBook.commentsEnabled
            }
          : null
      )
      setView('publishing')
    }
  }
  const onSaveDraft = handleSaveDraft
  const onUnpublishChapter = handleUnpublishChapter
  const onRepublishChapter = handleRepublishChapter
  const onDeleteChapter = handleDeleteChapter
  const onMonetize = () => setView('monetization-request')
  const onBack = () => {
    // From the chapter editor, Back returns to the works grid — unless the
    // editor was opened from a specific origin (e.g. a draft tapped on the
    // profile), in which case it returns straight there. From the grid itself,
    // Back leaves the Studio for the return view (or Home).
    if (writeMode === 'editor' && !writeReturnView) {
      setWriteMode('list')
      return
    }
    setView(writeReturnView || 'home')
    setWriteReturnView(null)
  }
  const onNotify = (title: string, message: string) => {
    const newNotif = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      icon: 'warning',
      timestamp: new Date(),
      recipient: user.username || 'system'
    }
    setNotifications(prev => [newNotif, ...prev])
  }
  const [newTitle, setNewTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('Chapter 1')
  const [selectedBookId, setSelectedBookId] = useState<string>(initialBookId)
  const [selectedChapterIndex, setSelectedChapterIndex] =
    useState<string>(initialChapterIndex)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [wordCount, setWordCount] = useState(0) // Reactive word count state
  // True while a chapter body is being lazily fetched into the editor (schema 2).
  const [editorLoading, setEditorLoading] = useState(false)
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null)
  // Distance in px from the layout-viewport bottom up to the keyboard's top,
  // used to pin the formatting toolbar right above the on-screen keyboard.
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [unpublishConfirmIdx, setUnpublishConfirmIdx] = useState<number | null>(
    null
  )
  // Mirror keyboardOffset into a ref so the stable ensureCaretVisible callback
  // can read the live toolbar position without being re-created each keystroke.
  const keyboardOffsetRef = useRef(0)
  keyboardOffsetRef.current = keyboardOffset
  const editorRef = useRef<HTMLDivElement>(null)
  const loadedEditorTargetRef = useRef('')
  const lastValidHtmlRef = useRef('')
  const lastValidWordCountRef = useRef(0)
  const hasShownNearLimitRef = useRef(false)
  const hasShownMaxLimitRef = useRef(false)
  const dirtyDraftRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const saveInFlightRef = useRef(false)
  // Debounced word-count recompute. innerText + innerHTML serialization + a
  // React re-render are all O(document) and were running on every keystroke,
  // which lags large chapters. We coalesce them to fire shortly after typing.
  const wordCountTimerRef = useRef<number | null>(null)
  // Coalesces ensureCaretVisible so rapid keystrokes queue at most one rAF.
  const caretRafRef = useRef<number | null>(null)
  // Debounced autosave: scheduled on each text/chapter-title change so edits
  // persist shortly after typing stops, instead of waiting up to the 30s tick.
  // performDraftSave is referenced via a ref to avoid a declaration-order cycle
  // (scheduleAutoSave is defined before performDraftSave but called by it later).
  const autoSaveTimerRef = useRef<number | null>(null)
  const performDraftSaveRef = useRef<
    ((mode: 'manual' | 'auto') => Promise<string | null>) | null
  >(null)
  // Touch origin for the editor, used to tell a tap (focus) from a scroll drag.
  const editorTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const latestStateRef = useRef({
    selectedBookId: initialBookId,
    selectedChapterIndex: initialChapterIndex,
    newTitle: '',
    chapterTitle: 'Chapter 1'
  })

  // Track the keyboard's height via visualViewport so the formatting bar can sit
  // flush on top of it. Works whether Capacitor resizes the webview (offset ~0)
  // or overlays the keyboard (offset = keyboard height). Only runs while writing.
  useEffect(() => {
    const vv = window.visualViewport
    if (!isWriting || !vv) {
      setKeyboardOffset(0)
      return
    }
    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop
      setKeyboardOffset(Math.max(0, Math.round(offset)))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [isWriting])

  // Reset writing mode when leaving Studio so the bottom nav reappears elsewhere.
  useEffect(() => {
    return () => setIsWriting(false)
  }, [setIsWriting])

  const myWorks = useMemo(
    () => books.filter((b: Book) => b.author.username === user.username),
    [books, user]
  )
  const selectedBook = useMemo(
    () => myWorks.find((w: Book) => w.id === selectedBookId),
    [myWorks, selectedBookId]
  )

  const calculateWordCount = useCallback((text: string) => {
    const cleanText = text.replace(/<\/?[^>]+(>|$)/g, '').trim()
    return cleanText === '' ? 0 : cleanText.split(/\s+/).length
  }, [])

  const getWords = useCallback((text: string) => {
    const trimmed = text.trim()
    return trimmed ? trimmed.split(/\s+/) : []
  }, [])

  const ensureCaretVisible = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const scrollContainer = editor.closest(
      '.overflow-y-auto'
    ) as HTMLElement | null
    if (!scrollContainer) {
      editor.scrollIntoView({ block: 'end', behavior: 'smooth' })
      return
    }

    // Coalesce: if a frame is already pending, let it do the work. Typing fast
    // would otherwise queue one forced-reflow rAF per character.
    if (caretRafRef.current != null) return
    caretRafRef.current = requestAnimationFrame(() => {
      caretRafRef.current = null
      const selection = window.getSelection()
      // No selection or an unreadable (0/0) rect: do nothing and let the
      // browser's native caret-into-view scrolling handle it. Jumping to
      // scrollHeight here is exactly what made Enter feel like the view
      // teleports, so those fallbacks are intentionally removed.
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0).cloneRange()
      range.collapse(false)
      const rect = range.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()

      if (rect.top === 0 && rect.bottom === 0) return

      // The formatting toolbar (h-12 = 48px) is a fixed bar sitting at
      // `bottom: keyboardOffset`, overlapping the bottom of the scroll
      // container. Reserve its height plus a comfortable gap so the active
      // line never slides under it and always keeps breathing room below.
      const TOOLBAR_HEIGHT = 48
      const BOTTOM_GAP = 96
      const bottomPad = keyboardOffsetRef.current + TOOLBAR_HEIGHT + BOTTOM_GAP
      const topPad = 96

      // Only adjust scroll when the caret is genuinely outside the visible band.
      if (rect.bottom > containerRect.bottom - bottomPad) {
        scrollContainer.scrollTop +=
          rect.bottom - (containerRect.bottom - bottomPad)
      } else if (rect.top < containerRect.top + topPad) {
        scrollContainer.scrollTop -= containerRect.top + topPad - rect.top
      }
    })
  }, [])

  // Use ref for wordCount inside callback to avoid re-creating updateWordCount on every keystroke
  const wordCountRef = useRef(wordCount)
  wordCountRef.current = wordCount

  const updateWordCount = useCallback(() => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || ''
      const count = calculateWordCount(text)

      if (count > MAX_WORD_COUNT) {
        editorRef.current.innerHTML = lastValidHtmlRef.current
        // Reassigning innerHTML rebuilds the DOM and collapses the caret to the
        // start; move it back to the end so over-limit input is not thrown to
        // the top. (Enter/insertParagraph adds 0 words and never reaches here.)
        const sel = window.getSelection()
        if (sel) {
          const r = document.createRange()
          r.selectNodeContents(editorRef.current)
          r.collapse(false)
          sel.removeAllRanges()
          sel.addRange(r)
        }
        setWordCount(lastValidWordCountRef.current)
        if (!hasShownMaxLimitRef.current) {
          onNotify(
            'Word limit reached',
            `Maximum ${MAX_WORD_COUNT.toLocaleString()} words allowed.`
          )
          hasShownMaxLimitRef.current = true
        }
        return
      }

      hasShownMaxLimitRef.current = false

      if (count >= MAX_WORD_COUNT - 100 && !hasShownNearLimitRef.current) {
        onNotify('Approaching limit', 'You are in your last 100 words!')
        hasShownNearLimitRef.current = true
      }

      if (count < MAX_WORD_COUNT - 100) {
        hasShownNearLimitRef.current = false
      }

      lastValidHtmlRef.current = editorRef.current.innerHTML
      lastValidWordCountRef.current = count

      setWordCount(count)
    }
  }, [calculateWordCount, onNotify])

  // Debounced wrapper around the heavy recompute. Keeps the live counter close
  // to current without paying the full-document cost on every keystroke.
  const WORD_COUNT_DEBOUNCE_MS = 250
  const scheduleWordCountUpdate = useCallback(() => {
    if (wordCountTimerRef.current) window.clearTimeout(wordCountTimerRef.current)
    wordCountTimerRef.current = window.setTimeout(() => {
      wordCountTimerRef.current = null
      updateWordCount()
    }, WORD_COUNT_DEBOUNCE_MS)
  }, [updateWordCount])

  // Run any pending recompute immediately (on blur / before save & publish) so
  // the counter, canPublish gate and lastValidHtmlRef reflect the final text.
  const flushWordCountUpdate = useCallback(() => {
    if (wordCountTimerRef.current) {
      window.clearTimeout(wordCountTimerRef.current)
      wordCountTimerRef.current = null
    }
    updateWordCount()
  }, [updateWordCount])

  const handleBeforeInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent
      if (!nativeEvent?.inputType?.startsWith('insert') || !editorRef.current)
        return

      // Fast path: when comfortably below the limit, skip the expensive
      // innerText read + full-text word count on every insert. The cached
      // count can lag a debounce window, but the 200-word margin dwarfs any
      // realistic drift, so the hard cap below is never reached unguarded.
      if (wordCountRef.current < MAX_WORD_COUNT - 200) return

      const currentCount = calculateWordCount(editorRef.current.innerText || '')
      const remainingWords = MAX_WORD_COUNT - currentCount

      if (remainingWords <= 0) {
        event.preventDefault()
        if (!hasShownMaxLimitRef.current) {
          onNotify(
            'Word limit reached',
            `Maximum ${MAX_WORD_COUNT.toLocaleString()} words allowed.`
          )
          hasShownMaxLimitRef.current = true
        }
        return
      }

      const insertedText = nativeEvent.data || ''
      if (!insertedText.trim()) return

      const insertedWords = getWords(insertedText)
      if (insertedWords.length > remainingWords) {
        event.preventDefault()
        const allowedText = insertedWords.slice(0, remainingWords).join(' ')
        if (allowedText) {
          document.execCommand('insertText', false, allowedText)
          updateWordCount()
          ensureCaretVisible()
        }
        onNotify(
          'Word limit reached',
          `Only ${remainingWords} word${
            remainingWords === 1 ? '' : 's'
          } remaining.`
        )
      }
    },
    [
      calculateWordCount,
      getWords,
      onNotify,
      updateWordCount,
      ensureCaretVisible
    ]
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!editorRef.current) return

      const pastedText = event.clipboardData.getData('text/plain') || ''
      const pastedWords = getWords(pastedText)
      if (pastedWords.length === 0) return

      event.preventDefault()

      const currentCount = calculateWordCount(editorRef.current.innerText || '')
      const remainingWords = MAX_WORD_COUNT - currentCount

      if (remainingWords <= 0) {
        if (!hasShownMaxLimitRef.current) {
          onNotify(
            'Word limit reached',
            `Maximum ${MAX_WORD_COUNT.toLocaleString()} words allowed.`
          )
          hasShownMaxLimitRef.current = true
        }
        return
      }

      const allowedText = pastedWords.slice(0, remainingWords).join(' ')
      if (allowedText) {
        document.execCommand('insertText', false, allowedText)
        updateWordCount()
        ensureCaretVisible()
      }

      if (pastedWords.length > remainingWords) {
        onNotify(
          'Word limit reached',
          `Only ${remainingWords} word${
            remainingWords === 1 ? '' : 's'
          } were pasted.`
        )
      }
    },
    [
      calculateWordCount,
      getWords,
      onNotify,
      updateWordCount,
      ensureCaretVisible
    ]
  )

  const AUTOSAVE_DEBOUNCE_MS = 1500

  // Restart the debounce window; fires an 'auto' save once edits pause.
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      void performDraftSaveRef.current?.('auto')
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [])

  const handleEditorInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      // Flag dirty BEFORE any early return so autosave never misses a change.
      dirtyDraftRef.current = true
      scheduleAutoSave()
      scheduleWordCountUpdate()
      // Keep the caret above the fixed formatting toolbar on every edit. The
      // browser's native caret-into-view scroll is unaware of that overlapping
      // bar, so without this the active line slides invisibly underneath it.
      // Skip IME composition so we never fight predictive text / dictation.
      const ie = event.nativeEvent as InputEvent
      if (!ie.isComposing && ie.inputType !== 'insertCompositionText')
        ensureCaretVisible()
    },
    [scheduleWordCountUpdate, ensureCaretVisible, scheduleAutoSave]
  )

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Never interfere with IME/dictation/predictive-text composition —
      // this is the most likely place an over-eager fix breaks iOS typing.
      if (event.nativeEvent.isComposing) return
      // Leave Shift+Enter as the browser's native soft line break.
      if (event.key === 'Enter' && !event.shiftKey) {
        // Deterministic paragraph insertion on both web and iOS WebKit,
        // instead of relying on the flaky defaultParagraphSeparator hint.
        event.preventDefault()
        document.execCommand('insertParagraph')
        dirtyDraftRef.current = true
        scheduleAutoSave()
        scheduleWordCountUpdate()
        ensureCaretVisible()
      }
    },
    [scheduleWordCountUpdate, ensureCaretVisible, scheduleAutoSave]
  )

  const setSavedIndicator = useCallback((state: 'saved' | 'idle' | 'error') => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setSaveState(state)
    if (state === 'saved') {
      saveTimerRef.current = window.setTimeout(() => {
        setSaveState('idle')
        saveTimerRef.current = null
      }, 2000)
    }
  }, [])

  const performDraftSave = useCallback(
    async (mode: 'manual' | 'auto') => {
      if (saveInFlightRef.current) return null

      const currentBookId =
        latestStateRef.current.selectedBookId === 'new'
          ? null
          : latestStateRef.current.selectedBookId
      const currentTitle = latestStateRef.current.newTitle
      const isSavingNewChapter =
        latestStateRef.current.selectedChapterIndex === 'new'
      const chapterCountBeforeSave = selectedBook?.chapterMeta?.length ?? 0
      const currentChapterIndex = isSavingNewChapter
        ? null
        : parseInt(latestStateRef.current.selectedChapterIndex, 10)
      const currentChapterTitle = latestStateRef.current.chapterTitle
      const currentContent = editorRef.current?.innerHTML || ''

      if (!currentBookId && !currentTitle.trim()) return null
      // Don't materialize a brand-new book until its first chapter has content.
      // Creating it from a title alone left an empty, chapterless book (the
      // editor would flip out of 'new' state, hiding the title field and
      // showing no chapters). A book now always carries at least Chapter 1.
      if (!currentBookId && !currentContent.replace(/<\/?[^>]+(>|$)/g, '').trim())
        return null
      if (mode === 'auto' && !dirtyDraftRef.current) return currentBookId

      saveInFlightRef.current = true
      setSaveState('saving')

      try {
        const savedId = await onSaveDraft(
          currentBookId,
          currentTitle,
          currentContent,
          currentChapterIndex,
          currentChapterTitle
        )
        if (savedId && latestStateRef.current.selectedBookId === 'new') {
          setSelectedBookId(savedId)
        }
        if (isSavingNewChapter && currentContent.trim()) {
          // After first save of a new chapter, lock selection to that chapter so autosave updates it instead of appending new ones.
          const createdChapterIndex = currentBookId ? chapterCountBeforeSave : 0
          setSelectedChapterIndex(createdChapterIndex.toString())
        }
        dirtyDraftRef.current = false
        setSavedIndicator('saved')
        return savedId
      } catch (error) {
        console.error('Failed to save draft:', error)
        setSavedIndicator('error')
        if (mode === 'manual') {
          showToast('Failed to save draft. Please try again.', 'warning')
        }
        return null
      } finally {
        saveInFlightRef.current = false
      }
    },
    [onSaveDraft, setSavedIndicator, showToast]
  )

  // Keep the ref pointed at the latest performDraftSave so the (stable)
  // scheduleAutoSave callback always invokes the current closure.
  useEffect(() => {
    performDraftSaveRef.current = performDraftSave
  }, [performDraftSave])

  // Enter is now handled explicitly in handleEditorKeyDown via
  // execCommand('insertParagraph'), so the brittle defaultParagraphSeparator
  // hint (poorly supported in the iOS WKWebView) is no longer needed.

  useEffect(() => {
    latestStateRef.current = {
      selectedBookId,
      selectedChapterIndex,
      newTitle,
      chapterTitle
    }
  }, [selectedBookId, selectedChapterIndex, newTitle, chapterTitle])

  useEffect(() => {
    onSelectionChange?.(selectedBookId, selectedChapterIndex)
  }, [onSelectionChange, selectedBookId, selectedChapterIndex])

  useEffect(() => {
    if (selectedBookId !== 'new' && selectedBook) {
      setNewTitle(selectedBook.title)
    } else if (selectedBookId === 'new') {
      setNewTitle('')
      setChapterTitle('Chapter 1')
      setSelectedChapterIndex('new')
    }
  }, [selectedBookId, selectedBook])

  useEffect(() => {
    const targetKey = `${selectedBookId}:${selectedChapterIndex}`
    if (loadedEditorTargetRef.current === targetKey) return

    if (selectedBookId !== 'new' && !selectedBook) return

    // Apply a loaded chapter (or empty editor) and reset the editor bookkeeping.
    const applyContent = (content: string, nextChapterTitle: string) => {
      if (!editorRef.current) return
      // Cancel any autosave queued for the chapter we're leaving so it can't
      // fire against the freshly loaded one.
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      loadedEditorTargetRef.current = targetKey
      editorRef.current.innerHTML = content
      lastValidHtmlRef.current = content
      const nextCount = calculateWordCount(editorRef.current.innerText || '')
      lastValidWordCountRef.current = nextCount
      setWordCount(nextCount)
      setChapterTitle(nextChapterTitle)
      dirtyDraftRef.current = false
      setSaveState('idle')
    }

    // Chapter metadata (id + title) from the book's chapterMeta.
    const meta = selectedBook?.chapterMeta || []

    // New book or new chapter → empty editor.
    if (!selectedBook || selectedChapterIndex === 'new') {
      applyContent('', selectedBook ? `Chapter ${meta.length + 1}` : 'Chapter 1')
      return
    }

    const idx = parseInt(selectedChapterIndex)

    // Fetch the chapter body directly (rules allow the author).
    const m = meta[idx]
    if (!m) {
      applyContent('', `Chapter ${idx + 1}`)
      return
    }
    let cancelled = false
    setEditorLoading(true)
    fbService
      .getChapter(selectedBook.id, m.id)
      .then(docData => {
        if (cancelled) return
        applyContent(docData?.content || '', m.title || `Chapter ${idx + 1}`)
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[MainWRLD] Chapter load failed in editor:', err)
        applyContent('', m.title || `Chapter ${idx + 1}`)
      })
      .finally(() => {
        if (!cancelled) setEditorLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedChapterIndex, selectedBookId, selectedBook, calculateWordCount])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current)
      }
      if (wordCountTimerRef.current) {
        window.clearTimeout(wordCountTimerRef.current)
      }
      if (caretRafRef.current != null) {
        cancelAnimationFrame(caretRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void performDraftSave('auto')
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [performDraftSave])

  const execAction = (cmd: string, val: string | null = null) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(cmd, false, val || undefined)
    updateWordCount()
  }

  const canPublish =
    wordCount >= MIN_WORD_COUNT &&
    (selectedBookId !== 'new' || newTitle.trim().length > 0)
  // A chapter is published per its own flag now (any position), not by sitting
  // inside the [0, chaptersCount) prefix. An existing-but-unpublished chapter
  // can be republished from here.
  const isExistingChapter =
    selectedChapterIndex !== 'new' && !!selectedBook
  const isPublished =
    isExistingChapter &&
    isChapterPublished(
      selectedBook!.chapterMeta,
      parseInt(selectedChapterIndex),
      selectedBook!.chaptersCount
    )
  const isUnpublishedChapter = isExistingChapter && !isPublished

  const handleDeleteClick = () => {
    if (selectedChapterIndex === 'new') return
    const idx = parseInt(selectedChapterIndex)
    if (deleteConfirmIdx === idx) {
      onDeleteChapter(selectedBookId, idx)
      setDeleteConfirmIdx(null)
      setSelectedChapterIndex('new')
    } else {
      setDeleteConfirmIdx(idx)
      showToast(
        'Are you sure? Click delete again to permanently erase.',
        'warning'
      )
      setTimeout(() => setDeleteConfirmIdx(null), 5000)
    }
  }

  const handleUnpublishClick = () => {
    if (selectedChapterIndex === 'new') return
    const idx = parseInt(selectedChapterIndex)
    if (unpublishConfirmIdx === idx) {
      onUnpublishChapter(selectedBookId, idx)
      setUnpublishConfirmIdx(null)
    } else {
      setUnpublishConfirmIdx(idx)
      showToast(
        'Are you sure? Click unpublish again to move to drafts.',
        'info'
      )
      setTimeout(() => setUnpublishConfirmIdx(null), 5000)
    }
  }

  const handleRepublishClick = () => {
    if (selectedChapterIndex === 'new') return
    const idx = parseInt(selectedChapterIndex)
    onRepublishChapter(selectedBookId, idx)
  }

  // Open an existing work from the grid into the chapter editor. Land on the
  // first chapter when the book has any, otherwise on a fresh chapter.
  const openBook = (b: Book) => {
    setSelectedBookId(b.id)
    setSelectedChapterIndex((b.chapterMeta?.length ?? 0) > 0 ? '0' : 'new')
    setWriteMode('editor')
  }

  // Start a brand-new work: the editor opens on an empty Chapter 1. The book
  // doc is only created once that chapter has content (see performDraftSave).
  const openNewBook = () => {
    setSelectedBookId('new')
    setSelectedChapterIndex('new')
    setNewTitle('')
    setChapterTitle('Chapter 1')
    setWriteMode('editor')
  }

  return (
    <div
      className={`fixed inset-0 bg-white flex flex-col items-center animate-in fade-in duration-500 overflow-hidden ${
        isWriting ? 'pb-0' : 'pb-20'
      }`}
      // The max-w-3xl wrapper below makes <header> a non-direct child of
      // .fixed.inset-0, so the global `.fixed.inset-0 > header` safe-area rule
      // in index.css no longer matches and the header slid under the iOS status
      // bar. Apply the top inset here so both writing and editing chrome clear it.
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className='w-full max-w-3xl flex-1 flex flex-col min-h-0'>
      {isWriting ? (
        <header className='px-4 py-3 border-b border-gray-50 flex justify-between items-center gap-3 bg-white z-50 animate-in slide-in-from-top-2 duration-200'>
          <div className='flex flex-col min-w-0'>
            <span className='text-[9px] font-bold text-gray-300 uppercase tracking-widest'>
              {selectedBookId === 'new' ? newTitle || 'New Work' : selectedBook?.title}
            </span>
            <span className='text-sm font-bold truncate'>
              {chapterTitle || 'Untitled Chapter'}
            </span>
          </div>
          <div className='flex items-center gap-3 shrink-0'>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest tabular-nums ${
                wordCount >= MAX_WORD_COUNT || wordCount < MIN_WORD_COUNT
                  ? 'text-red-400'
                  : wordCount >= MAX_WORD_COUNT - 100
                  ? 'text-yellow-500'
                  : 'text-green-500'
              }`}
            >
              {wordCount} / {MAX_WORD_COUNT}
            </span>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => editorRef.current?.blur()}
              className='h-9 px-4 rounded-xl bg-accent text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 active:scale-95 transition-transform'
            >
              <span className='material-icons-round text-sm'>check</span> Done
            </button>
          </div>
        </header>
      ) : (
        <header className='px-6 py-6 border-b border-gray-50 flex justify-between items-center bg-white z-50'>
          <div className='flex items-center gap-4'>
            <button
              onClick={onBack}
              className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 transition-colors hover:text-accent'
            >
              <span className='material-icons-round'>arrow_back</span>
            </button>
            <div>
              <h1 className='text-xl font-bold'>Write Studio</h1>
            </div>
          </div>
          <Button variant='secondary' className='h-10 px-4' onClick={onMonetize}>
            <span className='material-icons-round text-sm'>paid</span> Monetize
          </Button>
        </header>
      )}

      {writeMode === 'list' ? (
        <div className='flex-1 p-4 pb-28 overflow-y-auto no-scrollbar'>
          <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4'>
            {/* New Work tile — opens the editor on a fresh Chapter 1. */}
            <button
              onClick={openNewBook}
              className='aspect-[2/3] w-full rounded-[16px] border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-400 transition-all active:scale-95 hover:border-accent hover:text-accent'
            >
              <span className='material-icons-round text-4xl'>add</span>
              <span className='text-[11px] font-bold uppercase tracking-[0.66px]'>
                New Book
              </span>
            </button>
            {myWorks.map((b: Book) => {
              const chapterCount = b.chapterMeta?.length ?? 0
              return (
                <div
                  key={b.id}
                  onClick={() => openBook(b)}
                  className='flex flex-col gap-2 cursor-pointer transition-transform active:scale-95'
                >
                  <div
                    className='relative aspect-[2/3] w-full rounded-[16px] overflow-hidden bg-[#fbdddd] flex flex-col justify-end px-3 py-[18px]'
                    style={{ backgroundColor: b.coverColor || '#fbdddd' }}
                  >
                    <CoverImg book={b} />
                    {b.isDraft && (
                      <span className='absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/55 text-white text-[8px] font-bold uppercase tracking-[0.5px]'>
                        Draft
                      </span>
                    )}
                  </div>
                  <div className='flex flex-col gap-1'>
                    <p className='text-[13px] font-semibold text-[#1a1a1a] tracking-[0.13px] leading-[1.2] line-clamp-2'>
                      {b.title || 'Untitled'}
                    </p>
                    <p className='text-[11px] font-semibold text-[#9aa1a9] tracking-[0.66px] uppercase truncate'>
                      {chapterCount} {chapterCount === 1 ? 'Chapter' : 'Chapters'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
      <>
      <div
        className='flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar'
        style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
      >
        {!isWriting && (
        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
              Book Title
            </label>
            <input
              placeholder='Enter book title...'
              value={newTitle}
              onChange={e => {
                dirtyDraftRef.current = true
                setNewTitle(e.target.value)
                // Persist renames of an existing book. For a brand-new book the
                // doc is created only once Chapter 1 has content (see
                // performDraftSave), so typing a title alone must not autosave —
                // that would spawn an empty, chapterless book.
                if (selectedBookId !== 'new') scheduleAutoSave()
              }}
              className='w-full bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-accent/10'
            />
          </div>

          <div className='space-y-1.5'>
            <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
              Chapter Selection
            </label>
            <select
              className='w-full bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-medium outline-none appearance-none cursor-pointer shadow-sm'
              value={selectedChapterIndex}
              onChange={e => setSelectedChapterIndex(e.target.value)}
            >
              <option value='new'>+ New Chapter</option>
              {(selectedBook?.chapterMeta ?? []).map((ch: any, idx: number) => (
                <option key={idx} value={idx}>
                  {ch.title}
                </option>
              ))}
            </select>
          </div>

          <div className='space-y-1.5'>
            <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
              Chapter Title
            </label>
            <input
              placeholder='Enter chapter title...'
              value={chapterTitle}
              onChange={e => {
                dirtyDraftRef.current = true
                setChapterTitle(e.target.value)
                scheduleAutoSave()
              }}
              className='w-full bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-accent/10'
            />
          </div>
        </div>
        )}

        <div className='relative space-y-1.5'>
          {!isWriting && !(selectedBook && selectedBook.isCompleted) && (
            <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
              Chapter Content
            </label>
          )}
          <div
            className={`relative transition-all ${
              isWriting
                ? 'min-h-[70vh]'
                : 'min-h-[400px] bg-gray-50 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-accent/10'
            }`}
          >
            {selectedBook && selectedBook.isCompleted ? (
              <div className='w-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200'>
                <span className='material-icons-round text-4xl text-gray-300 mb-3'>
                  lock
                </span>
                <p className='text-sm font-bold text-gray-400'>
                  This book has been completed
                </p>
                <p className='text-xs text-gray-300 mt-1'>
                  Completed works cannot be edited
                </p>
              </div>
            ) : (
              <>
              {editorLoading && (
                <p className='text-center text-[10px] font-bold text-gray-300 uppercase tracking-widest pb-2'>
                  Loading chapter…
                </p>
              )}
              <div
                ref={editorRef}
                contentEditable='true'
                inputMode='text'
                role='textbox'
                aria-multiline='true'
                spellCheck='true'
                data-placeholder='Start writing your chapter…'
                className={`w-full bg-transparent border-none outline-none text-base leading-relaxed resize-none no-scrollbar focus:ring-0 rich-editor ${
                  isWriting ? 'min-h-[70vh] pb-[45vh]' : 'min-h-[400px] px-6 py-5'
                }`}
                style={{
                  WebkitUserSelect: 'text',
                  userSelect: 'text',
                  WebkitTouchCallout: 'default',
                  touchAction: 'manipulation'
                }}
                onBeforeInput={handleBeforeInput}
                onKeyDown={handleEditorKeyDown}
                onPaste={handlePaste}
                onInput={handleEditorInput}
                onFocus={() => setIsWriting(true)}
                onBlur={() => {
                  // Flush any debounced recompute so the counter / publish gate
                  // reflect the final text the moment the editor is left.
                  flushWordCountUpdate()
                  setIsWriting(false)
                }}
                onTouchStart={e => {
                  const t = e.touches[0]
                  editorTouchStartRef.current = t
                    ? { x: t.clientX, y: t.clientY }
                    : null
                }}
                onTouchEnd={e => {
                  const start = editorTouchStartRef.current
                  const t = e.changedTouches[0]
                  editorTouchStartRef.current = null
                  // A drag means the user was scrolling — don't grab focus on
                  // release; only a near-stationary tap should activate the editor.
                  if (
                    start &&
                    t &&
                    Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10
                  ) {
                    return
                  }
                  // Only grab focus if not already focused; tapping a native
                  // contentEditable already places the caret. Don't force a
                  // re-scroll here — it fought iOS IME and native tap-to-place.
                  if (document.activeElement !== e.currentTarget)
                    e.currentTarget.focus()
                }}
              />
              </>
            )}
          </div>
        </div>

        {!isWriting && selectedChapterIndex !== 'new' && (
          <div className='flex gap-4 pt-4 pb-2 animate-in slide-in-from-bottom duration-300'>
            {isPublished && (
              <button
                onClick={handleUnpublishClick}
                className={`flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                  unpublishConfirmIdx !== null
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-gray-50 border-gray-100 text-gray-400 hover:text-amber-500'
                }`}
              >
                <span className='material-icons-round text-sm'>
                  {unpublishConfirmIdx !== null
                    ? 'priority_high'
                    : 'unpublished'}
                </span>
                {unpublishConfirmIdx !== null
                  ? 'Confirm Unpublish?'
                  : 'Unpublish Chapter'}
              </button>
            )}
            {isUnpublishedChapter && (
              <button
                onClick={handleRepublishClick}
                className='flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border bg-gray-50 border-gray-100 text-gray-400 hover:text-emerald-500'
              >
                <span className='material-icons-round text-sm'>publish</span>
                Publish Chapter
              </button>
            )}
            <button
              onClick={handleDeleteClick}
              className={`flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                deleteConfirmIdx !== null
                  ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-500/10'
                  : 'bg-gray-50 border-gray-100 text-gray-400 hover:text-red-500'
              }`}
            >
              <span className='material-icons-round text-sm'>
                {deleteConfirmIdx !== null ? 'report' : 'delete_forever'}
              </span>
              {deleteConfirmIdx !== null ? 'Confirm Delete?' : 'Delete Chapter'}
            </button>
          </div>
        )}
      </div>

      {!isWriting && (
      <div className='p-6 bg-white border-t border-gray-50'>
        <div className='flex justify-between items-center mb-6'>
          <div className='flex flex-col'>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                wordCount >= MAX_WORD_COUNT
                  ? 'text-red-400'
                  : wordCount < MIN_WORD_COUNT
                  ? 'text-red-400'
                  : wordCount >= MAX_WORD_COUNT - 100
                  ? 'text-yellow-500'
                  : 'text-green-500'
              }`}
            >
              {wordCount} / {MAX_WORD_COUNT} Words
            </span>
            <span className='text-[7px] text-gray-300 uppercase font-bold'>
              {wordCount >= MAX_WORD_COUNT
                ? 'Maximum word count reached!'
                : wordCount < MIN_WORD_COUNT
                ? `Min ${MIN_WORD_COUNT} words to publish`
                : wordCount >= MAX_WORD_COUNT - 100
                ? 'Approaching max word count limit!'
                : 'Word count limit: 11,000'}
            </span>
          </div>
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <Button
            variant='outline'
            disabled={
              (selectedBookId === 'new' &&
                (!newTitle.trim() || wordCount === 0)) ||
              saveState === 'saving'
            }
            onClick={() => {
              void performDraftSave('manual')
            }}
          >
            {saveState === 'saving'
              ? 'Saving...'
              : saveState === 'saved'
              ? '✓ Saved!'
              : saveState === 'error'
              ? 'Retry Save'
              : 'Save Draft'}
          </Button>
          <Button
            disabled={!canPublish}
            onClick={() => {
              const currentContent = editorRef.current?.innerHTML || ''
              onPublish(
                selectedBookId === 'new' ? null : selectedBookId,
                newTitle,
                currentContent,
                selectedChapterIndex === 'new'
                  ? null
                  : parseInt(selectedChapterIndex),
                chapterTitle
              )
            }}
          >
            Publish
          </Button>
        </div>
      </div>
      )}
      </>
      )}
      </div>

      {isWriting && (
        <div
          className='fixed left-1/2 -translate-x-1/2 w-full max-w-3xl z-80 h-12 bg-white/95 backdrop-blur-xl border-t border-gray-100 flex items-center gap-0.5 px-2 overflow-x-auto no-scrollbar animate-in slide-in-from-bottom-2 duration-150'
          style={{ bottom: keyboardOffset }}
        >
          {FORMAT_ACTIONS.map((action, idx) =>
            action === null ? (
              <div
                key={`div-${idx}`}
                className='h-5 w-px bg-gray-200 mx-1.5 shrink-0'
              />
            ) : (
              <button
                key={action.cmd}
                onMouseDown={e => {
                  e.preventDefault()
                  execAction(action.cmd)
                }}
                className='w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-gray-600 hover:text-accent hover:bg-accent/5 active:scale-90 transition-all'
                title={action.title}
              >
                <span className='material-icons-round text-xl'>
                  {action.icon}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
