import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/sharedComponents'
import { MAX_WORD_COUNT, MIN_WORD_COUNT } from '@/config/constants'
import type { Chapter, Book } from '@/types'

export const WriteView = ({
  books,
  user,
  initialBookId = 'new',
  initialChapterIndex = 'new',
  onSelectionChange,
  onUnpublishChapter,
  onDeleteChapter,
  onPublish,
  onSaveDraft,
  onMonetize,
  showToast,
  onBack,
  onNotify
}: any) => {
  const [newTitle, setNewTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('Chapter 1')
  const [selectedBookId, setSelectedBookId] = useState<string>(initialBookId)
  const [selectedChapterIndex, setSelectedChapterIndex] =
    useState<string>(initialChapterIndex)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [wordCount, setWordCount] = useState(0) // Reactive word count state
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null)
  const [showToolbar, setShowToolbar] = useState(false)
  const [unpublishConfirmIdx, setUnpublishConfirmIdx] = useState<number | null>(
    null
  )
  const editorRef = useRef<HTMLDivElement>(null)
  const loadedEditorTargetRef = useRef('')
  const lastValidHtmlRef = useRef('')
  const lastValidWordCountRef = useRef(0)
  const hasShownNearLimitRef = useRef(false)
  const hasShownMaxLimitRef = useRef(false)
  const dirtyDraftRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const saveInFlightRef = useRef(false)
  const latestStateRef = useRef({
    selectedBookId: initialBookId,
    selectedChapterIndex: initialChapterIndex,
    newTitle: '',
    chapterTitle: 'Chapter 1'
  })
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(event.target as Node)
      ) {
        setShowToolbar(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

    requestAnimationFrame(() => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
        return
      }

      const range = selection.getRangeAt(0).cloneRange()
      range.collapse(false)
      const rect = range.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()
      const padding = 56

      if (rect.top === 0 && rect.bottom === 0) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
        return
      }

      if (rect.bottom > containerRect.bottom - padding) {
        scrollContainer.scrollTop +=
          rect.bottom - (containerRect.bottom - padding)
      } else if (rect.top < containerRect.top + padding) {
        scrollContainer.scrollTop -= containerRect.top + padding - rect.top
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

  const handleBeforeInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent
      if (!nativeEvent?.inputType?.startsWith('insert') || !editorRef.current)
        return

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

  const handleEditorInput = useCallback(() => {
    dirtyDraftRef.current = true
    updateWordCount()
    ensureCaretVisible()
  }, [updateWordCount, ensureCaretVisible])

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
      const chapterCountBeforeSave = selectedBook?.chapters?.length || 0
      const currentChapterIndex = isSavingNewChapter
        ? null
        : parseInt(latestStateRef.current.selectedChapterIndex, 10)
      const currentChapterTitle = latestStateRef.current.chapterTitle
      const currentContent = editorRef.current?.innerHTML || ''

      if (!currentBookId && !currentTitle.trim()) return null
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

  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  }, [])

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

    let content = ''
    let nextChapterTitle = 'Chapter 1'
    if (selectedBook && selectedChapterIndex !== 'new') {
      const idx = parseInt(selectedChapterIndex)
      if (selectedBook.chapters && selectedBook.chapters[idx]) {
        content = selectedBook.chapters[idx].content
        nextChapterTitle =
          selectedBook.chapters[idx].title || `Chapter ${idx + 1}`
      }
    } else if (selectedBook && selectedChapterIndex === 'new') {
      nextChapterTitle = `Chapter ${(selectedBook.chapters?.length || 0) + 1}`
    }

    if (editorRef.current) {
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
  }, [selectedChapterIndex, selectedBookId, selectedBook, calculateWordCount])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
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
  const isPublished =
    selectedChapterIndex !== 'new' &&
    selectedBook &&
    parseInt(selectedChapterIndex) < selectedBook.chaptersCount

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

  return (
    <div className='fixed inset-0 bg-white flex flex-col pb-20 animate-in fade-in duration-500 overflow-hidden'>
      <header className='px-6 py-6 border-b border-gray-50 flex justify-between items-center bg-white z-50'>
        <div className='flex items-center gap-4'>
          <button
            onClick={onBack}
            className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 transition-colors hover:text-accent'
          >
            <span className='material-icons-round'>arrow_back</span>
          </button>
          <div>
            <h1 className='text-xl font-bold'>Studio</h1>
          </div>
        </div>
        <Button variant='secondary' className='h-10 px-4' onClick={onMonetize}>
          <span className='material-icons-round text-sm'>paid</span> Monetize
        </Button>
      </header>

      <div
        className='flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar'
        style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
      >
        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
              Your Works
            </label>
            <select
              className='w-full bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-medium outline-none appearance-none cursor-pointer shadow-sm'
              value={selectedBookId}
              onChange={e => {
                setSelectedBookId(e.target.value)
                setSelectedChapterIndex('new')
              }}
            >
              <option value='new'>Start a New Work</option>
              {myWorks.map((w: Book) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          </div>

          {selectedBookId === 'new' && (
            <div className='space-y-1.5 animate-in slide-in-from-top duration-300'>
              <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
                Book Title
              </label>
              <input
                placeholder='Enter new book title...'
                value={newTitle}
                onChange={e => {
                  dirtyDraftRef.current = true
                  setNewTitle(e.target.value)
                }}
                className='w-full bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-accent/10'
              />
            </div>
          )}

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
              {selectedBook?.chapters?.map((ch: any, idx: number) => (
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
              }}
              className='w-full bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-accent/10'
            />
          </div>
        </div>

        <div className='relative'>
          <div className='flex justify-end sticky top-0 z-[60] pointer-events-none'>
            <div ref={toolbarRef} className='pointer-events-auto relative'>
              <button
                onClick={() => setShowToolbar(!showToolbar)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg border ${
                  showToolbar
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white text-gray-400 border-gray-100'
                }`}
                title='Formatting Options'
              >
                <span className='material-icons-round'>
                  {showToolbar ? 'close' : 'edit'}
                </span>
              </button>

              {showToolbar && (
                <div className='absolute right-0 mt-2 p-2 bg-white rounded-2xl border border-gray-100 shadow-2xl flex flex-col gap-1 animate-in slide-in-from-top-2 duration-200 z-[70] min-w-[48px]'>
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('bold')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Bold'
                  >
                    <span className='material-icons-round text-sm'>
                      format_bold
                    </span>
                  </button>
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('italic')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Italic'
                  >
                    <span className='material-icons-round text-sm'>
                      format_italic
                    </span>
                  </button>
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('underline')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Underline'
                  >
                    <span className='material-icons-round text-sm'>
                      format_underlined
                    </span>
                  </button>
                  <div className='h-px w-6 bg-gray-100 mx-auto my-1' />
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('justifyLeft')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Align Left'
                  >
                    <span className='material-icons-round text-sm'>
                      format_align_left
                    </span>
                  </button>
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('justifyCenter')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Align Center'
                  >
                    <span className='material-icons-round text-sm'>
                      format_align_center
                    </span>
                  </button>
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('justifyRight')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Align Right'
                  >
                    <span className='material-icons-round text-sm'>
                      format_align_right
                    </span>
                  </button>
                  <div className='h-px w-6 bg-gray-100 mx-auto my-1' />
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      execAction('insertUnorderedList')
                    }}
                    className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:text-accent hover:bg-accent/5 transition-all active:scale-90'
                    title='Bullet List'
                  >
                    <span className='material-icons-round text-sm'>
                      format_list_bulleted
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className='relative min-h-[400px] mt-4'>
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
              <div
                ref={editorRef}
                contentEditable='true'
                inputMode='text'
                role='textbox'
                aria-multiline='true'
                spellCheck='true'
                className='w-full min-h-[400px] bg-transparent border-none outline-none text-base leading-relaxed placeholder:text-gray-200 resize-none no-scrollbar focus:ring-0 rich-editor'
                style={{
                  WebkitUserSelect: 'text',
                  userSelect: 'text',
                  WebkitTouchCallout: 'default',
                  touchAction: 'manipulation'
                }}
                onBeforeInput={handleBeforeInput}
                onPaste={handlePaste}
                onInput={handleEditorInput}
                onTouchEnd={e => {
                  e.currentTarget.focus()
                  ensureCaretVisible()
                }}
              />
            )}
          </div>
        </div>

        {selectedChapterIndex !== 'new' && (
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
              (selectedBookId === 'new' && !newTitle.trim()) ||
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
    </div>
  )
}
