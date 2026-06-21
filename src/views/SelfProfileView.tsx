import { AvatarLayers, getHairPosition } from '@/components/avatar'
import { Button, CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'

export const SelfProfileView = () => {
  const {
    setView,
    user,
    books,
    setSelectedBook,
    setLastSelectedBookId,
    setLastSelectedChapterIndex,
    setWriteReturnView,
    relationships,
    avatarConfig
  } = useApp()
  const openDraft = (bookId: string) => {
    setLastSelectedBookId(bookId)
    setLastSelectedChapterIndex('0')
    setWriteReturnView('self-profile')
    setView('write')
  }
  const myDrafts = books.filter(
    b => b.author.username === user.username && b.isDraft
  )
  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
      <header className='p-6 flex justify-end items-center sticky top-0 bg-white/80 backdrop-blur-md z-50'>
        <div className='flex gap-2'>
          <button
            onClick={() => setView('settings')}
            className='w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400'
          >
            <span className='material-icons-round'>settings</span>
          </button>
        </div>
      </header>
      <div className='p-6 flex flex-col items-center'>
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
        <div className='flex items-center gap-2'>
          <h1 className='text-2xl font-bold'>{user.displayName}</h1>
          {user.isPremium && (
            <span className='material-icons-round text-pink-500 text-lg'>
              workspace_premium
            </span>
          )}
        </div>
        <p className='text-xs text-gray-300 font-bold uppercase tracking-widest mb-10'>
          @{user.username}
        </p>
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
            Your Works
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
            {books.filter(
              b => b.author.username === user.username && !b.isDraft
            ).length === 0 && (
              <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest ml-2 py-4'>
                No published works
              </p>
            )}
          </div>
        </section>
        <section className='w-full space-y-6 mb-12'>
          <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
            Your Drafts
          </h3>
          <div className='flex gap-6 overflow-x-auto no-scrollbar px-2'>
            {myDrafts.map(b => (
              <div
                key={b.id}
                onClick={() => openDraft(b.id)}
                className='flex-shrink-0 w-32 cursor-pointer space-y-2'
              >
                <div
                  className='aspect-[2/3] shadow-md overflow-hidden relative'
                  style={{ backgroundColor: b.coverColor }}
                >
                  <CoverImg book={b} />
                  <span className='absolute top-1 left-1 bg-black/60 text-white text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded'>
                    Draft
                  </span>
                </div>
                <div className='px-1'>
                  <p className='text-xs font-bold truncate'>{b.title}</p>
                  <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                    {b.author.displayName}
                  </p>
                </div>
              </div>
            ))}
            {myDrafts.length === 0 && (
              <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest ml-2 py-4'>
                No drafts yet
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
            {books.filter(b => b.isFavorite).length === 0 && (
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
