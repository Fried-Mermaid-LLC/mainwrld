import React, { useState } from 'react'
import { Button, CoverImg } from '@/components/sharedComponents'
import { MatureCover } from '@/components/MatureCover'
import { AvatarLayers } from '@/components/avatar'
import type { Relationship, User, Book } from '@/types'
import { useApp } from '@/state/AppContext'
import { getSocialBuckets } from '@/utils/social'
import { useProfilePresence } from '@/state/hooks/useProfilePresence'
import { useReportFlow } from '@/components/reportFlow'

export const OtherProfileView = () => {
  const {
    selectedProfileUser,
    books,
    setView,
    setSelectedBook,
    handleAdmire,
    handleBlockUser,
    setSelectedChatUser,
    setSocialListUsername,
    relationships,
    user: currentUser,
    readingActivity,
    allAvatarConfigs,
    registeredUsers
  } = useApp()
  const user = selectedProfileUser!
  // Live presence: selectedProfileUser is a static snapshot taken at navigation
  // time, so it never updates while the profile is open. registeredUsers is the
  // real-time source (kept fresh by the mirror via subscribeToUsers), so read
  // isOnline/activity/currentBookId from it. (X06 Bug A fix.)
  const liveUser =
    registeredUsers.find((u: any) => u.username === user.username) ?? user
  // Presence is read from the live RTDB /world node — the same source the 3D
  // avatar renders from — so the profile's status can never drift from the
  // character in the world. Fall back to the Firestore mirror only when the
  // world layer is disabled (no RTDB configured), where /world is unavailable.
  const presence = useProfilePresence(user.username)
  // Use the live RTDB presence once its first snapshot has landed; until then
  // (and when the world layer is disabled) show the Firestore mirror so the
  // status never flashes "Offline" on open.
  const useLive = presence.rtdbAvailable && presence.ready
  const isOnline = useLive ? presence.isOnline : liveUser.isOnline
  const liveActivity = useLive ? presence.activity : liveUser.activity
  // The book id rides on the same /world node as the activity (carried by
  // useProfilePresence), so "Reading" and the book can't drift the way they did
  // when the id was read from the heartbeat-trailing Firestore mirror. Fall back
  // to the mirror only while the world layer is disabled / not yet ready.
  const liveBookId = useLive ? presence.currentBookId : liveUser.currentBookId
  // The world maps the idle state to 'Exploring'; the Firestore mirror stores it
  // as 'Idle'. Normalise the fallback path so both sources read the same word.
  const activityLabel =
    !liveActivity || liveActivity === 'Idle' ? 'Exploring' : liveActivity
  const onBack = () => setView('home')
  const onBookSelect = (b: Book) => {
    setSelectedBook(b)
    setView('book-detail')
  }
  const { sheet: reportSheet, startReport } = useReportFlow()
  const onAdmire = () => handleAdmire(user)
  const onBlock = () => handleBlockUser(user.username)
  const onReport = () => startReport('User', user.username)
  const onMessage = () => {
    setSelectedChatUser(user.username)
    setView('chat-conversation')
  }
  // Open this profile's social lists (Mutuals / Admirers / Admiring), scoped to
  // the viewed user so SocialListView resolves their graph (and Back returns
  // here rather than to the Me profile).
  const openSocialList = (v: 'mutuals' | 'admirers' | 'admiring') => {
    setSocialListUsername(user.username)
    setView(v)
  }
  const currentUsername = currentUser.username
  const avatarConfig = allAvatarConfigs[user.username] || null
  const favoriteBookIds = new Set(
    registeredUsers.find(
      (u: any) => u.username === user.username
    )?.favoriteBookIds || []
  )
  const [showMenu, setShowMenu] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const isAdmiring = relationships.some(
    (r: Relationship) =>
      r.admirer === currentUsername && r.target === user.username
  )
  const theyAdmireMe = relationships.some(
    (r: Relationship) =>
      r.admirer === user.username && r.target === currentUsername
  )
  const isMutual = isAdmiring && theyAdmireMe
  // Disjoint buckets: mutual pairs are counted only under Mutuals, so the three
  // counts match the (also disjoint) lists they open.
  const social = getSocialBuckets(relationships, user.username)
  const theirAdmirers = social.admirers.length
  const theirAdmiring = social.admiring.length
  const theirMutuals = social.mutuals.length

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in slide-in-from-right duration-500'>
      {reportSheet}
      <header className='p-6 flex items-center gap-4 sticky top-0 bg-white/80 backdrop-blur-xl z-50'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold flex-1'>Profile</h1>
        <div className='relative'>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
          >
            <span className='material-icons-round'>more_vert</span>
          </button>
          {showMenu && (
            <>
              <div
                className='fixed inset-0 z-40'
                onClick={() => setShowMenu(false)}
              />
              <div className='absolute right-0 top-12 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 w-48'>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onReport()
                  }}
                  className='w-full p-4 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors'
                >
                  <span className='material-icons-round text-sm text-gray-400'>
                    flag
                  </span>
                  <span className='text-sm font-bold'>Report User</span>
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    setShowBlockConfirm(true)
                  }}
                  className='w-full p-4 text-left flex items-center gap-3 hover:bg-red-50 transition-colors text-red-500'
                >
                  <span className='material-icons-round text-sm'>block</span>
                  <span className='text-sm font-bold'>Block User</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Block confirmation modal */}
      {showBlockConfirm && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-6 animate-in fade-in duration-200'>
          <div className='bg-white rounded-[2rem] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300'>
            <div className='text-center space-y-3'>
              <div className='w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto'>
                <span className='material-icons-round text-red-500 text-3xl'>
                  block
                </span>
              </div>
              <h2 className='text-lg font-bold'>Block @{user.username}?</h2>
              <p className='text-sm text-gray-400 leading-relaxed'>
                They won't be able to see your profile, and you won't see their
                content, comments, or avatar in the world. You can unblock them
                later in Settings.
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => setShowBlockConfirm(false)}
                className='flex-1 py-4 rounded-2xl bg-gray-100 text-sm font-bold transition-all active:scale-95'
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowBlockConfirm(false)
                  onBlock()
                }}
                className='flex-1 py-4 rounded-2xl bg-red-500 text-white text-sm font-bold transition-all active:scale-95'
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
      <div className='p-6 flex flex-col items-center max-w-3xl mx-auto w-full'>
        {avatarConfig ? (
          <div className='w-32 h-32 rounded-[3rem] overflow-hidden border-4 border-white shadow-2xl mb-6 relative bg-gray-50'>
            <AvatarLayers
              avatarConfig={avatarConfig}
              containerClassName='absolute left-1/2'
              containerStyle={{
                width: '140px',
                height: '194px',
                transform: 'translateX(-50%) scale(2)',
                transformOrigin: 'top center',
                top: '8%'
              }}
            />
          </div>
        ) : (
          <div className='w-32 h-32 rounded-[3rem] bg-gray-50 flex items-center justify-center text-gray-400 text-5xl font-bold mb-6 border-4 border-white shadow-2xl overflow-hidden'>
            <span className='material-icons-round text-6xl'>person</span>
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
        <p className='text-xs text-gray-300 font-bold uppercase tracking-widest mb-4'>
          @{user.username}
        </p>

        {isMutual ? (
          <div className='flex items-center gap-2 mb-10'>
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
            <span className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>
              {/* Drive "Reading" from the live activity, not the never-emptying
                  readingActivity history (which made a mutual read "Reading"
                  forever after one read). X06 Bug B fix. */}
              {isOnline ? `Online • ${activityLabel}` : 'Offline'}
            </span>
          </div>
        ) : (
          <div className='mb-10' />
        )}

        <div className='grid grid-cols-3 gap-8 w-full max-w-sm mb-10'>
          <button
            onClick={() => openSocialList('admirers')}
            className='text-center transition-transform active:scale-95 cursor-pointer'
          >
            <p className='text-lg font-bold text-accent'>{theirAdmirers}</p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Admirers
            </p>
          </button>
          <button
            onClick={() => openSocialList('admiring')}
            className='text-center transition-transform active:scale-95 cursor-pointer'
          >
            <p className='text-lg font-bold text-accent'>{theirAdmiring}</p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Admiring
            </p>
          </button>
          <button
            onClick={() => openSocialList('mutuals')}
            className='text-center transition-transform active:scale-95 cursor-pointer'
          >
            <p className='text-lg font-bold text-accent'>{theirMutuals}</p>
            <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
              Mutuals
            </p>
          </button>
        </div>

        <div className='flex gap-3 w-full max-w-sm mb-12'>
          {isMutual ? (
            <Button onClick={onAdmire} variant='secondary' className='flex-1'>
              <span className='material-icons-round text-sm'>people</span>{' '}
              Mutual
            </Button>
          ) : (
            <Button
              onClick={onAdmire}
              variant={isAdmiring ? 'secondary' : 'primary'}
              className='flex-1'
            >
              {isAdmiring ? 'Admiring' : 'Admire'}
            </Button>
          )}
          {isMutual && (
            <Button variant='outline' className='flex-1' onClick={onMessage}>
              <span className='material-icons-round text-sm'>chat</span> Message
            </Button>
          )}
        </div>

        <section className='w-full space-y-6 px-4 mb-10'>
          {/* Currently Reading — only visible to mutuals */}
          {isMutual ? (
            (() => {
              // Only show "Currently Reading" while the mutual is ACTUALLY
              // reading right now (live presence), not for a stale history
              // entry from days ago. X06 requirement. The live reading state is
              // the RTDB /world activity; the book id still comes from the
              // Firestore mirror (currentBookId — /world doesn't carry it).
              const isReadingNow =
                isOnline && liveActivity === 'Reading' && !!liveBookId
              const activities = readingActivity[user.username] || []
              const activity = isReadingNow
                ? activities.find((a: any) => a.bookId === liveBookId) || null
                : null
              const readingBook = isReadingNow
                ? books.find((b: Book) => b.id === liveBookId)
                : null
              if (readingBook) {
                const timeSince = (() => {
                  if (!activity) return 'Just now'
                  const diff =
                    Date.now() - new Date(activity.lastRead).getTime()
                  const mins = Math.floor(diff / 60000)
                  if (mins < 1) return 'Just now'
                  if (mins < 60) return `${mins}m ago`
                  const hrs = Math.floor(mins / 60)
                  if (hrs < 24) return `${hrs}h ago`
                  return `${Math.floor(hrs / 24)}d ago`
                })()
                return (
                  <>
                    <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
                      Currently Reading
                    </h3>
                    <button
                      onClick={() => onBookSelect(readingBook)}
                      className='w-full bg-gray-50 p-5 rounded-[2rem] border border-gray-100 flex gap-4 items-center transition-all active:scale-[0.98] hover:border-accent/30 group'
                    >
                      <div
                        className='w-14 h-20 overflow-hidden relative flex-shrink-0 shadow-md'
                        style={{ backgroundColor: readingBook.coverColor }}
                      >
                        <CoverImg book={readingBook} />
                      </div>
                      <div className='flex-1 text-left space-y-2'>
                        <p className='text-sm font-bold group-hover:text-accent transition-colors'>
                          {readingBook.title}
                        </p>
                        <p className='text-[10px] text-gray-400 font-medium'>
                          by {readingBook.author.displayName}
                        </p>
                        <div className='flex items-center gap-3'>
                          <div className='flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden'>
                            <div
                              className='h-full bg-accent rounded-full transition-all'
                              style={{ width: `${activity?.progress || 0}%` }}
                            />
                          </div>
                          <span className='text-[9px] font-bold text-gray-400'>
                            {activity?.progress || 0}%
                          </span>
                        </div>
                      </div>
                      <div className='flex flex-col items-end gap-1 flex-shrink-0'>
                        <span className='text-[8px] font-bold text-accent uppercase tracking-widest'>
                          {timeSince}
                        </span>
                        <span className='material-icons-round text-gray-300 text-sm'>
                          chevron_right
                        </span>
                      </div>
                    </button>
                  </>
                )
              }
              return (
                <>
                  <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
                    Activity
                  </h3>
                  <div className='bg-gray-50 p-6 rounded-[2rem] border border-gray-100 text-center'>
                    <span className='material-icons-round text-gray-200 text-3xl mb-2'>
                      menu_book
                    </span>
                    <p className='text-[10px] font-bold text-gray-300 uppercase tracking-widest'>
                      Not reading anything right now
                    </p>
                  </div>
                </>
              )
            })()
          ) : (
            <>
              <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
                Activity
              </h3>
              <div className='bg-gray-50 p-6 rounded-[2rem] border border-gray-100 text-center'>
                <span className='material-icons-round text-gray-200 text-2xl mb-2'>
                  lock
                </span>
                <p className='text-[10px] font-bold text-gray-300 uppercase tracking-widest'>
                  Become mutuals to see activity
                </p>
              </div>
            </>
          )}

          <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
            Works
          </h3>
          <div className='flex gap-6 overflow-x-auto no-scrollbar pb-2'>
            {/* Filtered to only show published books */}
            {books
              .filter(
                (b: Book) => b.author.username === user.username && !b.isDraft
              )
              .map((b: Book) => (
                <div
                  key={b.id}
                  onClick={() => onBookSelect(b)}
                  className='flex-shrink-0 w-32 space-y-2 cursor-pointer transition-transform active:scale-95'
                >
                  <div
                    className='aspect-[2/3] shadow-md border-1 border-white overflow-hidden relative'
                    style={{ backgroundColor: b.coverColor }}
                  >
                    <MatureCover book={b} />
                  </div>
                  <div className='px-1'>
                    <p className='text-[10px] font-bold truncate'>{b.title}</p>
                    <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                      {b.author.displayName}
                    </p>
                  </div>
                </div>
              ))}
            {books.filter(
              (b: Book) => b.author.username === user.username && !b.isDraft
            ).length === 0 && (
              <p className='text-[10px] font-bold text-gray-300 uppercase text-center py-10 w-full'>
                No published works yet
              </p>
            )}
          </div>

          <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2 mt-10'>
            Favorites
          </h3>
          <div className='flex gap-6 overflow-x-auto no-scrollbar pb-2'>
            {books
              .filter((b: Book) => favoriteBookIds.has(b.id))
              .map((b: Book) => (
                <div
                  key={b.id}
                  onClick={() => onBookSelect(b)}
                  className='flex-shrink-0 w-32 cursor-pointer space-y-2'
                >
                  <div
                    className='aspect-[2/3] shadow-md border-1 border-white overflow-hidden relative'
                    style={{ backgroundColor: b.coverColor }}
                  >
                    <MatureCover book={b} />
                  </div>
                  <div className='px-1'>
                    <p className='text-[10px] font-bold truncate'>{b.title}</p>
                    <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                      {b.author.displayName}
                    </p>
                  </div>
                </div>
              ))}
            {books.filter((b: Book) => favoriteBookIds.has(b.id)).length ===
              0 && (
              <p className='text-[10px] font-bold text-gray-300 uppercase py-4'>
                No favorites yet
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
