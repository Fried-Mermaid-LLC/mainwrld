import React, { useState, useCallback, useRef } from 'react'
import { Button, Input } from '@/components/sharedComponents'
import { GENRE_LIST } from '@/config/constants'
import { useApp } from '@/state/AppContext'

export const PublishingView = () => {
  const { publishingInitialData, handlePublish, setView, currentPublishingId } =
    useApp()
  const initialData = publishingInitialData
  const onPost = handlePublish
  const onBack = () => setView('write')
  const isNewBook = !currentPublishingId
  const [tagline, setTagline] = useState(initialData?.tagline || '')
  const [isExplicit, setIsExplicit] = useState(initialData?.isExplicit || false)
  const [commentsEnabled, setCommentsEnabled] = useState(
    initialData?.commentsEnabled !== false
  )
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    initialData?.genres || []
  )
  const [hashtags, setHashtags] = useState(
    initialData?.hashtags?.join(', ') || ''
  )
  const [coverImage, setCoverImage] = useState<string | null>(
    initialData?.coverImage || null
  )
  const [coverUploadError, setCoverUploadError] = useState<string>('')
  const [isProcessingCover, setIsProcessingCover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className='fixed inset-0 bg-white overflow-y-auto p-6 animate-in slide-in-from-right duration-500 z-[300]'>
      <header className='flex justify-between items-center mb-10'>
        <h1 className='text-2xl font-bold'>
          {isNewBook ? 'Publish' : 'Add Chapter'}
        </h1>
        <button onClick={onBack} className='w-10 h-10 text-gray-300'>
          <span className='material-icons-round'>close</span>
        </button>
      </header>
      <div className='space-y-8 pb-32'>
        <section className='space-y-4'>
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

        <Input
          label='Tagline'
          maxLength={200}
          value={tagline}
          onChange={setTagline}
          placeholder='A short, catchy hook...'
          description='Max 200 characters'
        />

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
              Explicit Content
            </span>
            <div className='flex gap-2'>
              <button
                onClick={() => setIsExplicit(true)}
                className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase ${
                  isExplicit ? 'bg-accent text-white' : 'bg-gray-50'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => setIsExplicit(false)}
                className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase ${
                  !isExplicit ? 'bg-accent text-white' : 'bg-gray-50'
                }`}
              >
                No
              </button>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <Button variant='outline' onClick={onBack}>
            Cancel
          </Button>
          <Button
            disabled={isProcessingCover || !!coverUploadError}
            onClick={() => {
              onPost({
                tagline,
                isExplicit,
                commentsEnabled,
                coverImage,
                genres: selectedGenres,
                hashtags: hashtags
                  .split(',')
                  .map(h => h.trim().replace(/^#/, ''))
                  .filter(h => h.length > 0)
              })
            }}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}
