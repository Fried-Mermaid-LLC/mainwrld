import React, { useState, useMemo } from 'react'
import { CoverImg } from '@/components/sharedComponents'
import { MatureCover } from '@/components/MatureCover'
import { AvatarLayers } from '@/components/avatar'
import { GENRE_LIST } from '@/config/constants'
import type { Book, User } from '@/types'
import { useApp } from '@/state/AppContext'

// Section heading — Label/L from the design: 14px, 600, uppercase,
// letterSpacing 0.14px, text/primary #1a1a1a.
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className='text-[14px] font-semibold uppercase tracking-[0.14px] text-[#1a1a1a] leading-[1.2]'>
    {children}
  </p>
)

// BookCoverCard from the design: 150px column, 196px tinted cover (rounded 14),
// 10px gap to the meta block. Title is Title/S 15px bold, author Label/S 11px
// 600 uppercase letterSpacing 0.66px in text/secondary #9aa1a9.
const BookCard = ({
  book,
  onSelect,
  cover,
  fullWidth = false,
  large = false
}: {
  book: Book
  onSelect: (b: Book) => void
  cover: React.ReactNode
  fullWidth?: boolean
  large?: boolean
}) => (
  <button
    type='button'
    onClick={() => onSelect(book)}
    className={`${
      fullWidth ? 'w-full' : large ? 'flex-shrink-0 w-[300px]' : 'flex-shrink-0 w-[150px]'
    } flex flex-col gap-[10px] text-left cursor-pointer transition-transform active:scale-95`}
  >
    <div
      className='relative aspect-[2/3] w-full rounded-[14px] overflow-hidden bg-[#fbdddd] border border-[#eaeaea] shadow-[0px_6px_18px_0px_rgba(0,0,0,0.08)]'
      style={{ backgroundColor: book.coverColor || '#fbdddd' }}
    >
      {cover}
    </div>
    <div className='flex flex-col gap-[4px] w-full overflow-hidden'>
      <p className='text-[15px] font-bold leading-[1.15] text-[#1a1a1a] line-clamp-2'>
        {book.title}
      </p>
      <p className='text-[11px] font-semibold uppercase tracking-[0.66px] text-[#9aa1a9] truncate'>
        {book.author.displayName}
      </p>
    </div>
  </button>
)

