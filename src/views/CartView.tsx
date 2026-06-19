import React, { useState } from 'react'
import { Button } from '@/components/sharedComponents'
import type { Coupon } from '@/types'
import * as stripeConnect from '@/services/stripeConnect'
import { POINTS_PER_DOLLAR } from '@/config/constants'
import { useApp } from '@/state/AppContext'

// Book USD price is stored on the book record; we charge the same in
// in-app points at a fixed rate so the cost is identical on iOS and web.
// $9.99 → 999 pts. Keeping the conversion centralised lets us tune the
// rate later without touching every display site.
const bookCost = (book: any): number =>
  Math.round((book.price || 9.99) * POINTS_PER_DOLLAR)

export const CartView = () => {
  const {
    cart,
    setCart,
    coupons,
    setCoupons,
    showToast,
    showConfirm,
    setView,
    userBookDataRef,
    user,
    setUser,
    setUserBookData,
    setBooks,
    selectedBook,
    setSelectedBook,
    persistTimerRef
  } = useApp()
  const onBack = () => setView('self-profile')

  // Adopt the server-authoritative post-purchase state returned by the
  // purchaseBooksWithPoints callable. The callable already deducted the buyer's
  // points, credited each author 80% in points, consumed the coupon, granted
  // permanent ownership and recorded the sale — so we copy its truth into local
  // state instead of mutating it ourselves (which could double-spend or clobber).
  const adoptPurchaseResult = (res: {
    points: number
    ownedBookIds: string[]
    purchasedBookIds: string[]
    coupons: Coupon[]
  }) => {
    setUser(prev => ({ ...prev, points: res.points }))
    setCoupons(res.coupons)
    const currentUd = userBookDataRef.current[user.username] || {
      ownedBookIds: [],
      bookProgress: {},
      purchasedBookIds: []
    }
    const updatedUd = {
      ...currentUd,
      ownedBookIds: res.ownedBookIds,
      purchasedBookIds: res.purchasedBookIds
    }
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
    const ownedSet = new Set([...res.ownedBookIds, ...res.purchasedBookIds])
    setBooks(prev =>
      prev.map(b => (ownedSet.has(b.id) ? { ...b, isOwned: true } : b))
    )
    if (selectedBook && ownedSet.has(selectedBook.id)) {
      setSelectedBook({ ...selectedBook, isOwned: true })
    }
    // Cancel any pending debounced persist so it can't write a stale (pre-deduct)
    // points value over the server's. The fresh setUser above re-arms it with
    // the correct value.
    if (persistTimerRef?.current) clearTimeout(persistTimerRef.current)
  }

  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const subtotalPts = cart.reduce(
    (acc: number, item: any) => acc + bookCost(item),
    0
  )
  // Coupon.value is stored as a USD-equivalent number (1/3/5/10) so the
  // spin-wheel reward schema stays unchanged; convert at use-time.
  const discountPts = selectedCoupon
    ? selectedCoupon.value * POINTS_PER_DOLLAR
    : 0
  const totalPts = Math.max(0, subtotalPts - discountPts)

  const handleRemove = (bookId: string) => {
    setCart(cart.filter((b: any) => b.id !== bookId))
  }

  const runPurchase = async () => {
    setIsProcessing(true)
    try {
      const res = await stripeConnect.purchaseBooksWithPoints(
        cart.map((b: any) => b.id),
        selectedCoupon?.id
      )
      adoptPurchaseResult(res)
      setCart([])
      showToast('Books added to your library!', 'check_circle')
      onBack()
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (/points/i.test(msg)) {
        showConfirm({
          title: 'Not enough points',
          message:
            'You don’t have enough points for this purchase. Earn or buy more in Daily Rewards.',
          confirmLabel: 'Get Points',
          cancelLabel: 'Cancel',
          icon: 'auto_awesome',
          onConfirm: () => setView('daily-rewards')
        })
      } else {
        showToast(msg || 'Purchase failed. Please try again.', 'error')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCheckout = () => {
    if (cart.length === 0) return

    // Client-side pre-check for nicer UX; the server re-enforces the balance.
    if (totalPts > 0 && user.points < totalPts) {
      const shortage = totalPts - user.points
      showConfirm({
        title: 'Not enough points',
        message: `You need ${shortage} more point(s). Earn or buy more in Daily Rewards.`,
        confirmLabel: 'Get Points',
        cancelLabel: 'Cancel',
        icon: 'auto_awesome',
        onConfirm: () => setView('daily-rewards')
      })
      return
    }

    showConfirm({
      title: 'Complete Purchase',
      message:
        totalPts === 0
          ? `Get ${cart.length} book(s) free with your coupon?`
          : `Buy ${cart.length} book(s) for ${totalPts} pts? Authors earn 80% in points.`,
      confirmLabel: 'Purchase',
      icon: 'shopping_cart',
      onConfirm: runPurchase
    })
  }

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in slide-in-from-right duration-500 z-[400]'>
      <header className='p-6 flex items-center gap-4 sticky top-0 bg-white/80 backdrop-blur-xl z-50'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>Shopping Cart</h1>
      </header>

      <div className='p-6 space-y-8'>
        {cart.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-20 text-gray-300'>
            <span className='material-icons-round text-6xl mb-4'>
              shopping_cart
            </span>
            <p className='text-xs font-bold uppercase tracking-widest'>
              Cart is empty
            </p>
          </div>
        ) : (
          <>
            <div className='space-y-4'>
              {cart.map((book: any) => (
                <div
                  key={book.id}
                  className='p-4 bg-gray-50 rounded-2xl flex gap-4 border border-gray-100'
                >
                  <div
                    className='w-16 h-24 rounded-lg flex-shrink-0'
                    style={{ backgroundColor: book.coverColor }}
                  />
                  <div className='flex-1 flex flex-col justify-between py-1'>
                    <div>
                      <h3 className='text-sm font-bold truncate'>
                        {book.title}
                      </h3>
                      <p className='text-[10px] text-gray-400 font-bold uppercase tracking-widest'>
                        By {book.author.displayName}
                      </p>
                    </div>
                    <div className='flex justify-between items-end'>
                      <p className='text-sm font-black text-accent'>
                        {bookCost(book)} pts
                      </p>
                      <button
                        onClick={() => handleRemove(book.id)}
                        className='text-[9px] font-bold text-gray-400 uppercase'
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className='space-y-4'>
              <h3 className='text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
                Apply Coupon
              </h3>
              <div className='flex gap-3 overflow-x-auto no-scrollbar'>
                {coupons.filter((c: any) => !c.used).length === 0 ? (
                  <p className='text-[9px] italic text-gray-400 ml-2'>
                    No coupons available. Win them in Daily Rewards!
                  </p>
                ) : (
                  coupons
                    .filter((c: any) => !c.used)
                    .map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          setSelectedCoupon(
                            selectedCoupon?.id === c.id ? null : c
                          )
                        }
                        className={`flex-shrink-0 px-4 py-3 rounded-xl border-2 transition-all ${
                          selectedCoupon?.id === c.id
                            ? 'bg-accent border-accent text-white'
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}
                      >
                        <div className='flex flex-col items-center'>
                          <span className='text-xs font-black'>
                            ${c.value}
                          </span>
                          <span className='text-[7px] font-bold uppercase'>
                            Off
                          </span>
                        </div>
                      </button>
                    ))
                )}
              </div>
            </div>

            <div className='p-6 bg-gray-50 rounded-3xl space-y-3 border border-gray-100'>
              <div className='flex justify-between text-xs font-bold text-gray-400'>
                <span>Subtotal</span>
                <span>{subtotalPts} pts</span>
              </div>
              <div className='flex justify-between text-xs font-bold text-accent'>
                <span>Coupon Discount</span>
                <span>-{discountPts} pts</span>
              </div>
              <div className='pt-3 border-t border-gray-200 flex justify-between text-lg font-black'>
                <span>Total</span>
                <span>{totalPts} pts</span>
              </div>
              <div className='pt-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-right'>
                Your balance: {user.points} pts
              </div>
            </div>

            <Button
              className='w-full h-16 shadow-2xl shadow-accent/20'
              onClick={handleCheckout}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <span className='flex items-center gap-2'>
                  <span className='material-icons-round animate-spin text-sm'>
                    sync
                  </span>{' '}
                  Processing...
                </span>
              ) : (
                <span className='flex items-center gap-2'>
                  <span className='material-icons-round text-sm'>
                    auto_awesome
                  </span>{' '}
                  Checkout · {totalPts} pts
                </span>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
