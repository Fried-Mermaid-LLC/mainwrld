import React, { useState, useMemo } from 'react'
import { CoverImg } from '@/components/sharedComponents'
import { AvatarLayers } from '@/components/avatar'
import { GENRE_LIST } from '@/config/constants'
import type { Book, User } from '@/types'

export const ExploreView = ({
  books,
  spotlightSourceBooks = [],
  spotlightBookId = null,
  onSelect,
  onAuthorSelect,
  onOwnSelect,
  users = [],
  onUserSelect,
  avatarConfigs = {},
  blockedUsers = new Set(),
  readingActivity = {},
  currentUsername = '',
  userFavoriteGenres = []
}: any) => {
  const [showFilter, setShowFilter] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  )

  const query = searchQuery.toLowerCase().trim()
  const isHashtagSearch = query.startsWith('#')
  const cleanQuery = isHashtagSearch ? query.slice(1) : query

  const filteredBooks = useMemo(() => {
    let result = books.filter((b: Book) => {
      if (b.isDraft) return false
      if (!cleanQuery) return true
      if (isHashtagSearch) {
        // Search hashtags only
        return (b.hashtags || []).some((h: string) =>
          h.toLowerCase().includes(cleanQuery)
        )
      }

      // Search title, author name, username, tagline, and hashtags
      const matchesTitle = b.title.toLowerCase().includes(cleanQuery)
      const matchesAuthor =
        b.author.displayName.toLowerCase().includes(cleanQuery) ||
        b.author.username.toLowerCase().includes(cleanQuery)
      const matchesTagline = (b.tagline || '')
        .toLowerCase()
        .includes(cleanQuery)
      const matchesHashtags = (b.hashtags || []).some((h: string) =>
        h.toLowerCase().includes(cleanQuery)
      )
      return matchesTitle || matchesAuthor || matchesTagline || matchesHashtags
    })

    if (selectedGenres.length > 0) {
      result = result.filter((b: Book) =>
        selectedGenres.some(g => (b.genres || []).includes(g))
      )
    }

    result = [...result].sort((a: Book, b: Book) => {
      const dateA = new Date(a.publishedDate).getTime()
      const dateB = new Date(b.publishedDate).getTime()
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
    })

    return result
  }, [books, cleanQuery, isHashtagSearch, selectedGenres, sortOrder])

  // User search results — only show when searching and not a hashtag search
  const filteredUsers = useMemo(() => {
    if (!cleanQuery || isHashtagSearch) return []
    return (users as User[])
      .filter((u: User) => {
        if (blockedUsers.has(u.username)) return false
        return (
          u.displayName.toLowerCase().includes(cleanQuery) ||
          u.username.toLowerCase().includes(cleanQuery)
        )
      })
      .slice(0, 5) // Limit to 5 results
  }, [users, cleanQuery, isHashtagSearch, blockedUsers])

  const spotlightBook = useMemo(() => {
    const sourceBooks: Book[] =
      (spotlightSourceBooks as Book[]).length > 0
        ? (spotlightSourceBooks as Book[])
        : books
    const publicBooks = sourceBooks.filter((b: Book) => !b.isDraft)
    if (publicBooks.length === 0) return null

    const sortedByFaves = [...publicBooks].sort((a, b) => {
      const diff = (b.favoritesLastWeek || 0) - (a.favoritesLastWeek || 0)
      if (diff !== 0) return diff
      return (
        new Date(b.publishedDate).getTime() -
        new Date(a.publishedDate).getTime()
      )
    })

    if (spotlightBookId) {
      const persisted = publicBooks.find((b: Book) => b.id === spotlightBookId)
      if (persisted) return persisted
    }

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const weekEpoch = Math.floor(Date.now() / WEEK_MS)
    const spotlightIndex =
      ((weekEpoch % sortedByFaves.length) + sortedByFaves.length) %
      sortedByFaves.length
    return sortedByFaves[spotlightIndex]
  }, [books, spotlightSourceBooks, spotlightBookId])

  const topAuthors = useMemo(() => {
    const authorMap: Record<string, { user: User; totalLikes: number }> = {}
    books
      .filter((b: Book) => !b.isDraft)
      .forEach((b: Book) => {
        const username = b.author.username
        if (!authorMap[username]) {
          authorMap[username] = { user: b.author, totalLikes: 0 }
        }
        authorMap[username].totalLikes += Array.isArray(b.likes)
          ? b.likes.reduce((a: number, c: number) => a + c, 0)
          : b.likes || 0
      })
    return Object.values(authorMap)
      .sort((a, b) => b.totalLikes - a.totalLikes)
      .slice(0, 10)
  }, [books])

  // Trending Books: sorted by likes (likes per hour by using total likes + recency)
  const trendingBooks = useMemo(() => {
    return [...books]
      .sort((a: Book, b: Book) => {
        const now = Date.now()
        const ageA =
          (now - new Date(a.publishedDate).getTime()) / (1000 * 60 * 60) // hours
        const ageB =
          (now - new Date(b.publishedDate).getTime()) / (1000 * 60 * 60)
        const totalLikesA = Array.isArray(a.likes)
          ? a.likes.reduce((x: number, y: number) => x + y, 0)
          : a.likes || 0
        const totalLikesB = Array.isArray(b.likes)
          ? b.likes.reduce((x: number, y: number) => x + y, 0)
          : b.likes || 0
        const scoreA = totalLikesA / Math.max(ageA, 1) // likes per hour
        const scoreB = totalLikesB / Math.max(ageB, 1)
        return scoreB - scoreA
      })
      .slice(0, 10)
  }, [books])

  // Recently Read: last 3 books the user has been reading
  const recentlyRead = useMemo(() => {
    const activities = readingActivity[currentUsername]
    if (!activities || activities.length === 0) return []
    return activities
      .sort(
        (a, b) =>
          new Date(b.lastRead).getTime() - new Date(a.lastRead).getTime()
      )
      .slice(0, 3)
      .map(a => books.find((b: Book) => b.id === a.bookId))
      .filter(Boolean)
  }, [books, readingActivity, currentUsername])

  // Recommended: trending books matching user's top 2 favorite genres
  const recommendedBooks = useMemo(() => {
    if (userFavoriteGenres.length === 0) {
      // Fallback to trending if no favorite genres
      return trendingBooks.slice(0, 6)
    }
    return trendingBooks
      .filter((b: Book) =>
        (b.genres || []).some((g: string) => userFavoriteGenres.includes(g))
      )
      .slice(0, 10)
  }, [trendingBooks, userFavoriteGenres])

  return (
    <div className='fixed inset-0 bg-[#fbfbfc] overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
      <header className='p-6 sticky top-0 bg-white/90 backdrop-blur-2xl z-50 border-b border-gray-100'>
        <div className='flex gap-4 items-center'>
          <div className='flex-1 bg-gray-100/50 rounded-2xl flex items-center px-4 py-3.5 gap-3 border border-gray-100'>
            <span className='material-icons-round text-gray-400'>search</span>
            <input
              placeholder='Search books, users, #hashtags...'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='bg-transparent outline-none text-sm w-full font-medium placeholder:text-gray-400'
            />
          </div>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              showFilter
                ? 'bg-accent text-white shadow-lg shadow-accent/30'
                : 'bg-white text-gray-400 border border-gray-100 hover:bg-gray-50'
            }`}
          >
            <span className='material-icons-round'>tune</span>
          </button>
        </div>
        {showFilter && (
          <div className='mt-4 p-5 bg-white rounded-3xl space-y-5 animate-in slide-in-from-top border border-gray-100 shadow-xl shadow-black/[0.03]'>
            <div className='flex flex-wrap gap-2'>
              {GENRE_LIST.map(g => (
                <button
                  key={g}
                  onClick={() =>
                    setSelectedGenres(prev =>
                      prev.includes(g)
                        ? prev.filter(x => x !== g)
                        : [...prev, g]
                    )
                  }
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all tracking-wider ${
                    selectedGenres.includes(g)
                      ? 'bg-accent text-white border-accent'
                      : 'bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className='flex justify-between items-center border-t border-gray-50 pt-4'>
              <p className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>
                Sort order
              </p>
              <select
                className='text-[10px] font-bold bg-gray-50 px-3 py-2 rounded-lg outline-none cursor-pointer text-gray-700'
                value={sortOrder}
                onChange={e =>
                  setSortOrder(e.target.value as 'newest' | 'oldest')
                }
              >
                <option value='newest'>Newest First</option>
                <option value='oldest'>Oldest First</option>
              </select>
            </div>
          </div>
        )}
      </header>

      <main className='space-y-12 py-8'>
        {/* User Search Results */}
        {filteredUsers.length > 0 && (
          <section className='px-6 space-y-3'>
            <h3 className='text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-2'>
              People
            </h3>
            <div className='bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm'>
              {filteredUsers.map((u: User) => (
                <button
                  key={u.username}
                  onClick={() => onUserSelect(u)}
                  className='w-full p-4 flex items-center gap-4 border-b border-gray-50 last:border-none hover:bg-gray-50 transition-colors active:scale-[0.98]'
                >
                  <div className='w-11 h-11 rounded-2xl bg-accent/10 flex items-center justify-center text-accent text-lg font-bold flex-shrink-0'>
                    {u.displayName[0]}
                  </div>
                  <div className='text-left flex-1 min-w-0'>
                    <p className='text-sm font-bold truncate'>
                      {u.displayName}
                    </p>
                    <p className='text-[10px] text-gray-400 font-bold'>
                      @{u.username}
                    </p>
                  </div>
                  <div className='flex items-center gap-1 text-gray-300'>
                    <span className='material-icons-round text-sm'>
                      chevron_right
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* When searching — show flat results list */}
        {query && (
          <section className='space-y-6'>
            <div className='px-6'>
              <h3 className='text-sm font-bold uppercase tracking-widest text-gray-900'>
                {isHashtagSearch
                  ? `#${cleanQuery}`
                  : `Results for "${searchQuery}"`}
                <span className='text-gray-300 ml-2'>
                  ({filteredBooks.length})
                </span>
              </h3>
            </div>
            {filteredBooks.length > 0 ? (
              <div className='flex overflow-x-auto no-scrollbar gap-6 px-6 pb-4 flex-wrap'>
                {filteredBooks.map((b: any) => (
                  <div
                    key={b.id}
                    onClick={() => onSelect(b)}
                    className='flex-shrink-0 w-44 space-y-4 group cursor-pointer transition-all active:scale-95'
                  >
                    <div
                      className='aspect-[2/3] rounded-lg shadow-xl border-4 border-white overflow-hidden relative transition-transform group-hover:-translate-y-2'
                      style={{ backgroundColor: b.coverColor }}
                    >
                      <CoverImg book={b} />
                    </div>
                    <div className='px-2 space-y-1'>
                      <p className='text-sm font-bold line-clamp-1'>
                        {b.title}
                      </p>
                      <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider'>
                        {b.author.displayName}
                      </p>
                      {b.hashtags?.length > 0 && (
                        <div className='flex flex-wrap gap-1 mt-1'>
                          {b.hashtags.slice(0, 3).map((h: string) => (
                            <span
                              key={h}
                              className='text-[8px] font-bold text-accent/70 bg-accent/5 px-2 py-0.5 rounded-full'
                            >
                              #{h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='flex flex-col items-center justify-center py-20 text-gray-300'>
                <span className='material-icons-round text-4xl mb-4'>
                  search_off
                </span>
                <p className='text-[10px] font-bold uppercase tracking-widest'>
                  No books found
                </p>
              </div>
            )}
          </section>
        )}

        {/* Star of the week Section — only when not searching */}
        {!query && spotlightBook && (
          <section className='px-6'>
            <div
              className='relative group cursor-pointer overflow-hidden rounded-2x1 bg-[#090b12] shadow-2xl shadow-black/10 border border-white/10 transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]'
              onClick={() => onSelect(spotlightBook)}
            >
              <div
                className='absolute inset-0 opacity-70'
                style={{
                  background: `radial-gradient(circle at 30% 90%, ${spotlightBook.coverColor}66 0%, transparent 72%), linear-gradient(140deg, #0c1324 0%, #101115 45%, #23181d 100%)`
                }}
              />
              <div
                className='absolute -left-20 top-6 h-40 w-40 rounded-full blur-3xl opacity-35'
                style={{ backgroundColor: spotlightBook.coverColor }}
              />
              <div className='absolute right-0 bottom-0 w-full h-1/2 bg-gradient-to-t from-black/25 to-transparent' />

              <div className='relative p-6 sm:p-8'>
                <div className='flex items-start justify-between gap-4 mb-5'>
                  <div className='inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-white'>
                    <span className='material-icons-round text-[15px]'>
                      auto_awesome
                    </span>
                    <span className='text-[9px] font-black uppercase tracking-[0.25em]'>
                      Star of the Week
                    </span>
                  </div>
                </div>

                <div className='flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-7'>
                  <div
                    className='w-28 h-40 sm:w-32 sm:h-48 flex-shrink-0 shadow-2xl border border-white/25 transform -rotate-3 group-hover:rotate-0 transition-transform duration-300 overflow-hidden relative'
                    style={{ backgroundColor: spotlightBook.coverColor }}
                  >
                    <CoverImg book={spotlightBook} />
                  </div>

                  <div className='space-y-3 flex-1 min-w-0'>
                    <h2 className='text-2xl sm:text-3xl font-display text-white line-clamp-2 leading-tight drop-shadow-sm'>
                      {spotlightBook.title}
                    </h2>
                    <p className='text-[11px] text-white/80 font-semibold uppercase tracking-[0.16em]'>
                      By {spotlightBook.author.displayName}
                    </p>
                    <p className='text-sm text-white/65 line-clamp-2 italic'>
                      "{spotlightBook.tagline}"
                    </p>

                    <span className='inline-flex px-3 py-1.5 rounded-full bg-white/10 border border-white/20 textgit-white/90 text-[10px] font-bold uppercase tracking-wider mt-1'>
                      {spotlightBook.genres?.[0] || 'Featured'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Top Authors Section */}
        <section className='space-y-6'>
          <div className='px-6 flex justify-between items-center'>
            <h3 className='text-sm font-bold uppercase tracking-widest text-gray-900'>
              Top Authors
            </h3>
          </div>
          <div className='flex overflow-x-auto no-scrollbar gap-6 px-6 pb-2'>
            {topAuthors.map((author, i) => {
              let handleClick
              if (author.user.username === currentUsername) {
                handleClick = () => onOwnSelect(author.user)
              } else {
                handleClick = () => onAuthorSelect(author.user)
              }

              return (
                <div
                  key={author.user.username}
                  onClick={handleClick}
                  className='flex-shrink-0 flex flex-col items-center gap-3 group cursor-pointer transition-all active:scale-95 w-24'
                >
                  <div className='relative'>
                    <div className='w-20 h-20 rounded-full bg-gradient-to-tr from-accent/20 to-accent/5 p-1 ring-2 ring-transparent group-hover:ring-accent transition-all'>
                      <div className='w-full h-full rounded-full bg-white flex items-center justify-center text-accent text-xl font-black border-2 border-white shadow-sm overflow-hidden'>
                        {avatarConfigs[author.user.username] ? (
                          <div className='relative w-full h-full'>
                            <AvatarLayers
                              avatarConfig={avatarConfigs[author.user.username]}
                              containerClassName='absolute left-1/2'
                              containerStyle={{
                                width: '90px',
                                height: '125px',
                                transform: 'translateX(-50%) scale(1.42)',
                                transformOrigin: 'top center',
                                top: '6.5%'
                              }}
                            />
                          </div>
                        ) : (
                          author.user.displayName[0]
                        )}
                      </div>
                    </div>
                    <div className='absolute -bottom-1 -right-1 w-7 h-7 bg-black rounded-full flex items-center justify-center border-2 border-white shadow-md'>
                      <span className='text-[10px] font-black text-white'>
                        {i + 1}
                      </span>
                    </div>
                  </div>
                  <div className='text-center space-y-0.5'>
                    <p className='text-[11px] font-bold text-gray-900 leading-tight truncate w-20'>
                      {author.user.displayName}
                    </p>
                    <p className='text-[8px] font-bold text-accent uppercase tracking-widest'>
                      {author.totalLikes >= 1000
                        ? (author.totalLikes / 1000).toFixed(1) + 'k'
                        : author.totalLikes}{' '}
                      Likes
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Section Loops — only when not searching */}
        {!query &&
          [
            { title: 'Trending Books', data: trendingBooks },
            { title: 'Recently Read', data: recentlyRead },
            { title: 'Recommended', data: recommendedBooks }
          ].map(section => {
            // Apply genre filter to section data if genres are selected
            let sectionData =
              selectedGenres.length > 0
                ? section.data.filter((b: any) =>
                    selectedGenres.some(g => (b.genres || []).includes(g))
                  )
                : section.data
            // Apply sort order
            sectionData = [...sectionData].sort((a: any, b: any) => {
              const dateA = new Date(a.publishedDate).getTime()
              const dateB = new Date(b.publishedDate).getTime()
              return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
            })
            const isExpanded = expandedSections.has(section.title)
            const displayData = isExpanded
              ? sectionData.slice(0, 20)
              : sectionData.slice(0, 6)
            return (
              <section key={section.title} className='space-y-6'>
                <div className='px-6 flex justify-between items-center'>
                  <h3 className='text-sm font-bold uppercase tracking-widest text-gray-900'>
                    {section.title}
                  </h3>
                  {sectionData.length > 6 && (
                    <button
                      onClick={() =>
                        setExpandedSections(prev => {
                          const next = new Set(prev)
                          if (next.has(section.title)) {
                            next.delete(section.title)
                          } else {
                            next.add(section.title)
                          }
                          return next
                        })
                      }
                      className='text-[10px] font-bold text-accent uppercase tracking-widest hover:opacity-70 transition-opacity'
                    >
                      {isExpanded ? 'Show Less' : 'See All'}
                    </button>
                  )}
                </div>
                <div
                  className={
                    isExpanded
                      ? 'grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-3 px-6 pb-4'
                      : 'flex overflow-x-auto no-scrollbar gap-6 px-6 pb-4'
                  }
                >
                  {displayData.length > 0 ? (
                    displayData.map((b: any) => (
                      <div
                        key={b.id}
                        onClick={() => onSelect(b)}
                        className={`${
                          isExpanded ? 'w-full' : 'flex-shrink-0 w-44'
                        } space-y-2 group cursor-pointer transition-all active:scale-95`}
                      >
                        <div
                          className={`aspect-[2/3] ${
                            isExpanded ? 'border-1' : 'border-2'
                          } shadow-xl border-white overflow-hidden relative transition-transform group-hover:-translate-y-2`}
                          style={{ backgroundColor: b.coverColor }}
                        >
                          <CoverImg book={b} />
                          <div className='absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10' />
                          {b.isExplicit && (
                            <div className='absolute top-4 right-4 bg-red-500/90 backdrop-blur-md px-2 py-0.5 rounded-lg text-[7px] font-bold text-white uppercase tracking-wider'>
                              Explicit
                            </div>
                          )}
                          <div className='absolute bottom-4 left-4 right-4 flex justify-between opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 z-20'>
                            <div className='flex items-center gap-1'>
                              <span className='material-icons-round text-[10px] text-white'>
                                favorite
                              </span>
                              <span className='text-[9px] font-bold text-white'>
                                {Array.isArray(b.likes)
                                  ? b.likes.reduce(
                                      (a: number, c: number) => a + c,
                                      0
                                    )
                                  : b.likes || 0}
                              </span>
                            </div>
                            <div className='flex items-center gap-1'>
                              <span className='material-icons-round text-[10px] text-white'>
                                chat_bubble
                              </span>
                              <span className='text-[9px] font-bold text-white'>
                                {b.commentsCount}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className='px-1 space-y-1'>
                          <p className='text-[13px] font-bold text-gray-900 leading-tight line-clamp-1'>
                            {b.title}
                          </p>
                          <p className='text-[9px] font-bold text-gray-400 uppercase tracking-[0.15em]'>
                            {b.author.displayName}
                          </p>
                          <div className='flex gap-1.5 pt-1'>
                            {b.genres.slice(0, 2).map((g: string) => (
                              <span
                                key={g}
                                className='text-[8px] font-bold text-accent bg-accent/5 px-2 py-0.5 rounded-md uppercase tracking-wider'
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='px-6 py-12 text-center w-full bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100'>
                      <span className='material-icons-round text-3xl text-gray-200 mb-3'>
                        {section.title === 'Recently Read'
                          ? 'history'
                          : 'auto_stories'}
                      </span>
                      <p className='text-xs text-gray-400 uppercase font-bold tracking-widest'>
                        {section.title === 'Recently Read'
                          ? 'Start reading to see history'
                          : 'No stories found yet'}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
      </main>
    </div>
  )
}
