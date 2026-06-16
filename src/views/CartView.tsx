import React, { useState, useEffect } from 'react'
import { Button } from '@/components/sharedComponents'
import { getStripe, STRIPE_PUBLISHABLE_KEY, STRIPE_BOOK_PRICE_ID } from '@/config/config'
import type { Coupon } from '@/types'
import * as fbService from '@/services/firebaseService'
import { useApp } from '@/state/AppContext'

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
    setUserBookData,
    setBooks,
    selectedBook,
    setSelectedBook,
    firebaseUid
  } = useApp()
  const onBack = () => setView('self-profile')
  const onOwnedUpdate = (bookId: string) => {
    const currentUd = userBookDataRef.current[user.username] || {
      ownedBookIds: [],
      bookProgress: {},
      purchasedBookIds: []
    }
    const newOwned = currentUd.ownedBookIds.includes(bookId)
      ? currentUd.ownedBookIds
      : [...currentUd.ownedBookIds, bookId]
    const currentPurchased = currentUd.purchasedBookIds || []
    const newPurchased = currentPurchased.includes(bookId)
      ? currentPurchased
      : [...currentPurchased, bookId]
    const updatedUd = {
      ...currentUd,
      ownedBookIds: newOwned,
      purchasedBookIds: newPurchased
    }
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
    setBooks(prev => {
      const updated = prev.map(b =>
        b.id === bookId ? { ...b, isOwned: true } : b
      )
      if (selectedBook && selectedBook.id === bookId) {
        setSelectedBook({ ...selectedBook, isOwned: true })
      }
      return updated
    })
    if (firebaseUid) {
      fbService
        .addBookToLibrary(firebaseUid, bookId)
        .catch(console.error)
    }
  }
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const subtotal = cart.reduce(
    (acc: number, item: any) => acc + (item.price || 9.99),
    0
  )
  const discount = selectedCoupon ? selectedCoupon.value : 0
  const total = Math.max(0, subtotal - discount)

  const handleRemove = (bookId: string) => {
    setCart(cart.filter((b: any) => b.id !== bookId))
  }

  // Listen for successful payment return from Stripe
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('payment_success') === 'true') {
      // Payment was successful - mark items as owned
      const purchasedIds = JSON.parse(
        localStorage.getItem('mainwrld_pending_purchase') || '[]'
      )
      const couponId = localStorage.getItem('mainwrld_pending_coupon')
      purchasedIds.forEach((id: string) => onOwnedUpdate(id))
      if (couponId) {
        // Remove used coupon from array entirely
        setCoupons((prev: any[]) => prev.filter((c: any) => c.id !== couponId))
      }
      localStorage.removeItem('mainwrld_pending_purchase')
      localStorage.removeItem('mainwrld_pending_coupon')
      setCart([])
      showToast('Purchase complete! Books added to library.', 'check_circle')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleCheckout = async () => {
    if (cart.length === 0) return

    if (total === 0) {
      // Free checkout (fully covered by coupon)
      cart.forEach((b: any) => onOwnedUpdate(b.id))
      if (selectedCoupon) {
        // Logic: Once used, remove the coupon ticket from its slot in the array.
        setCoupons(coupons.filter((c: any) => c.id !== selectedCoupon.id))
      }
      setCart([])
      showToast('Books added to library!', 'check_circle')
      onBack()
      return
    }

    setIsProcessing(true)
    try {
      const stripe = await getStripe()
      if (!stripe || STRIPE_PUBLISHABLE_KEY.includes('REPLACE')) {
        // Stripe not configured yet - use in-app confirmation
        showConfirm({
          title: 'Complete Purchase',
          message: `Buy ${cart.length} book(s) for $${total.toFixed(2)}?`,
          confirmLabel: 'Purchase',
          icon: 'shopping_cart',
          onConfirm: () => {
            cart.forEach((b: any) => onOwnedUpdate(b.id))
            if (selectedCoupon) {
              // Remove used coupon from array entirely
              setCoupons(coupons.filter((c: any) => c.id !== selectedCoupon.id))
            }
            setCart([])
            showToast(
              'Purchase complete! Books added to library.',
              'check_circle'
            )
            onBack()
          }
        })
        setIsProcessing(false)
        return
      }

      // Store pending purchase info for when user returns from Stripe
      localStorage.setItem(
        'mainwrld_pending_purchase',
        JSON.stringify(cart.map((b: any) => b.id))
      )
      if (selectedCoupon) {
        localStorage.setItem('mainwrld_pending_coupon', selectedCoupon.id)
      }

      // Use Stripe Checkout with Price ID if available, otherwise use line items
      if (STRIPE_BOOK_PRICE_ID) {
        // The line-items variant of redirectToCheckout is removed from
        // @stripe/stripe-js types (deprecated by Stripe; only works with test
        // keys). This whole branch is replaced by Apple IAP on iOS in Stage 3,
        // and the web flow will move to a server-created Checkout Session.
        // @ts-expect-error deprecated lineItems variant
        const { error } = await stripe.redirectToCheckout({
          lineItems: [{ price: STRIPE_BOOK_PRICE_ID, quantity: cart.length }],
          mode: 'payment',
          successUrl: `${window.location.origin}?payment_success=true`,
          cancelUrl: `${window.location.origin}?payment_cancelled=true`
        })
        if (error) {
          console.error('Stripe error:', error)
          showToast('Payment failed. Please try again.', 'error')
        }
      } else {
        // Fallback: use in-app confirmation
        showConfirm({
          title: 'Complete Purchase',
          message: `Pay $${total.toFixed(2)} for ${cart.length} book(s)?`,
          confirmLabel: 'Pay Now',
          icon: 'shopping_cart',
          onConfirm: () => {
            cart.forEach((b: any) => onOwnedUpdate(b.id))
            if (selectedCoupon) {
              // Remove used coupon from array entirely
              setCoupons(coupons.filter((c: any) => c.id !== selectedCoupon.id))
            }
            setCart([])
            showToast(
              'Purchase complete! Books added to library.',
              'check_circle'
            )
            onBack()
          }
        })
      }
    } catch (err) {
      console.error('Checkout error:', err)
      showToast('Payment service unavailable. Please try again later.', 'error')
    }
    setIsProcessing(false)
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
                        ${(book.price || 9.99).toFixed(2)}
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
                          <span className='text-xs font-black'>${c.value}</span>
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
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className='flex justify-between text-xs font-bold text-accent'>
                <span>Coupon Discount</span>
                <span>-${discount.toFixed(2)}</span>
              </div>
              <div className='pt-3 border-t border-gray-200 flex justify-between text-lg font-black'>
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
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
                  <span className='material-icons-round text-sm'>lock</span>{' '}
                  Checkout & Pay ${total.toFixed(2)}
                </span>
              )}
            </Button>
            <p className='text-[8px] text-gray-400 text-center font-bold uppercase tracking-widest flex items-center justify-center gap-1'>
              <span className='material-icons-round text-[10px]'>lock</span>{' '}
              Secured by Stripe
            </p>
          </>
        )}
      </div>
    </div>
  )
}