export const ExploreView = () => {
  const {
    books: rawBooks,
    globalSpotlightBookId,
    setSelectedBook,
    setView,
    setSelectedProfileUser,
    registeredUsers,
    user,
    MUTUALS,
    allAvatarConfigs,
    blockedUsers,
    readingActivity,
    canSeeMature,
    isBookFavorited
  } = useApp()
  // Feed base: drop blocked authors, drafts, and — for viewers who can't see
  // mature content — mature books entirely (the Explore feed stays clean).
  // Mature books remain findable via search (see `searchBooks`).
  const books = rawBooks.filter(
    (b: Book) =>
      !blockedUsers.has(b.author.username) &&
      !b.isDraft &&
      !(!canSeeMature && b.isMature)
  )
  // Search base: keep mature books (drafts are dropped inside `filteredBooks`).
  // Mature covers are blurred via <MatureCover> until tapped/opted in.
  const searchBooks = rawBooks.filter(
    (b: Book) => !blockedUsers.has(b.author.username)
  )
  const spotlightBookId = globalSpotlightBookId
  const onSelect = (b: Book) => {
    setSelectedBook(b)
    setView('book-detail')
  }
  const users = [
    ...registeredUsers.filter((u: any) => u.username !== user.username),
    ...MUTUALS.filter(
      m =>
        !registeredUsers.some((u: any) => u.username === m.username) &&
        m.username !== user.username
    )
  ]
  const onUserSelect = (u: User) => {
    setSelectedProfileUser(u)
    setView('profile')
  }
  const avatarConfigs = allAvatarConfigs
  const currentUsername = user.username
  const onAuthorSelect = (u: User) => {
    setSelectedProfileUser(u)
    setView('profile')
  }
  const onOwnSelect = (u: User) => {
    setSelectedProfileUser(u)
    setView('self-profile')
  }
  const userFavoriteGenres = (() => {
    const genreCounts: Record<string, number> = {}
    rawBooks
      .filter(b => isBookFavorited(b.id) || b.isOwned)
      .forEach(b => {
        ;(b.genres || []).forEach((g: string) => {
          genreCounts[g] = (genreCounts[g] || 0) + 1
        })
      })
    return Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(e => e[0])
  })()
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
    let result = searchBooks.filter((b: Book) => {
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
  }, [searchBooks, cleanQuery, isHashtagSearch, selectedGenres, sortOrder])

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

  // Star of the Week is selected SERVER-SIDE (X04). The client is a pure reader:
  // look the server's chosen id up in the visible (non-draft, age-gated,
  // unblocked) books list. If it is unset or not visible (taken down / draft /
  // blocked author / explicit-for-minor), render nothing — never invent a pick.
  const spotlightBook = useMemo(() => {
    if (!spotlightBookId) return null
    return books.find((b: Book) => b.id === spotlightBookId) || null
  }, [books, spotlightBookId])

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
    // Copy before sorting — sorting in place mutates shared state. Keep up to
    // 10 (the stored array's own cap) so the rail can fill the 6/20 the section
    // loop shows; the loop no longer re-sorts Recently Read by publishedDate.
    return [...activities]
      .sort(
        (a, b) =>
          new Date(b.lastRead).getTime() - new Date(a.lastRead).getTime()
      )
      .slice(0, 10)
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
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
      {/* Header — 64px row, 24px side padding, holds the 48px search bar */}
      <header className='px-6 sticky top-0 bg-white/90 backdrop-blur-2xl z-50'>
        <div className='flex gap-3 h-12 items-center'>
          <div className='flex-1 h-12 bg-[#f4f5f7] rounded-[16px] flex items-center px-4 gap-2'>
            <span className='material-icons-round text-[20px] text-[#c2c8cf]'>
              search
            </span>
            <input
              placeholder='Search books or users...'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='bg-transparent outline-none text-[15px] w-full text-[#1a1a1a] placeholder:text-[#c2c8cf]'
            />
          </div>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`size-12 rounded-[16px] flex items-center justify-center transition-all ${
              showFilter
                ? 'bg-accent text-white'
                : 'bg-[#f4f5f7] text-[#9aa1a9]'
            }`}
          >
            <span className='material-icons-round text-[22px]'>tune</span>
          </button>
        </div>
        {showFilter && (
          <div className='mt-3 p-5 bg-white rounded-[20px] space-y-5 animate-in slide-in-from-top border border-[#eaeaea] shadow-[0px_14px_34px_0px_rgba(0,0,0,0.12)]'>
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
                  className={`px-4 py-2 rounded-[12px] text-[11px] font-semibold uppercase transition-all tracking-[0.66px] ${
                    selectedGenres.includes(g)
                      ? 'bg-accent text-white'
                      : 'bg-[#eceef1] text-[#9aa1a9]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className='flex justify-between items-center border-t border-[#eaeaea] pt-4'>
              <p className='text-[11px] font-semibold text-[#9aa1a9] uppercase tracking-[0.66px]'>
                Sort order
              </p>
              <select
                className='text-[11px] font-semibold bg-[#eceef1] px-3 py-2 rounded-[10px] outline-none cursor-pointer text-[#1a1a1a]'
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

      {/* Content — 32px between sections, 24px side padding */}
      <div className='flex flex-col gap-8 px-6 pt-3'>
        {/* User Search Results */}
        {filteredUsers.length > 0 && (
          <section className='flex flex-col gap-4'>
            <SectionTitle>People</SectionTitle>
            <div className='bg-white rounded-[20px] border border-[#eaeaea] overflow-hidden'>
              {filteredUsers.map((u: User) => (
                <button
                  key={u.username}
                  onClick={() => onUserSelect(u)}
                  className='w-full p-4 flex items-center gap-3 border-b border-[#eaeaea] last:border-none transition-colors active:scale-[0.98]'
                >
                  <div className='size-11 rounded-full bg-[#fbdddd] flex items-center justify-center text-accent text-lg font-bold flex-shrink-0'>
                    {u.displayName[0]}
                  </div>
                  <div className='text-left flex-1 min-w-0'>
                    <p className='text-[13px] font-semibold text-[#1a1a1a] tracking-[0.13px] truncate'>
                      {u.displayName}
                    </p>
                    <p className='text-[11px] text-[#9aa1a9] font-semibold'>
                      @{u.username}
                    </p>
                  </div>
                  <span className='material-icons-round text-[20px] text-[#c2c8cf]'>
                    chevron_right
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* When searching — show flat results list */}
        {query && (
          <section className='flex flex-col gap-4'>
            <SectionTitle>
              {isHashtagSearch ? `#${cleanQuery}` : `Results for "${searchQuery}"`}
              <span className='text-[#c2c8cf] ml-2'>({filteredBooks.length})</span>
            </SectionTitle>
            {filteredBooks.length > 0 ? (
              <div className='flex flex-wrap gap-[14px]'>
                {filteredBooks.map((b: Book) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    onSelect={onSelect}
                    cover={<MatureCover book={b} />}
                  />
                ))}
              </div>
            ) : (
              <div className='flex flex-col items-center justify-center py-20 text-[#c2c8cf]'>
                <span className='material-icons-round text-4xl mb-4'>
                  search_off
                </span>
                <p className='text-[11px] font-semibold uppercase tracking-[0.66px]'>
                  No books found
                </p>
              </div>
            )}
          </section>
        )}

        {/* Star of the Week — only when not searching */}
        {!query && spotlightBook && (
          <button
            type='button'
            onClick={() => onSelect(spotlightBook)}
            className='w-full max-w-[1242px] text-left flex flex-col sm:flex-row gap-5 sm:gap-7 sm:items-stretch bg-white border border-[#eaeaea] rounded-[20px] p-4 sm:p-6 shadow-[0px_14px_34px_0px_rgba(0,0,0,0.12)] transition-transform active:scale-[0.98]'
          >
            {/* Cover — fixed 300px column on wide screens, mirrors the rail size */}
            <div
              className='relative aspect-[2/3] w-[196px] sm:w-[300px] flex-shrink-0 max-w-full rounded-[14px] overflow-hidden bg-[#fbdddd] border border-[#eaeaea] shadow-[0px_6px_18px_0px_rgba(0,0,0,0.08)]'
              style={{ backgroundColor: spotlightBook.coverColor || '#fbdddd' }}
            >
              <CoverImg book={spotlightBook} />
            </div>
            {/* Meta column — fills the space to the right of the cover */}
            <div className='flex flex-col gap-4 flex-1 min-w-0 sm:py-1'>
              <div className='self-start inline-flex items-center gap-[7px] bg-[#ef4f49] rounded-full pl-3 pr-3.5 py-[7px]'>
                <span className='material-icons-round text-[14px] text-white'>
                  auto_awesome
                </span>
                <span className='text-[13px] font-semibold uppercase tracking-[0.13px] text-white leading-[1.2]'>
                  Star of the Week
                </span>
              </div>
              <div className='flex flex-col gap-2 w-full'>
                <h2 className='text-[26px] sm:text-[32px] font-bold leading-[1.15] text-[#1a1a1a]'>
                  {spotlightBook.title}
                </h2>
                <p className='text-[11px] font-semibold uppercase tracking-[0.66px] text-[#9aa1a9] leading-[1.2]'>
                  By {spotlightBook.author.displayName}
                </p>
              </div>
              {spotlightBook.tagline && (
                <p className='text-[14px] sm:text-[15px] italic text-[#9aa1a9] leading-[1.5]'>
                  "{spotlightBook.tagline}"
                </p>
              )}
              <div className='self-start inline-flex items-center bg-[#eceef1] rounded-full px-3.5 py-[7px] mt-auto'>
                <span className='text-[11px] font-semibold uppercase tracking-[0.66px] text-[#1a1a1a] leading-[1.2]'>
                  {spotlightBook.genres?.[0] || 'Featured'}
                </span>
              </div>
            </div>
          </button>
        )}

        {/* Top Authors */}
        <section className='flex flex-col gap-4'>
          <SectionTitle>Top Authors</SectionTitle>
          <div className='flex gap-4 overflow-x-auto no-scrollbar -mx-6 px-6'>
            {topAuthors.map((author, i) => {
              const handleClick =
                author.user.username === currentUsername
                  ? () => onOwnSelect(author.user)
                  : () => onAuthorSelect(author.user)
              return (
                <button
                  key={author.user.username}
                  onClick={handleClick}
                  className='flex-shrink-0 flex flex-col items-center gap-[6px] cursor-pointer transition-transform active:scale-95'
                >
                  <div className='relative size-32 drop-shadow-[0px_6px_9px_rgba(0,0,0,0.08)]'>
                    <div className='size-32 rounded-full p-[4px] bg-[#eaeaea]'>
                      <div className='size-full rounded-full bg-white overflow-hidden relative flex items-center justify-center text-accent text-4xl font-black'>
                        {avatarConfigs[author.user.username] ? (
                          <AvatarLayers
                            avatarConfig={avatarConfigs[author.user.username]}
                            containerClassName='absolute left-1/2'
                            containerStyle={{
                              width: '180px',
                              height: '250px',
                              transform: 'translateX(-50%) scale(1.42)',
                              transformOrigin: 'top center',
                              top: '6.5%'
                            }}
                          />
                        ) : (
                          author.user.displayName[0]
                        )}
                      </div>
                    </div>
                    <div className='absolute bottom-0 right-0 size-12 rounded-full bg-[#eaeaea] border-4 border-white flex items-center justify-center'>
                      <span className='text-[20px] font-bold text-[#1a1a1a]'>
                        {i + 1}
                      </span>
                    </div>
                  </div>
                  <div className='flex flex-col items-center gap-[2px]'>
                    <p className='text-[13px] font-semibold text-[#1a1a1a] tracking-[0.13px] truncate max-w-[72px]'>
                      {author.user.displayName}
                    </p>
                    <p className='text-[11px] font-semibold text-[#9aa1a9] uppercase tracking-[0.66px]'>
                      {author.totalLikes >= 1000
                        ? (author.totalLikes / 1000).toFixed(0) + 'K'
                        : author.totalLikes}{' '}
                      Likes
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Trending / Recently Read / Recommended — only when not searching */}
        {!query &&
          [
            { title: 'Trending', data: trendingBooks },
            { title: 'Recently Read', data: recentlyRead },
            { title: 'Recommended', data: recommendedBooks }
          ].map(section => {
            let sectionData =
              selectedGenres.length > 0
                ? section.data.filter((b: any) =>
                    selectedGenres.some(g => (b.genres || []).includes(g))
                  )
                : section.data
            // Recently Read keeps its lastRead-descending memo order; the others
            // honour the newest/oldest filter toggle.
            if (section.title !== 'Recently Read') {
              sectionData = [...sectionData].sort((a: any, b: any) => {
                const dateA = new Date(a.publishedDate).getTime()
                const dateB = new Date(b.publishedDate).getTime()
                return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
              })
            }
            const isExpanded = expandedSections.has(section.title)
            const displayData = isExpanded
              ? sectionData.slice(0, 20)
              : sectionData.slice(0, 6)
            return (
              <section key={section.title} className='flex flex-col gap-4'>
                <div className='flex justify-between items-center'>
                  <SectionTitle>{section.title}</SectionTitle>
                  {section.title !== 'Trending' && sectionData.length > 6 && (
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
                      className='text-[11px] font-semibold text-accent uppercase tracking-[0.66px] transition-opacity active:opacity-60'
                    >
                      {isExpanded ? 'Show Less' : 'See All'}
                    </button>
                  )}
                </div>
                {displayData.length > 0 ? (
                  <div
                    className={
                      isExpanded
                        ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[14px]'
                        : 'flex gap-[14px] overflow-x-auto no-scrollbar -mx-6 px-6'
                    }
                  >
                    {displayData.map((b: any) => (
                      <BookCard
                        key={b.id}
                        book={b}
                        onSelect={onSelect}
                        cover={<CoverImg book={b} />}
                        fullWidth={isExpanded}
                        large={!isExpanded}
                      />
                    ))}
                  </div>
                ) : (
                  <div className='py-12 text-center w-full bg-[#f4f5f7] rounded-[20px] flex flex-col items-center gap-3'>
                    <span className='material-icons-round text-3xl text-[#c2c8cf]'>
                      {section.title === 'Recently Read'
                        ? 'history'
                        : 'auto_stories'}
                    </span>
                    <p className='text-[11px] text-[#9aa1a9] uppercase font-semibold tracking-[0.66px]'>
                      {section.title === 'Recently Read'
                        ? 'Start reading to see history'
                        : 'No stories found yet'}
                    </p>
                  </div>
                )}
              </section>
            )
          })}
      </div>
    </div>
  )
}
