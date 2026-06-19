import React, { useEffect, useState } from 'react'
import { useApp } from '@/state/AppContext'
import * as stripeConnect from '@/services/stripeConnect'
import * as fbService from '@/services/firebaseService'
import type { AccountStatus } from '@/services/stripeConnect'

// Settings → Payments. Wires the dead "Add Bank / View Earnings / Withdraw /
// Purchase History" buttons to the real Stripe Connect flow (F02): one "Set up
// payouts" entry when not connected, one combined "Earnings & Payouts" entry
// (balance + Stripe-hosted withdraw) when connected, plus buyer purchase
// history. Stripe holds all bank/tax data — MainWRLD never sees it.
export const PayoutsSection = () => {
  const { firebaseUid, books, showToast } = useApp()
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [balance, setBalance] = useState<{
    availableUsd: number
    pendingUsd: number
  } | null>(null)
  const [showEarnings, setShowEarnings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await stripeConnect.getAccountStatus()
        if (alive) setStatus(s)
      } catch {
        // Stripe not configured yet — fall back to "set up" state silently.
        if (alive)
          setStatus({
            payoutsEnabled: false,
            chargesEnabled: false,
            detailsSubmitted: false,
          })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const connected = !!status?.stripeAccountId && status.detailsSubmitted

  const onSetupPayouts = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { url } = await stripeConnect.createOnboardingLink()
      await stripeConnect.openStripeUrl(url)
    } catch (err: any) {
      showToast(err?.message || 'Could not start payout setup.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onToggleEarnings = async () => {
    const next = !showEarnings
    setShowEarnings(next)
    if (next && !balance) {
      try {
        setBalance(await stripeConnect.getBalance())
      } catch {
        setBalance({ availableUsd: 0, pendingUsd: 0 })
      }
    }
  }

  const onManage = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { url } = await stripeConnect.getDashboardLink()
      await stripeConnect.openStripeUrl(url)
    } catch (err: any) {
      showToast(err?.message || 'Could not open the payout dashboard.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onToggleHistory = async () => {
    const next = !showHistory
    setShowHistory(next)
    if (next && !history && firebaseUid) {
      try {
        const rows = await fbService.getBookPurchases(firebaseUid)
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        setHistory(rows)
      } catch {
        setHistory([])
      }
    }
  }

  const titleFor = (bookId: string) =>
    books.find((b: any) => b.id === bookId)?.title || 'Book'

  const rowCls =
    'w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all border-b border-gray-100'

  return (
    <section className='space-y-4'>
      <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
        Payments
      </h3>
      <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
        {loading ? (
          <div className='p-6 text-sm font-bold text-gray-300'>Loading…</div>
        ) : !connected ? (
          <button onClick={onSetupPayouts} disabled={busy} className={rowCls}>
            <div>
              <span className='font-bold text-sm'>Set up payouts</span>
              <p className='text-[10px] text-gray-400 font-bold mt-1'>
                Connect a bank account to start selling
              </p>
            </div>
            <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
              {busy ? 'sync' : 'account_balance'}
            </span>
          </button>
        ) : (
          <>
            <button onClick={onToggleEarnings} className={rowCls}>
              <span className='font-bold text-sm'>Earnings &amp; Payouts</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                {showEarnings ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {showEarnings && (
              <div className='px-6 py-5 bg-white/60 border-b border-gray-100 space-y-3'>
                <div className='flex justify-between text-xs font-bold'>
                  <span className='text-gray-400'>Available</span>
                  <span>
                    {balance ? `$${balance.availableUsd.toFixed(2)}` : '…'}
                  </span>
                </div>
                <div className='flex justify-between text-xs font-bold'>
                  <span className='text-gray-400'>Pending</span>
                  <span>
                    {balance ? `$${balance.pendingUsd.toFixed(2)}` : '…'}
                  </span>
                </div>
                <button
                  onClick={onManage}
                  disabled={busy}
                  className='w-full mt-2 py-3 rounded-xl bg-accent text-white text-[11px] font-bold uppercase tracking-widest'
                >
                  {busy ? 'Opening…' : 'Manage / Withdraw'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Purchase history (buyer side). */}
        <button onClick={onToggleHistory} className={`${rowCls} border-b-0`}>
          <span className='font-bold text-sm'>Purchase History</span>
          <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
            {showHistory ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {showHistory && (
          <div className='px-6 py-5 bg-white/60 space-y-3'>
            {!history ? (
              <p className='text-xs font-bold text-gray-300'>Loading…</p>
            ) : history.length === 0 ? (
              <p className='text-xs font-bold text-gray-300'>
                No purchases yet.
              </p>
            ) : (
              history.map((p) => (
                <div
                  key={p.id}
                  className='flex justify-between items-center text-xs font-bold'
                >
                  <span className='truncate mr-3'>{titleFor(p.bookId)}</span>
                  <span className='text-gray-400 whitespace-nowrap'>
                    {p.rail === 'points'
                      ? `${p.pointsPaid ?? Math.round((p.priceUsd || 0) * 100)} pts`
                      : `$${(p.priceUsd || 0).toFixed(2)}`}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <p className='text-[10px] text-gray-400 font-bold ml-4 leading-relaxed'>
        Bank details are securely held by Stripe — MainWRLD never sees them.
      </p>
    </section>
  )
}
