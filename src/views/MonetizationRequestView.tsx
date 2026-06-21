import React, { useState, useMemo, useEffect } from 'react'
import { Button, CoverImg } from '@/components/sharedComponents'
import type { Book } from '@/types'
import { useApp } from '@/state/AppContext'
import {
  PRICE_TIERS,
  allowedPriceTiers,
  canMonetize,
  minLikesPerPublishedChapter,
} from '@/config/constants'
import * as stripeConnect from '@/services/stripeConnect'

export const MonetizationRequestView = () => {
  const {
    books,
    user,
    isAdmin,
    handleRequestMonetization,
    setView,
    showToast,
    showConfirm,
  } = useApp()
  const works = books.filter(
    b => b.author.username?.toLowerCase() === user.username?.toLowerCase()
  )
  const onBack = () => setView('write')
  const [selectedBook, setSelectedBook] = useState<Book | null>(works[0] || null)
  const [price, setPrice] = useState<number>(9.99)
  const [submitting, setSubmitting] = useState(false)

  // `books` load asynchronously, so on first render `works` can still be empty
  // and the useState initializer leaves `selectedBook` null forever. Re-sync
  // the selection once works arrive (and clear it if the selected book is gone).
  useEffect(() => {
    if (!selectedBook && works.length > 0) {
      setSelectedBook(works[0])
    } else if (selectedBook && !works.some(w => w.id === selectedBook.id)) {
      setSelectedBook(works[0] || null)
    }
  }, [works, selectedBook])

  // Admins may price any book at any tier (eligibility is bypassed for them).
  const allowedTiers = useMemo(
    () =>
      !selectedBook
        ? []
        : isAdmin
        ? [...PRICE_TIERS]
        : allowedPriceTiers(selectedBook.chaptersCount),
    [selectedBook, isAdmin]
  )

  // Clamp the chosen price into the tiers the selected book unlocks so an
  // out-of-tier price can never be submitted (server re-validates regardless).
  useEffect(() => {
    if (allowedTiers.length === 0) return
    if (!allowedTiers.includes(price)) setPrice(allowedTiers[0])
  }, [allowedTiers]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = selectedBook?.monetizationStatus
  const isPending = status === 'pending'
  const isDenied = status === 'denied'

  const eligibility = useMemo(() => {
    if (!selectedBook) return { met: false, reasons: ['No works selected'] }
    const r: string[] = []
    if (!selectedBook.isCompleted) r.push('Mark as complete')
    if (selectedBook.chaptersCount < 5) r.push('At least 5 published chapters')
    // Derived from the real per-chapter `likes` array (not the never-set
    // minLikesPerChapter mock field) — see minLikesPerPublishedChapter.
    if (minLikesPerPublishedChapter(selectedBook) < 100)
      r.push('100+ likes per published chapter')

    const publishedDate = new Date(selectedBook.publishedDate)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - publishedDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays < 21)
      r.push(`Published for at least 21 days (Current: ${diffDays} days)`)

    if (!canMonetize(selectedBook))
      r.push(
        'Already successfully monetized before unpublishing (Cannot re-monetize)'
      )
    if ((selectedBook.monetizationAttempts || 0) >= 2)
      r.push('Maximum 2 attempts reached')

    // Admins bypass all prerequisites (mirrors the server bypass).
    return { met: isAdmin || r.length === 0, reasons: r }
  }, [selectedBook, isAdmin])

  const submitRequest = async () => {
    if (!selectedBook) return
    const ok = await handleRequestMonetization(selectedBook.id, price)
    if (ok) onBack()
  }

  const handleSend = async () => {
    if (!selectedBook || submitting) return
    setSubmitting(true)
    try {
      // "One more step" payout gate: a creator must have a connected,
      // payout-enabled Stripe account before a request can be submitted.
      const account = await stripeConnect.getAccountStatus()
      if (!account.payoutsEnabled) {
        showConfirm({
          title: 'One more step',
          message:
            'Set up your payout account to start selling. Stripe securely collects your bank details and tax form — MainWRLD never sees them.',
          confirmLabel: 'Set up payouts',
          cancelLabel: 'Not now',
          icon: 'account_balance',
          onConfirm: async () => {
            try {
              const { url } = await stripeConnect.createOnboardingLink()
              await stripeConnect.openStripeUrl(url)
            } catch (err: any) {
              showToast(
                err?.message || 'Could not start payout setup.',
                'error'
              )
            }
          },
        })
        return
      }
      await submitRequest()
    } catch (err: any) {
      showToast(err?.message || 'Could not submit request.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto p-6 animate-in slide-in-from-bottom duration-500 z-[300]'>
      <header className='flex justify-between items-center mb-8'>
        <h1 className='text-2xl font-bold'>Monetize</h1>
        <button onClick={onBack} className='w-10 h-10 text-gray-300'>
          <span className='material-icons-round'>close</span>
        </button>
      </header>
      <div className='space-y-8 pb-32'>
        <div className='p-5 bg-gray-50 rounded-3xl border border-gray-100'>
          <p className='text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed'>
            Note: You have a maximum of 2 monetization attempts per book. If a
            book was successfully monetized and subsequently unpublished, it
            cannot be monetized a second time. Bank details &amp; tax forms are
            collected securely by Stripe — MainWRLD never sees them.
          </p>
        </div>

        <section className='space-y-4'>
          <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
            Select Work
          </label>
          {works.length === 0 && (
            <div className='p-6 bg-gray-50 rounded-3xl border border-gray-100 text-center'>
              <p className='text-[11px] font-bold text-gray-400'>
                No works to monetize yet.
              </p>
              <p className='text-[10px] text-gray-300 mt-1'>
                Publish a book to request monetization.
              </p>
            </div>
          )}
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

        {/* Pending review — request already submitted, awaiting admin. */}
        {selectedBook && isPending && (
          <div className='p-6 bg-amber-50 rounded-3xl border border-amber-100'>
            <h3 className='text-xs font-bold text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-2'>
              <span className='material-icons-round text-sm'>hourglass_top</span>
              Pending Review
            </h3>
            <p className='text-[11px] text-amber-700 font-bold'>
              Your request to monetize "{selectedBook.title}" at $
              {(selectedBook.requestedPrice ?? price).toFixed(2)} is being
              reviewed. You'll be notified once it's accepted or denied.
            </p>
          </div>
        )}

        {/* Denied — show reason; author may re-request within the attempt cap. */}
        {selectedBook && isDenied && (
          <div className='p-6 bg-red-50 rounded-3xl border border-red-100'>
            <h3 className='text-xs font-bold text-red-500 uppercase tracking-widest mb-2'>
              Request Denied
            </h3>
            {selectedBook.monetizationDenialReason && (
              <p className='text-[11px] text-red-400 font-bold'>
                Reason: {selectedBook.monetizationDenialReason}
              </p>
            )}
          </div>
        )}

        {selectedBook && !isPending && isAdmin && eligibility.reasons.length > 0 && (
          <div className='p-6 bg-indigo-50 rounded-3xl border border-indigo-100'>
            <h3 className='text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-2'>
              <span className='material-icons-round text-sm'>shield</span>
              Admin override
            </h3>
            <p className='text-[10px] text-indigo-400 font-bold'>
              Eligibility prerequisites are bypassed for admins. Payout setup is
              still required.
            </p>
          </div>
        )}

        {selectedBook && !isPending && !eligibility.met && (
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

        {!isPending && (
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
                {PRICE_TIERS.map(p => {
                  const unlocked = allowedTiers.includes(p)
                  return (
                    <button
                      key={p}
                      disabled={!unlocked}
                      onClick={() => unlocked && setPrice(p)}
                      className={`py-3 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1 ${
                        !unlocked
                          ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                          : price === p
                          ? 'bg-accent text-white border-accent shadow-lg'
                          : 'bg-white border-gray-100 text-gray-400'
                      }`}
                    >
                      {!unlocked && (
                        <span className='material-icons-round text-[11px]'>
                          lock
                        </span>
                      )}
                      ${p.toFixed(2)}
                    </button>
                  )
                })}
              </div>
              <p className='text-[9px] text-gray-400 ml-2'>
                More published chapters unlock higher price tiers.
              </p>
            </div>
            <div className='p-6 bg-gray-50 rounded-3xl space-y-4 border border-gray-100'>
              <h4 className='text-[9px] font-bold text-gray-400 uppercase tracking-widest'>
                Revenue Split
              </h4>
              <div className='flex justify-between text-xs font-bold'>
                <span>You keep</span>
                <span className='text-accent'>80%</span>
              </div>
              <div className='flex justify-between text-xs font-bold text-gray-400'>
                <span>MainWRLD</span>
                <span>20%</span>
              </div>
            </div>
            <Button
              className='w-full h-16'
              disabled={submitting}
              onClick={handleSend}
            >
              {submitting ? 'Checking…' : 'Send Request'}
            </Button>
          </section>
        )}
      </div>
    </div>
  )
}
