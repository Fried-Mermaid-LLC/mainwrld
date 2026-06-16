import React, { useState, useMemo } from 'react'
import { Button, CoverImg } from '@/components/sharedComponents'
import type { Book } from '@/types'
import { useApp } from '@/state/AppContext'

export const MonetizationRequestView = () => {
  const { books, user, handleRequestMonetization, setView, showToast } = useApp()
  const works = books.filter(b => b.author.username === user.username)
  const onRequest = handleRequestMonetization
  const onBack = () => setView('write')
  const [selectedBook, setSelectedBook] = useState(works[0] || null)
  const [price, setPrice] = useState('9.99')

  const eligibility = useMemo(() => {
    if (!selectedBook) return { met: false, reasons: ['No works selected'] }
    const r = []
    if (!selectedBook.isCompleted) r.push('Mark as complete')
    if (selectedBook.chaptersCount < 5) r.push('At least 5 published chapters')
    if ((selectedBook.minLikesPerChapter || 0) < 100)
      r.push('100+ likes per published chapter')

    // 21 days logic
    const publishedDate = new Date(selectedBook.publishedDate)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - publishedDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays < 21)
      r.push(`Published for at least 21 days (Current: ${diffDays} days)`)

    if (selectedBook.wasMonetizedBefore)
      r.push(
        'Already successfully monetized before unpublishing (Cannot re-monetize)'
      )
    if ((selectedBook.monetizationAttempts || 0) >= 2)
      r.push('Maximum 2 attempts reached')

    return { met: r.length === 0, reasons: r }
  }, [selectedBook])

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto p-6 animate-in slide-in-from-bottom duration-500 z-[300]'>
      <header className='flex justify-between items-center mb-8'>
        <h1 className='text-2xl font-bold'>Monetize (coming soon)</h1>
        <button onClick={onBack} className='w-10 h-10 text-gray-300'>
          <span className='material-icons-round'>close</span>
        </button>
      </header>
      <div className='space-y-8 pb-32'>
        <div className='p-5 bg-accent/5 rounded-3xl border border-accent/10'>
          <p className='text-[10px] font-bold text-accent uppercase tracking-widest leading-relaxed'>
            Note: You have a maximum of 2 monetization attempts per book. If a
            book was successfully monetized and subsequently unpublished, it
            cannot be monetized a second time.
          </p>
        </div>

        <section className='space-y-4'>
          <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
            Select Work
          </label>
          <div className='flex gap-4 overflow-x-auto no-scrollbar'>
            {works.map((b: Book) => (
              <button
                key={b.id}
                onClick={() => setSelectedBook(b)}
                className={`w-24 flex-shrink-0 transition-all ${
                  selectedBook?.id === b.id
                    ? 'scale-105 opacity-100'
                    : 'opacity-40'
                }`}
              >
                <div
                  className='aspect-[2/3] rounded-lg mb-2 overflow-hidden relative'
                  style={{ backgroundColor: b.coverColor }}
                >
                  <CoverImg book={b} />
                </div>
                <p className='text-[10px] font-bold truncate'>{b.title}</p>
              </button>
            ))}
          </div>
        </section>

        {selectedBook && !eligibility.met && (
          <div className='p-6 bg-red-50 rounded-3xl border border-red-100'>
            <h3 className='text-xs font-bold text-red-500 uppercase tracking-widest mb-3'>
              Ineligible
            </h3>
            <ul className='space-y-2'>
              {eligibility.reasons.map((r: string) => (
                <li
                  key={r}
                  className='text-[10px] text-red-400 font-bold flex items-center gap-2'
                >
                  <span className='material-icons-round text-xs'>close</span>{' '}
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section
          className={`space-y-6 ${
            !eligibility.met ? 'opacity-30 pointer-events-none' : ''
          }`}
        >
          <div className='space-y-2'>
            <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
              Pricing Option
            </label>
            <div className='grid grid-cols-3 gap-2'>
              {['9.99', '14.99', '19.99', '24.99', '29.99'].map(p => (
                <button
                  key={p}
                  onClick={() => setPrice(p)}
                  className={`py-3 rounded-xl border text-[10px] font-bold ${
                    price === p
                      ? 'bg-accent text-white border-accent shadow-lg'
                      : 'bg-white border-gray-100 text-gray-400'
                  }`}
                >
                  ${p}
                </button>
              ))}
            </div>
          </div>
          <div className='p-6 bg-gray-50 rounded-3xl space-y-4 border border-gray-100'>
            <h4 className='text-[9px] font-bold text-gray-400 uppercase tracking-widest'>
              Revenue Split
            </h4>
            <div className='flex justify-between text-xs font-bold'>
              <span>Cash Sales</span>
              <span className='text-accent'>80%</span>
            </div>
          </div>
          <Button
            className='w-full h-16'
            onClick={() => {
              onRequest(selectedBook.id)
              showToast('Feature coming soon!', 'send')
              onBack()
            }}
          >
            Send Request
          </Button>
        </section>
      </div>
    </div>
  )
}
