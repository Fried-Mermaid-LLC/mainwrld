import React, { useState } from 'react'
import { CoverImg } from '@/components/sharedComponents'
import { AVATAR_ITEMS } from '@/components/avatar'
import { ADMIN_USERNAMES } from '@/config/constants'
import type { Report, Book, UserRecord, Comment, AvatarItem } from '@/types'
import { useApp } from '@/state/AppContext'

export const AdminDashboard = () => {
  const {
    reports,
    books: rawBooks,
    allComments,
    registeredUsers,
    handleRemoveBook,
    handleRemoveComment,
    handleAddStrike,
    handleRemoveStrike,
    handleBanUser,
    handleDismissReport,
    getItemCost,
    handleUpdateItemPrice,
    setView
  } = useApp()
  const books = rawBooks.filter((b: any) => !b.isDraft)
  const comments = allComments
  const onBack = () => setView('settings')
  const onRemoveBook = handleRemoveBook
  const onRemoveComment = handleRemoveComment
  const onAddStrike = handleAddStrike
  const onRemoveStrike = handleRemoveStrike
  const onBanUser = handleBanUser
  const onDismissReport = handleDismissReport
  const onUpdateItemPrice = handleUpdateItemPrice
  const [activeTab, setActiveTab] = useState<
    'reports' | 'users' | 'books' | 'monetized' | 'pricing'
  >('reports')
  const [pricingFilter, setPricingFilter] = useState<
    'all' | 'face' | 'hair' | 'outfit'
  >('all')

  const tabs = [
    { id: 'reports', label: 'Reports', icon: 'flag' },
    { id: 'users', label: 'Users', icon: 'people' },
    { id: 'books', label: 'Books', icon: 'menu_book' },
    { id: 'monetized', label: 'Monetized', icon: 'paid' },
    { id: 'pricing', label: 'Pricing', icon: 'sell' }
  ]

  const pendingReports = reports.filter((r: Report) => r.status === 'pending')
  const monetizedBooks = books.filter((b: Book) => b.isMonetized)
  const monetizedAuthors = new Set(
    monetizedBooks.map((b: Book) => b.author.username)
  ).size
  const monetizedRevenue = monetizedBooks.reduce(
    (sum: number, b: Book) => sum + (b.price || 0),
    0
  )

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
      <header className='p-6 flex items-center gap-4'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>Admin Dashboard</h1>
      </header>

      {/* Stats Overview */}
      <div className='px-6 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <div className='bg-gray-50 rounded-2xl p-4 text-center border border-gray-100'>
          <p className='text-lg font-bold'>{pendingReports.length}</p>
          <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
            Pending
          </p>
        </div>
        <div className='bg-gray-50 rounded-2xl p-4 text-center border border-gray-100'>
          <p className='text-lg font-bold'>{registeredUsers.length}</p>
          <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
            Users
          </p>
        </div>
        <div className='bg-gray-50 rounded-2xl p-4 text-center border border-gray-100'>
          <p className='text-lg font-bold'>{books.length}</p>
          <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
            Books
          </p>
        </div>
        <div className='bg-gray-50 rounded-2xl p-4 text-center border border-gray-100'>
          <p className='text-lg font-bold'>{monetizedBooks.length}</p>
          <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
            Monetized
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className='px-6 flex gap-2 mb-6'>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 h-12 rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
              activeTab === tab.id
                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                : 'bg-gray-50 text-gray-400'
            }`}
          >
            <span className='material-icons-round text-base'>{tab.icon}</span>
            {tab.label}
            {tab.id === 'reports' && pendingReports.length > 0 && (
              <span className='w-5 h-5 rounded-full bg-white/30 text-[9px] flex items-center justify-center'>
                {pendingReports.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className='px-6 pb-32 space-y-4'>
        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <>
            <h3 className='text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-4'>
              Pending Reports ({pendingReports.length})
            </h3>
            {pendingReports.length === 0 && (
              <div className='flex flex-col items-center justify-center h-40 text-gray-300'>
                <span className='material-icons-round text-4xl mb-4'>
                  check_circle
                </span>
                <p className='text-[10px] font-bold uppercase tracking-widest'>
                  No pending reports
                </p>
              </div>
            )}
            {pendingReports.length > 0 && (
              <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
                {pendingReports.map((report: Report) => {
                  let targetLabel = report.targetId
                  if (report.type === 'Book') {
                    const book = books.find(
                      (b: Book) => b.id === report.targetId
                    )
                    targetLabel = book ? book.title : report.targetId
                  } else if (report.type === 'Comment') {
                    const comment = comments.find(
                      (c: Comment) => c.id === report.targetId
                    )
                    targetLabel = comment
                      ? `"${comment.text.substring(0, 40)}..."`
                      : report.targetId
                  }
                  return (
                    <div
                      key={report.id}
                      className='p-6 border-b border-gray-100 last:border-none space-y-3'
                    >
                      <div>
                        <span className='text-[9px] font-bold uppercase tracking-widest text-accent'>
                          {report.type}
                        </span>
                        <p className='text-sm font-bold mt-1'>{targetLabel}</p>
                        <p className='text-[10px] text-gray-400 mt-1'>
                          Reported by @{report.reportedBy}
                        </p>
                      </div>
                      <div className='flex gap-2 flex-wrap'>
                        {report.type === 'Book' && (
                          <button
                            onClick={() => onRemoveBook(report.targetId)}
                            className='h-10 px-4 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest'
                          >
                            Remove Book
                          </button>
                        )}
                        {report.type === 'Comment' && (
                          <button
                            onClick={() => onRemoveComment(report.targetId)}
                            className='h-10 px-4 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest'
                          >
                            Remove Comment
                          </button>
                        )}
                        {report.type === 'User' && (
                          <>
                            <button
                              onClick={() => onAddStrike(report.targetId)}
                              className='h-10 px-4 rounded-xl bg-orange-500/10 text-orange-500 text-[10px] font-bold uppercase tracking-widest'
                            >
                              Strike
                            </button>
                            <button
                              onClick={() => onBanUser(report.targetId)}
                              className='h-10 px-4 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-widest'
                            >
                              Ban User
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onDismissReport(report.id)}
                          className='h-10 px-4 rounded-xl bg-gray-100 text-gray-400 text-[10px] font-bold uppercase tracking-widest'
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            <h3 className='text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-4'>
              Registered Users ({registeredUsers.length})
            </h3>
            <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
              {registeredUsers.map((u: UserRecord) => (
                <div
                  key={u.username}
                  className='p-6 border-b border-gray-100 last:border-none flex justify-between items-center'
                >
                  <div>
                    <p className='text-sm font-bold'>{u.displayName}</p>
                    <p className='text-[10px] text-gray-400'>@{u.username}</p>
                    {u.strikes > 0 && (
                      <div className='flex items-center gap-2 mt-1'>
                        <p className='text-[9px] font-bold text-orange-500 uppercase tracking-widest'>
                          {u.strikes} Strike{u.strikes > 1 ? 's' : ''}
                        </p>
                        <button
                          onClick={() => onRemoveStrike(u.username)}
                          className='text-[8px] font-bold text-gray-400 underline uppercase tracking-widest hover:text-accent'
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {!(u.isAdmin || ADMIN_USERNAMES.includes(u.username)) && (
                    <div className='flex gap-2'>
                      <button
                        onClick={() => onAddStrike(u.username)}
                        className='w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center'
                        title='Add Strike'
                      >
                        <span className='material-icons-round text-base'>
                          warning
                        </span>
                      </button>
                      <button
                        onClick={() => onBanUser(u.username)}
                        className='w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center'
                        title='Ban User'
                      >
                        <span className='material-icons-round text-base'>
                          block
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Books Tab */}
        {activeTab === 'books' && (
          <>
            <h3 className='text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-4'>
              All Books ({books.length})
            </h3>
            <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
              {books.map((b: Book) => (
                <div
                  key={b.id}
                  className='p-6 border-b border-gray-100 last:border-none flex justify-between items-center'
                >
                  <div className='flex items-center gap-4'>
                    <div
                      className='w-10 h-14 rounded-lg flex-shrink-0 overflow-hidden relative'
                      style={{ backgroundColor: b.coverColor }}
                    >
                      <CoverImg book={b} />
                    </div>
                    <div>
                      <p className='text-sm font-bold'>{b.title}</p>
                      <p className='text-[10px] text-gray-400'>
                        by {b.author.displayName}
                      </p>
                      {b.isDraft && (
                        <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-1'>
                          Draft
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveBook(b.id)}
                    className='w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center flex-shrink-0'
                    title='Remove Book'
                  >
                    <span className='material-icons-round text-base'>
                      delete
                    </span>
                  </button>
                </div>
              ))}
              {books.length === 0 && (
                <div className='flex flex-col items-center justify-center h-40 text-gray-300'>
                  <span className='material-icons-round text-4xl mb-4'>
                    menu_book
                  </span>
                  <p className='text-[10px] font-bold uppercase tracking-widest'>
                    No books
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Monetized Tab */}
        {activeTab === 'monetized' && (
          <>
            <h3 className='text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-4'>
              Monetized Content
            </h3>
            <div className='grid gap-3 sm:grid-cols-3'>
              <div className='bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center'>
                <p className='text-sm font-bold'>{monetizedBooks.length}</p>
                <p className='text-[9px] text-gray-400 uppercase tracking-widest mt-1'>
                  Monetized Works
                </p>
              </div>
              <div className='bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center'>
                <p className='text-sm font-bold'>{monetizedAuthors}</p>
                <p className='text-[9px] text-gray-400 uppercase tracking-widest mt-1'>
                  Authors
                </p>
              </div>
              <div className='bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center'>
                <p className='text-sm font-bold'>
                  ${monetizedRevenue.toFixed(2)}
                </p>
                <p className='text-[9px] text-gray-400 uppercase tracking-widest mt-1'>
                  Total Price Value
                </p>
              </div>
            </div>
            <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100 mt-4'>
              {monetizedBooks.length === 0 ? (
                <div className='flex flex-col items-center justify-center h-40 text-gray-300'>
                  <span className='material-icons-round text-4xl mb-4'>
                    paid
                  </span>
                  <p className='text-[10px] font-bold uppercase tracking-widest'>
                    No monetized books yet
                  </p>
                </div>
              ) : (
                monetizedBooks.map((book: Book) => (
                  <div
                    key={book.id}
                    className='p-6 border-b border-gray-100 last:border-none flex justify-between items-start gap-4'
                  >
                    <div className='min-w-0'>
                      <p className='text-sm font-bold truncate'>{book.title}</p>
                      <p className='text-[10px] text-gray-400 mt-1'>
                        by {book.author.displayName} (@{book.author.username})
                      </p>
                      <p className='text-[10px] text-gray-400 mt-2'>
                        {book.chaptersCount} chapters · {book.commentsCount}{' '}
                        comments
                      </p>
                    </div>
                    <div className='text-right'>
                      <p className='text-sm font-bold'>
                        ${(book.price || 0).toFixed(2)}
                      </p>
                      <p className='text-[9px] uppercase tracking-widest text-gray-400 mt-1'>
                        Monetized
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Pricing Tab */}
        {activeTab === 'pricing' && (
          <>
            <h3 className='text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-4'>
              Avatar Item Pricing
            </h3>
            <p className='text-[10px] text-gray-400 ml-4 mb-3'>
              Set point costs for each item. 0 = free.
            </p>
            {/* Filter buttons */}
            <div className='flex gap-2 mb-4'>
              {(['all', 'face', 'hair', 'outfit'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPricingFilter(f)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition ${
                    pricingFilter === f
                      ? 'bg-accent text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
              {AVATAR_ITEMS.filter(
                item =>
                  item.id !== 'none' &&
                  item.id !== 'no_face' &&
                  item.category !== 'body'
              )
                .filter(
                  item =>
                    pricingFilter === 'all' || item.category === pricingFilter
                )
                .map((item: AvatarItem) => {
                  const currentCost = getItemCost(item.id)
                  return (
                    <div
                      key={item.id}
                      className='p-4 px-6 border-b border-gray-100 last:border-none flex items-center justify-between gap-4'
                    >
                      <div className='flex items-center gap-3 flex-1 min-w-0'>
                        <div className='w-12 h-12 rounded-xl bg-white border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center'>
                          {item.path ? (
                            <img
                              src={item.path}
                              className='w-full h-full object-contain'
                            />
                          ) : (
                            <span className='material-icons-round text-gray-300 text-lg'>
                              block
                            </span>
                          )}
                        </div>
                        <div className='min-w-0'>
                          <p className='text-xs font-bold truncate'>
                            {item.label}
                          </p>
                          <p className='text-[9px] text-gray-400 uppercase tracking-widest'>
                            {item.category} · {item.gender} · {item.id}
                          </p>
                        </div>
                      </div>
                      <div className='flex items-center gap-2 flex-shrink-0'>
                        <span className='material-icons-round text-[14px] text-accent'>
                          stars
                        </span>
                        <input
                          type='number'
                          min='0'
                          step='25'
                          value={currentCost}
                          onChange={e =>
                            onUpdateItemPrice(
                              item.id,
                              Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className='w-20 h-10 rounded-xl border border-gray-200 text-center text-sm font-bold focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
