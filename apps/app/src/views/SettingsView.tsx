import React, { useState } from 'react'
import { Button } from '@/components/sharedComponents'
import * as iap from '@/services/iap'
import * as stripeConnect from '@/services/stripeConnect'
import * as fbService from '@/services/firebaseService'
import { useApp } from '@/state/AppContext'
import { PayoutsSection } from '@/views/PayoutsSection'
import type { User, View } from '@/types'

export const SettingsView = () => {
  const {
    handleLogout,
    isAdmin,
    user,
    showToast,
    setView,
    setUser,
    firebaseUid,
    canSeeMature
  } = useApp()
  const onBack = () => setView('self-profile')
  const onNavigate = (v: View) => setView(v)
  const onUpdateUser = (updatedUser: User) => {
    setUser(updatedUser)
    if (firebaseUid) {
      // Only persist client-editable profile fields here. Server-owned fields
      // (points, strikes, isPremium, isAdmin, …) are written exclusively by
      // Cloud Functions and rejected from client writes by firestore.rules (C1).
      fbService
        .updateUserProfile(firebaseUid, {
          displayName: updatedUser.displayName
        })
        .catch(console.error)
    }
  }
  const onUpdatePassword = async (newPassword: string) => {
    try {
      await fbService.changePassword(newPassword)
      showToast('Password updated!', 'check_circle')
    } catch (err: any) {
      showToast(
        'Failed to update password. You may need to log in again.',
        'error'
      )
    }
  }
  // Mature-content opt-in. The displayed state is the effective `canSeeMature`
  // (which already resolves the age default), so flipping it writes the
  // opposite explicit boolean. Optimistic with rollback, mirroring the
  // notification toggle. `showMatureContent` is client-editable and not in
  // PROTECTED_FIELDS, so updateUserProfile persists it.
  const toggleMatureContent = () => {
    const prev = user.showMatureContent
    const next = !canSeeMature
    setUser({ ...user, showMatureContent: next })
    if (firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, { showMatureContent: next })
        .catch(err => {
          console.error('[MainWRLD] showMatureContent save failed', err)
          setUser({ ...user, showMatureContent: prev })
          showToast('Could not save. Please try again.', 'error')
        })
    }
  }
  const [activeModal, setActiveModal] = useState<string | null>(null)
  const [formValue, setFormValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Membership already cancelled (auto-renew off / will not renew). On the web
  // rail the button becomes a non-interactive status; on iOS it still deep-links
  // to the App Store so the user can re-manage the Apple subscription.
  const membershipCancelled =
    user.membershipAutoRenew === false || user.premiumCancelAtPeriodEnd === true

  const handleCancelMembership = () => {
    if (iap.isNativeIAPAvailable()) {
      // Apple-managed subscriptions can only be cancelled in the App Store.
      // `_system` lets Capacitor hand the itms-apps:// scheme to iOS.
      window.open('itms-apps://apps.apple.com/account/subscriptions', '_system')
      return
    }
    if (membershipCancelled) return
    setShowCancelConfirm(true)
  }

  const confirmCancelMembership = async () => {
    setCancelling(true)
    try {
      await stripeConnect.cancelMembership()
      setUser({
        ...user,
        membershipAutoRenew: false,
        premiumCancelAtPeriodEnd: true
      })
      showToast(
        'Membership cancelled. You keep access until your period ends.',
        'check_circle'
      )
    } catch (err: any) {
      showToast(
        err?.message || 'Could not cancel membership. Please try again.',
        'error'
      )
    } finally {
      setCancelling(false)
      setShowCancelConfirm(false)
    }
  }

  const handleSave = () => {
    if (activeModal === 'email') {
      if (!formValue.includes('@')) {
        showToast('Please enter a valid email', 'error')
        return
      }
      onUpdateUser({ ...user, email: formValue })
      showToast('Email updated!', 'check_circle')
    } else if (activeModal === 'displayName') {
      if (formValue.length < 3) {
        showToast('Display name must be at least 3 characters', 'error')
        return
      }
      onUpdateUser({ ...user, displayName: formValue })
      showToast('Display name updated!', 'check_circle')
    } else if (activeModal === 'password') {
      if (formValue.length < 12) {
        showToast('Password must be at least 12 characters', 'error')
        return
      }
      if (formValue !== confirmPassword) {
        showToast('Passwords do not match', 'error')
        return
      }
      onUpdatePassword(formValue)
      showToast('Password updated!', 'check_circle')
    }
    setActiveModal(null)
    setFormValue('')
    setConfirmPassword('')
  }

  const accountOptions = [
    {
      label: 'Change Email',
      action: () => {
        setActiveModal('email')
        setFormValue(user.email || '')
      }
    },
    {
      label: 'Change Display Name',
      action: () => {
        setActiveModal('displayName')
        setFormValue(user.displayName)
      }
    },
    {
      label: 'Change Password',
      action: () => {
        setActiveModal('password')
        setFormValue('')
      }
    },
    { label: 'Blocked Users', action: () => onNavigate('blocked-users') },
    // Apple App Review guideline 3.1.1 requires a clearly-visible
    // Restore Purchases option for apps that sell IAP subscriptions or
    // non-consumables. Only shown on iOS — on web the Stripe flow has
    // no equivalent.
    ...(iap.isNativeIAPAvailable()
      ? [
          {
            label: 'Restore Purchases',
            action: async () => {
              try {
                await iap.restorePurchases()
                showToast('Restoring any prior purchases…', 'sync')
              } catch (err: any) {
                console.error('[MainWRLD IAP] restore failed:', err)
                showToast(err?.message || 'Restore failed.', 'error')
              }
            }
          }
        ]
      : []),
    {
      label: 'Permanently Delete Account',
      action: () => setShowDeleteConfirm(true),
      danger: true
    }
  ]

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
      <header className='p-6 flex items-center gap-4 max-w-2xl mx-auto w-full'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>Settings</h1>
      </header>

      {/* Modal for editing */}
      {activeModal && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-6 animate-in fade-in duration-200'>
          <div className='bg-white rounded-[2rem] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300'>
            <h2 className='text-lg font-bold text-center'>
              {activeModal === 'email'
                ? 'Change Email'
                : activeModal === 'displayName'
                ? 'Change Display Name'
                : 'Change Password'}
            </h2>
            <div className='space-y-4'>
              <input
                type={
                  activeModal === 'password'
                    ? 'password'
                    : activeModal === 'email'
                    ? 'email'
                    : 'text'
                }
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
                placeholder={
                  activeModal === 'email'
                    ? 'Enter new email'
                    : activeModal === 'displayName'
                    ? 'Enter new display name'
                    : 'Enter new password'
                }
                className='w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent'
              />
              {activeModal === 'password' && (
                <input
                  type='password'
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder='Confirm new password'
                  className='w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent'
                />
              )}
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => {
                  setActiveModal(null)
                  setFormValue('')
                  setConfirmPassword('')
                }}
                className='flex-1 py-4 rounded-2xl bg-gray-100 text-sm font-bold transition-all active:scale-95'
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className='flex-1 py-4 rounded-2xl bg-accent text-white text-sm font-bold transition-all active:scale-95'
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirmation */}
      {showDeleteConfirm && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-6 animate-in fade-in duration-200'>
          <div className='bg-white rounded-[2rem] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300'>
            <div className='text-center space-y-3'>
              <div className='w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto'>
                <span className='material-icons-round text-red-500 text-3xl'>
                  warning
                </span>
              </div>
              <h2 className='text-lg font-bold'>Delete Account?</h2>
              <p className='text-sm text-gray-400 leading-relaxed'>
                This action cannot be undone. All your books, comments, and data
                will be permanently deleted.
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className='flex-1 py-4 rounded-2xl bg-gray-100 text-sm font-bold transition-all active:scale-95'
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDeleteConfirm(false)
                  try {
                    await fbService.deleteCurrentAccount()
                    showToast('Account deleted', 'check_circle')
                  } catch (err: any) {
                    console.error('[MainWRLD] deleteAccount failed:', err)
                    showToast(
                      err?.message || 'Account deletion failed. Please try again.',
                      'error'
                    )
                  }
                  // Either way, route back to login state.
                  handleLogout()
                }}
                className='flex-1 py-4 rounded-2xl bg-red-500 text-white text-sm font-bold transition-all active:scale-95'
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel membership confirmation (web / Stripe rail) */}
      {showCancelConfirm && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-6 animate-in fade-in duration-200'>
          <div className='bg-white rounded-[2rem] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300'>
            <div className='text-center space-y-3'>
              <div className='w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto'>
                <span className='material-icons-round text-red-500 text-3xl'>
                  workspace_premium
                </span>
              </div>
              <h2 className='text-lg font-bold'>Cancel Membership?</h2>
              <p className='text-sm text-gray-400 leading-relaxed'>
                Your MainWRLD+ benefits stay active until the end of your current
                billing period, then auto-renew turns off. You can re-subscribe
                anytime.
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
                className='flex-1 py-4 rounded-2xl bg-gray-100 text-sm font-bold transition-all active:scale-95 disabled:opacity-60'
              >
                Keep Membership
              </button>
              <button
                onClick={confirmCancelMembership}
                disabled={cancelling}
                className='flex-1 py-4 rounded-2xl bg-red-500 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-60'
              >
                {cancelling ? 'Cancelling…' : 'Cancel Membership'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className='p-6 space-y-10 pb-32 max-w-2xl mx-auto'>
        <section className='space-y-4'>
          <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
            Account & Privacy
          </h3>
          <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
            {accountOptions.map((opt, i) => (
              <button
                key={opt.label}
                onClick={opt.action}
                className={`w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all ${
                  opt.danger ? 'text-red-500' : ''
                } border-b border-gray-100 last:border-none`}
              >
                <span className='font-bold text-sm'>{opt.label}</span>
                <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className='space-y-4'>
          <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
            App Configuration
          </h3>
          <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
            <button
              onClick={() => onNavigate('notification-settings')}
              className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all border-b border-gray-100'
            >
              <span className='font-bold text-sm'>Notification Settings</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                chevron_right
              </span>
            </button>
            <div className='w-full p-6 flex justify-between items-center gap-4'>
              <div className='min-w-0'>
                <span className='font-bold text-sm'>Show Mature Content</span>
                <p className='text-[10px] text-gray-400 mt-0.5 leading-tight'>
                  Show books and content marked as mature.
                </p>
              </div>
              <input
                type='checkbox'
                checked={canSeeMature}
                onChange={toggleMatureContent}
                className='accent-accent w-5 h-5 shrink-0'
                aria-label='Show mature content'
              />
            </div>
          </div>
        </section>

        {user.isPremium && (
          <section className='space-y-4'>
            <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
              Membership
            </h3>
            <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
              <button
                onClick={handleCancelMembership}
                disabled={membershipCancelled && !iap.isNativeIAPAvailable()}
                className={`w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all ${
                  membershipCancelled ? 'text-gray-400' : 'text-red-500'
                } disabled:active:bg-transparent`}
              >
                <span className='font-bold text-sm'>
                  {membershipCancelled
                    ? 'Membership Cancelled'
                    : 'Cancel Membership'}
                </span>
                <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                  chevron_right
                </span>
              </button>
            </div>
          </section>
        )}

        <PayoutsSection />

        {isAdmin && (
          <section className='space-y-4'>
            <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
              Administration
            </h3>
            <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
              <button
                onClick={() => onNavigate('admin-dashboard')}
                className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all'
              >
                <span className='font-bold text-sm'>Admin Dashboard</span>
                <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                  chevron_right
                </span>
              </button>
            </div>
          </section>
        )}

        <section className='space-y-4'>
          <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
            About & Legal
          </h3>
          <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
            <button
              onClick={() => onNavigate('guidelines')}
              className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all border-b border-gray-100'
            >
              <span className='font-bold text-sm'>Community Guidelines</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                chevron_right
              </span>
            </button>
            <button
              onClick={() => onNavigate('terms')}
              className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all border-b border-gray-100'
            >
              <span className='font-bold text-sm'>Terms &amp; EULA</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                chevron_right
              </span>
            </button>
            <button
              onClick={() => onNavigate('privacy')}
              className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all border-b border-gray-100'
            >
              <span className='font-bold text-sm'>Privacy Policy</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                chevron_right
              </span>
            </button>
            <a
              href='mailto:hello@mainwrld.com'
              className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all'
            >
              <span className='font-bold text-sm'>Contact / Report a Problem</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                mail_outline
              </span>
            </a>
          </div>
        </section>

        <Button variant='destructive' className='w-full' onClick={handleLogout}>
          <span className='material-icons-round'>logout</span> Log Out
        </Button>
      </div>
    </div>
  )
}
