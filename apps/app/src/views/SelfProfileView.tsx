import { AvatarLayers, getHairPosition } from '@/components/avatar'
import { Button, CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'

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
    avatarConfig
  } = useApp()
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
          <div className='text-center'>
            <p className='text-lg font-bold'>
              {(() => {
                const admiring = relationships
                  .filter(r => r.admirer === user.username)
                  .map(r => r.target)
                return admiring.filter(t =>
                  relationships.some(
                    r => r.admirer === t && r.target === user.username
                  )
                ).length
              })()}
            </p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Mutuals
            </p>
          </div>
          <div className='text-center'>
            <p className='text-lg font-bold'>
              {
                relationships.filter(r => r.target === user.username)
                  .length
              }
            </p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Admirers
            </p>
          </div>
          <div className='text-center'>
            <p className='text-lg font-bold'>
              {
                relationships.filter(r => r.admirer === user.username)
                  .length
              }
            </p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Admiring
            </p>
          </div>
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
