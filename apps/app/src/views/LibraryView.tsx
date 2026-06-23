import { MAX_LIBRARY_SIZE } from '@/config/constants'
import { CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'

export const LibraryView = () => {
  const {
    setView,
    books,
    setSelectedBook,
    blockedUsers,
    getUserOwnedBookIds,
    getUserBookProgress
  } = useApp()
  const ownedIds = getUserOwnedBookIds()
  const ownedBooks = books.filter(
    b => ownedIds.has(b.id) && !blockedUsers.has(b.author.username)
  )

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
      <header className='p-6 border-b border-gray-50 flex justify-between items-center'>
        <div>
          <h1 className='text-2xl font-bold'>Library</h1>
          <p className='text-[10px] font-bold text-gray-300 uppercase tracking-widest'>
            {ownedBooks.length}/{MAX_LIBRARY_SIZE} Saved
          </p>
        </div>
        <div className='w-24 h-2 bg-gray-50 rounded-full overflow-hidden'>
          <div
            className='h-full bg-accent'
            style={{
              width: `${(ownedBooks.length / MAX_LIBRARY_SIZE) * 100}%`
            }}
          />
        </div>
      </header>
      <div className='flex flex-wrap gap-4 p-6'>
        {ownedBooks.map(b => {
          const progressData = getUserBookProgress(b.id)
          const scrollProgress = progressData.scrollProgress || 0
          const chapterIndex = progressData.chapterIndex || 0
          const currentChapterTitle =
            b.chapterMeta?.[chapterIndex]?.title || null

          return (
            <div
              key={b.id}
              onClick={() => {
                setSelectedBook(b)
                setView('book-detail')
              }}
              className='space-y-2 cursor-pointer w-28'
            >
              <div
                className='aspect-[2/3] rounded-2x1 shadow-lg overflow-hidden relative'
                style={{ backgroundColor: b.coverColor }}
              >
                <CoverImg book={b} />
                <div className='absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent z-20'>
                  {currentChapterTitle && (
                    <p className='text-xs text-white font-semibold mb-1 truncate'>
                      {currentChapterTitle}
                    </p>
                  )}
                  <p className='text-[10px] text-white/80 font-bold uppercase tracking-wider mb-1'>
                    {scrollProgress}% Read
                  </p>
                  <div className='w-full h-1.5 bg-white/30 rounded-full overflow-hidden'>
                    <div
                      className='h-full bg-accent'
                      style={{ width: `${scrollProgress}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className='px-1'>
                <p className='text-xs font-bold truncate'>{b.title}</p>
                <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                  {b.author.displayName}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
