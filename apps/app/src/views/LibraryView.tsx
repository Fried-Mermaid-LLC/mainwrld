import { FREE_LIBRARY_SIZE } from '@/config/constants'
import { CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'

export const LibraryView = () => {
  const {
    user,
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
      {/* Header — 64px row, centered title + count, 24px side padding */}
      <header className='px-6 py-4 border-b border-[#eaeaea] flex items-center justify-center'>
        <div className='flex flex-col items-center gap-1'>
          <h1 className='text-[22px] font-bold leading-[1.24] text-[#1a1a1a]'>
            Library
          </h1>
          <p className='text-[13px] font-semibold text-[#9aa1a9] tracking-[0.13px] leading-[1.2]'>
            {user.isPremium
              ? `${ownedBooks.length} Books`
              : `${ownedBooks.length}/${FREE_LIBRARY_SIZE} Books`}
          </p>
        </div>
      </header>

      {/* Content — responsive grid: 2 cols mobile, 4 tablet, 6 desktop */}
      {ownedBooks.length > 0 ? (
        <div className='grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4'>
          {ownedBooks.map(b => {
            const progressData = getUserBookProgress(b.id)
            const scrollProgress = progressData.scrollProgress || 0
            const chapterIndex = progressData.chapterIndex || 0
            const chapterLabel =
              b.chapterMeta?.[chapterIndex]?.title ||
              `Chapter ${chapterIndex + 1}`
            // Overall book progress: chapters already finished (chapterIndex)
            // plus the fraction read of the current one, over the published
            // chapter count. The reader's scrollProgress is per-chapter and
            // resets to 0 on every chapter change, so showing it raw left this
            // bar empty whenever the reader had just advanced a chapter — even
            // deep into the book.
            const totalChapters = Math.max(
              b.chaptersCount || b.chapterMeta?.length || 1,
              1
            )
            const clampedChapter = Math.min(chapterIndex, totalChapters - 1)
            const bookProgress = Math.min(
              Math.round(
                ((clampedChapter + scrollProgress / 100) / totalChapters) * 100
              ),
              100
            )

            return (
              <div
                key={b.id}
                onClick={() => {
                  setSelectedBook(b)
                  setView('book-detail')
                }}
                className='flex flex-col gap-2 cursor-pointer transition-transform active:scale-95'
              >
                <div
                  className='relative aspect-[2/3] w-full rounded-[16px] overflow-hidden bg-[#fbdddd] flex flex-col justify-end px-3 py-[18px]'
                  style={{ backgroundColor: b.coverColor || '#fbdddd' }}
                >
                  <CoverImg book={b} />
                  <p className='relative z-20 mb-1.5 text-[11px] font-semibold text-white tracking-[0.13px] leading-[1.2] line-clamp-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]'>
                    {chapterLabel}
                  </p>
                  <div className='relative z-20 h-[6px] w-full bg-[#fcefef] rounded-full'>
                    <div
                      className='absolute left-0 top-px h-[4px] bg-[#ef4f49] rounded-full'
                      style={{ width: `${bookProgress}%` }}
                    />
                  </div>
                </div>
                <div className='flex flex-col gap-1'>
                  <p className='text-[13px] font-semibold text-[#1a1a1a] tracking-[0.13px] leading-[1.2] line-clamp-2'>
                    {b.title}
                  </p>
                  <p className='text-[11px] font-semibold text-[#9aa1a9] tracking-[0.66px] uppercase truncate'>
                    {b.author.displayName}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className='flex flex-col items-center justify-center gap-3 py-24 text-[#c2c8cf]'>
          <span className='material-icons-round text-4xl'>bookmarks</span>
          <p className='text-[11px] font-semibold uppercase tracking-[0.66px]'>
            Your library is empty
          </p>
        </div>
      )}
    </div>
  )
}
