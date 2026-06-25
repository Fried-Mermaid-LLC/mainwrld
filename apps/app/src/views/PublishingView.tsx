import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button, Input } from '@/components/sharedComponents'
import { GENRE_LIST } from '@/config/constants'
import { useApp } from '@/state/AppContext'

export const PublishingView = () => {
  const {
    books,
    publishingInitialData,
    handleCreateBook,
    handleUpdateBookMeta,
    handlePublishBook,
    handleUnpublish,
    handleDeleteBook,
    setEditorTarget,
    setView
  } = useApp()
  const initialData = publishingInitialData
  // Editing an existing book's metadata (set by the cover pencil button) vs.
  // creating a brand-new book.
  const editingBookId: string | undefined = initialData?.bookId
  const isEditing = !!editingBookId
  // A still-unpublished (draft) book shows the Publish Book action. Derive it
  // from the live `books` entry (whose optimistic isDraft patches land on
  // publish/unpublish) rather than the one-shot initialData snapshot — otherwise
  // the footer kept showing a stale Publish/Unpublish until a page reload. Fall
  // back to the snapshot before the books subscription has the doc (deep-load).
  const liveBook = editingBookId
    ? books.find((b: any) => b.id === editingBookId)
    : undefined
  const bookIsDraft = liveBook
    ? liveBook.isDraft !== false
    : initialData?.isDraft !== false
  const [bookTitle, setBookTitle] = useState(initialData?.title || '')
  const [isCreating, setIsCreating] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  // Two-click confirm for Unpublish Book (handleUnpublish is immediate); Delete
  // Book opens its own confirm dialog, so it needs no local guard.
  const [unpublishConfirm, setUnpublishConfirm] = useState(false)
  // Edit mode autosaves metadata; its status surfaces on the Publish button.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimerRef = useRef<number | null>(null)
  const savedResetRef = useRef<number | null>(null)
  const skipFirstAutosaveRef = useRef(true)
  const [tagline, setTagline] = useState(initialData?.tagline || '')
  const [isMature, setIsMature] = useState(initialData?.isMature || false)
  const [commentsEnabled, setCommentsEnabled] = useState(
    initialData?.commentsEnabled !== false
  )
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    initialData?.genres || []
  )
  const [hashtags, setHashtags] = useState<string>(
    initialData?.hashtags?.join(', ') || ''
  )
  const [coverImage, setCoverImage] = useState<string | null>(
    initialData?.coverImage || null
  )
  const [coverUploadError, setCoverUploadError] = useState<string>('')
  const [isProcessingCover, setIsProcessingCover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const buildPayload = () => ({
    title: bookTitle,
    tagline,
    isMature,
    commentsEnabled,
    coverImage,
    genres: selectedGenres,
    hashtags: hashtags
      .split(',')
      .map(h => h.trim().replace(/^#/, ''))
      .filter(h => h.length > 0)
  })

  // Persist metadata edits (edit mode only); status surfaces on the Publish
  // button. A freshly-uploaded cover's hosted URL replaces the local data-URL
  // so subsequent autosaves don't re-upload it.
  const flushSave = async () => {
    if (!isEditing || !editingBookId) return
    setSaveState('saving')
    const res = await handleUpdateBookMeta(editingBookId, buildPayload())
    if (res.coverUrl) setCoverImage(res.coverUrl)
    setSaveState(res.ok ? 'saved' : 'idle')
    if (res.ok) {
      if (savedResetRef.current) window.clearTimeout(savedResetRef.current)
      savedResetRef.current = window.setTimeout(() => setSaveState('idle'), 2000)
    }
  }

  const onBack = () => {
    // Flush a pending autosave so leaving never drops a recent edit.
    if (isEditing && editingBookId && saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      void handleUpdateBookMeta(editingBookId, buildPayload())
    }
    setView('write')
  }

  // Debounced autosave on any metadata change (edit mode only).
  useEffect(() => {
    if (!isEditing || !editingBookId) return
    if (skipFirstAutosaveRef.current) {
      skipFirstAutosaveRef.current = false
      return
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void flushSave()
    }, 800)
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bookTitle,
    tagline,
    selectedGenres,
    hashtags,
    isMature,
    commentsEnabled,
    coverImage
  ])

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = ev => resolve(ev.target?.result as string)
      reader.onerror = () =>
        reject(new Error('Failed to read selected image file.'))
      reader.readAsDataURL(file)
    })
  }, [])

  const compressCoverImage = useCallback(
    async (file: File): Promise<string> => {
      const rawDataUrl = await fileToDataUrl(file)
      const image = new Image()

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () =>
          reject(new Error('Failed to decode selected image.'))
        image.src = rawDataUrl
      })

      const maxWidth = 800
      const maxHeight = 1200
      const scale = Math.min(
        maxWidth / image.width,
        maxHeight / image.height,
        1
      )
      const width = Math.max(1, Math.floor(image.width * scale))
      const height = Math.max(1, Math.floor(image.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Image processing unavailable in this browser.')

      ctx.drawImage(image, 0, 0, width, height)
      return canvas.toDataURL('image/jpeg', 0.78)
    },
    [fileToDataUrl]
  )

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : prev.length < 2
        ? [...prev, genre]
        : [prev[1], genre]
    )
  }

  const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setCoverUploadError('Please choose an image file.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setCoverUploadError('File is too large. Maximum size is 1MB.')
      return
    }

    setCoverUploadError('')
    setIsProcessingCover(true)
    compressCoverImage(file)
      .then(compressed => {
        // Firestore documents cap at 1 MiB; keep cover payload comfortably below that.
        if (compressed.length > 380000) {
          setCoverUploadError('Image is still too large. Try a smaller image.')
          return
        }
        setCoverImage(compressed)
      })
      .catch(() => {
        setCoverUploadError('Failed to process image. Please try another file.')
      })
      .finally(() => {
        setIsProcessingCover(false)
      })
  }

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500 z-[300]'>
      {/* Unified header: full-bleed bar, back on the left, Monetize on the
          right, centered title (+ book subtitle when editing). */}
      <header className='relative px-6 py-4 border-b border-[#eaeaea] flex items-center justify-center'>
        <button
          onClick={onBack}
          className='absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-accent transition-colors'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <div className='flex flex-col items-center gap-1 min-w-0 px-14'>
          <h1 className='text-[22px] font-bold leading-[1.24] text-[#1a1a1a]'>
            {isEditing ? 'Book Details' : 'New Book'}
          </h1>
          {isEditing && bookTitle.trim() && (
            <p className='text-[13px] font-semibold text-[#9aa1a9] tracking-[0.13px] leading-[1.2] truncate max-w-full'>
              {bookTitle}
            </p>
          )}
        </div>
        {isEditing && (
          <button
            onClick={() => setView('monetization-request')}
            title='Monetize'
            className='absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-accent transition-colors'
          >
            <span className='material-icons-round'>paid</span>
          </button>
        )}
      </header>
      <div className='p-6 pb-32 space-y-8 max-w-3xl mx-auto w-full'>
        <div className='flex flex-col gap-8 md:flex-row-reverse md:items-start'>
          {/* Wide screens: cover on the left, title/tagline on the right
              (flex-row-reverse puts this first DOM child on the right). Mobile:
              fields stack above the cover. */}
          <div className='flex-1 space-y-8'>
            <Input
              label='Book Title'
              value={bookTitle}
              onChange={setBookTitle}
              placeholder='Enter book title...'
            />

            <Input
              label='Tagline'
              maxLength={200}
              value={tagline}
              onChange={setTagline}
              placeholder='A short, catchy hook...'
              description='Max 200 characters'
            />
          </div>

          <section className='space-y-4 shrink-0'>
          <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
            Cover Image
          </label>
          <input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            onChange={handleCoverUpload}
            className='hidden'
          />

          {coverUploadError && (
            <p className='text-[10px] font-bold text-red-500 ml-2'>
              {coverUploadError}
            </p>
          )}
          <p className='text-[10px] font-bold text-gray-500 ml-2'>
            Maximum file size: 1MB
          </p>

          {coverImage ? (
            <div className='relative w-40 aspect-[2/3] rounded-3xl overflow-hidden shadow-lg border-4 border-white group'>
              <img src={coverImage} className='w-full h-full object-cover' />
              <div className='absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className='px-4 py-2 bg-white rounded-xl text-[9px] font-bold uppercase'
                >
                  Change
                </button>
              </div>
              <button
                onClick={() => setCoverImage(null)}
                className='absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center'
              >
                <span className='material-icons-round text-sm'>close</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className='w-40 aspect-[2/3] bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2 cursor-pointer hover:border-accent hover:text-accent transition-colors'
            >
              <span className='material-icons-round'>add_photo_alternate</span>
              <span className='text-[9px] font-bold uppercase'>
                {isProcessingCover ? 'Processing...' : 'Upload'}
              </span>
            </button>
          )}
          </section>
        </div>

        <div className='space-y-2.5'>
          <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
            Genres (Select up to 2)
          </label>
          <div className='flex flex-wrap gap-2'>
            {GENRE_LIST.map(g => (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase border transition-all ${
                  selectedGenres.includes(g)
                    ? 'bg-accent text-white border-accent'
                    : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <Input
          label='Hashtags'
          placeholder='cyberpunk, dystopia, neon'
          value={hashtags}
          onChange={setHashtags}
          description='Separate with commas'
        />

        <div className='space-y-4'>
          <div className='flex justify-between items-center'>
            <span className='text-[10px] font-bold uppercase'>
              Enable Comments
            </span>
            <input
              type='checkbox'
              checked={commentsEnabled}
              onChange={() => setCommentsEnabled(!commentsEnabled)}
              className='accent-accent'
            />
          </div>

          <div className='flex justify-between items-center'>
            <span className='text-[10px] font-bold uppercase'>
              Mature Content
            </span>
            <div className='flex gap-2'>
              <button
                onClick={() => setIsMature(true)}
                className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase ${
                  isMature ? 'bg-accent text-white' : 'bg-gray-50'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => setIsMature(false)}
                className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase ${
                  !isMature ? 'bg-accent text-white' : 'bg-gray-50'
                }`}
              >
                No
              </button>
            </div>
          </div>
        </div>

        {isEditing ? (
          // Edit mode mirrors the Write Studio chapter footer: the autosave
          // status pill always stays on top, then a row of secondary book
          // actions below (Publish/Unpublish toggle + Delete).
          <div className='space-y-4'>
            {/* Always-on-top autosave status. */}
            <div className='w-full h-14 rounded-2xl bg-accent text-white shadow-xl shadow-accent/20 font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2'>
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                ? '✓ Saved'
                : 'All changes saved'}
            </div>

            {editingBookId && (
              <div className='flex gap-4'>
                <button
                  onClick={() => handleDeleteBook(editingBookId)}
                  className='flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border bg-gray-50 border-gray-100 text-gray-400 hover:text-red-500'
                >
                  <span className='material-icons-round text-sm'>
                    delete_forever
                  </span>
                  Delete Book
                </button>
                {bookIsDraft ? (
                  // Draft → publish the book; flips this button to Unpublish.
                  <button
                    disabled={isPublishing}
                    onClick={async () => {
                      setIsPublishing(true)
                      // handlePublishBook patches the live book's isDraft → the
                      // footer flips to Unpublish reactively, no local flag.
                      await handlePublishBook(editingBookId)
                      setIsPublishing(false)
                    }}
                    className='flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border bg-gray-50 border-gray-100 text-gray-400 hover:text-accent disabled:opacity-50'
                  >
                    <span className='material-icons-round text-sm'>publish</span>
                    {isPublishing ? 'Publishing…' : 'Publish Book'}
                  </button>
                ) : (
                  // Published → two-click unpublish; flips back to Publish.
                  <button
                    onClick={() => {
                      if (!unpublishConfirm) {
                        setUnpublishConfirm(true)
                        return
                      }
                      setUnpublishConfirm(false)
                      void handleUnpublish(editingBookId)
                    }}
                    className={`flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                      unpublishConfirm
                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                        : 'bg-gray-50 border-gray-100 text-gray-400 hover:text-amber-500'
                    }`}
                  >
                    <span className='material-icons-round text-sm'>
                      {unpublishConfirm ? 'priority_high' : 'unpublished'}
                    </span>
                    {unpublishConfirm ? 'Confirm Unpublish?' : 'Unpublish Book'}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-4'>
            <Button variant='outline' onClick={onBack} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              disabled={
                isProcessingCover ||
                !!coverUploadError ||
                !bookTitle.trim() ||
                isCreating
              }
              onClick={async () => {
                setIsCreating(true)
                const id = await handleCreateBook(buildPayload())
                if (id) {
                  // Hand the freshly-created draft to the chapter editor and
                  // land on its default empty Chapter 1.
                  setEditorTarget({ bookId: id, chapterIndex: '0' })
                  setView('write')
                } else {
                  setIsCreating(false)
                }
              }}
            >
              {isCreating ? 'Creating…' : 'Create Book'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
