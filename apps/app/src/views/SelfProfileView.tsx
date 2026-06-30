import { AvatarLayers, getHairPosition } from '@/components/avatar'
import { Button, CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'
import { getSocialBuckets } from '@/utils/social'

const BookSkeletons = ({ count = 3 }: { count?: number }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className='flex-shrink-0 w-32 space-y-2 animate-pulse'>
        <div className='aspect-[2/3] bg-gray-100 rounded' />
        <div className='px-1 space-y-1.5'>
          <div className='h-2.5 w-4/5 bg-gray-100 rounded' />
          <div className='h-2 w-1/2 bg-gray-100 rounded' />
        </div>
      </div>
    ))}
  </>
)

export const SelfProfileView = () => {
  const {
    setView,
    user,
    books,
    booksLoading,
    setSelectedBook,
    relationships,
    avatarConfig,
    readingActivity,
    setSocialListUsername
  } = useApp()

  // The social lists (Mutuals / Admirers / Admiring) are shared with other
  // profiles; clearing the target scopes them to the signed-in user.
  const openSocialList = (v: 'mutuals' | 'admirers' | 'admiring') => {
    setSocialListUsername(null)
    setView(v)
  }
  // Disjoint counts: a mutual is only counted under Mutuals, never under
  // Admirers/Admiring (matches the lists those counts open).
  const social = getSocialBuckets(relationships, user.username)

  // Last Read — most recent reading activity for the current user. Entries are
  // updated in place (not reordered) when a book is re-read, so sort by
  // lastRead rather than trusting array order. Draft / deleted books are
  // skipped so the card always points at something openable.
  const lastRead = (() => {
    const activities = readingActivity[user.username] || []
    const sorted = [...activities].sort(
      (a, b) => new Date(b.lastRead).getTime() - new Date(a.lastRead).getTime()
    )
    for (const activity of sorted) {
      const book = books.find(b => b.id === activity.bookId && !b.isDraft)
      if (book) return { book, activity }
    }
    return null
  })()

  const lastReadTimeSince = (() => {
    if (!lastRead) return ''
    const diff = Date.now() - new Date(lastRead.activity.lastRead).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })()

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
      {/* Centered title + subtitle, matching the Library / Write Studio headers.
          Settings stays reachable via the gear pinned on the right. */}
      <header className='relative px-6 py-4 border-b border-[#eaeaea] flex items-center justify-center'>
        <div className='flex flex-col items-center gap-1'>
          <div className='flex items-center gap-1.5'>
            <h1 className='text-[22px] font-bold leading-[1.24] text-[#1a1a1a]'>
              {user.displayName}
            </h1>
            {user.isPremium && (
              <span className='material-icons-round text-pink-500 text-lg'>
                workspace_premium
              </span>
            )}
          </div>
          <p className='text-[13px] font-semibold text-[#9aa1a9] tracking-[0.13px] leading-[1.2]'>
            @{user.username}
          </p>
        </div>
        <button
          onClick={() => setView('settings')}
          className='absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>settings</span>
        </button>
      </header>
      <div className='p-6 flex flex-col items-center max-w-3xl mx-auto w-full'>
        {avatarConfig ? (
          <div className='w-36 h-36 rounded-[3rem] overflow-hidden border-4 border-white shadow-2xl mb-6 relative bg-gray-50'>
            <AvatarLayers
              avatarConfig={avatarConfig}
              containerClassName='absolute left-1/2'
              containerStyle={{
                width: '140px',
                height: '194px',
                transform: 'translateX(-50%) scale(2.2)',
                transformOrigin: 'top center',
                top: '8%'
              }}
              hairShrink={0.92}
              hairShift={-0.05}
              hairStyleOverride={(() => {
                const pos = getHairPosition(
                  avatarConfig.hairId,
                  0.91,
                  -0.05
                )
                const top = parseFloat(pos.top)
                return { ...pos, top: `${(top + 0.4).toFixed(3)}%` }
              })()}
            />
          </div>
        ) : (
          <div className='w-32 h-32 rounded-[3rem] bg-accent/5 flex items-center justify-center text-accent text-5xl font-bold mb-6 border-4 border-white shadow-2xl'>
            {user.displayName[0]}
          </div>
        )}
        <div className='grid grid-cols-4 gap-4 w-full px-4 mb-10'>
          <div className='text-center'>
            <p className='text-lg font-bold'>{user.points}</p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Points
            </p>
          </div>
          <button
            onClick={() => openSocialList('mutuals')}
            className='text-center transition-transform active:scale-95 cursor-pointer'
          >
            <p className='text-lg font-bold text-accent'>
              {social.mutuals.length}
            </p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Mutuals
            </p>
          </button>
          <button
            onClick={() => openSocialList('admirers')}
            className='text-center transition-transform active:scale-95 cursor-pointer'
          >
            <p className='text-lg font-bold text-accent'>
              {social.admirers.length}
            </p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Admirers
            </p>
          </button>
          <button
            onClick={() => openSocialList('admiring')}
            className='text-center transition-transform active:scale-95 cursor-pointer'
          >
            <p className='text-lg font-bold text-accent'>
              {social.admiring.length}
            </p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Admiring
            </p>
          </button>
        </div>
        <Button
          className='w-full max-w-xs mb-10'
          onClick={() => setView('customization')}
        >
          <span className='material-icons-round'>palette</span> CUSTOMIZE
        </Button>
        <section className='w-full space-y-6 mb-12'>
          <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
            Works
          </h3>
          <div className='flex gap-6 overflow-x-auto no-scrollbar px-2'>
            {/* Updated to filter out drafts */}
            {books
              .filter(
                b => b.author.username === user.username && !b.isDraft
              )
              .map(b => (
                <div
                  key={b.id}
                  onClick={() => {
                    setSelectedBook(b)
                    setView('book-detail')
                  }}
                  className='flex-shrink-0 w-32 cursor-pointer space-y-2'
                >
                  <div
                    className={`aspect-[2/3] shadow-md overflow-hidden relative ${
                      b.isDraft ? 'opacity-50' : ''
                    }`}
                    style={{ backgroundColor: b.coverColor }}
                  >
                    <CoverImg book={b} />
                    {b.isMonetized && (
                      <div className='absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-green-500 text-white text-[8px] font-bold uppercase tracking-wider flex items-center gap-0.5 shadow'>
                        <span className='material-icons-round text-[10px]'>
                          paid
                        </span>
                        Monetized
                      </div>
                    )}
                  </div>
                  <div className='px-1'>
                    <p className='text-xs font-bold truncate'>
                      {b.title}
                    </p>
                    <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                      {b.author.displayName}
                    </p>
                  </div>
                </div>
              ))}
            {booksLoading && <BookSkeletons />}
            {!booksLoading &&
              books.filter(
                b => b.author.username === user.username && !b.isDraft
              ).length === 0 && (
                <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest ml-2 py-4'>
                  No published works
                </p>
              )}
          </div>
        </section>
        {lastRead && (
          <section className='w-full space-y-6 mb-12'>
            <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
              Last Read
            </h3>
            <button
              onClick={() => {
                setSelectedBook(lastRead.book)
                setView('book-detail')
              }}
              className='w-full bg-gray-50 p-5 rounded-[2rem] border border-gray-100 flex gap-4 items-center transition-all active:scale-[0.98] hover:border-accent/30 group'
            >
              <div
                className='w-14 h-20 overflow-hidden relative flex-shrink-0 shadow-md'
                style={{ backgroundColor: lastRead.book.coverColor }}
              >
                <CoverImg book={lastRead.book} />
              </div>
              <div className='flex-1 text-left space-y-2'>
                <p className='text-sm font-bold group-hover:text-accent transition-colors'>
                  {lastRead.book.title}
                </p>
                <p className='text-[10px] text-gray-400 font-medium'>
                  by {lastRead.book.author.displayName}
                </p>
                <div className='flex items-center gap-3'>
                  <div className='flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden'>
                    <div
                      className='h-full bg-accent rounded-full transition-all'
                      style={{ width: `${lastRead.activity.progress || 0}%` }}
                    />
                  </div>
                  <span className='text-[9px] font-bold text-gray-400'>
                    {lastRead.activity.progress || 0}%
                  </span>
                </div>
              </div>
              <div className='flex flex-col items-end gap-1 flex-shrink-0'>
                <span className='text-[8px] font-bold text-accent uppercase tracking-widest'>
                  {lastReadTimeSince}
                </span>
                <span className='material-icons-round text-gray-300 text-sm'>
                  chevron_right
                </span>
              </div>
            </button>
          </section>
        )}
        <section className='w-full space-y-6'>
          <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
            Favorites
          </h3>
          <div className='flex gap-6 overflow-x-auto no-scrollbar px-2'>
            {books
              .filter(b => b.isFavorite)
              .map(b => (
                <div
                  key={b.id}
                  onClick={() => {
                    setSelectedBook(b)
                    setView('book-detail')
                  }}
                  className='flex-shrink-0 w-32 cursor-pointer space-y-2'
                >
                  <div
                    className='aspect-[2/3] shadow-md overflow-hidden relative'
                    style={{ backgroundColor: b.coverColor }}
                  >
                    <CoverImg book={b} />
                  </div>
                  <div className='px-1'>
                    <p className='text-xs font-bold truncate'>
                      {b.title}
                    </p>
                    <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                      {b.author.displayName}
                    </p>
                  </div>
                </div>
              ))}
            {booksLoading && <BookSkeletons />}
            {!booksLoading && books.filter(b => b.isFavorite).length === 0 && (
              <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest ml-2 py-4'>
                No favorites yet
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
