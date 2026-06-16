import React, { useState } from 'react'
import { Button } from '@/components/sharedComponents'
import * as iap from '@/services/iap'
import * as fbService from '@/services/firebaseService'
import { useApp } from '@/state/AppContext'
import type { User, View } from '@/types'

export const SettingsView = () => {
  const { handleLogout, isAdmin, user, showToast, setView, setUser, firebaseUid } =
    useApp()
  const onBack = () => setView('self-profile')
  const onNavigate = (v: View) => setView(v)
  const onUpdateUser = (updatedUser: User) => {
    setUser(updatedUser)
    if (firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, {
          displayName: updatedUser.displayName,
          points: updatedUser.points,
          strikes: updatedUser.strikes
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
  const [activeModal, setActiveModal] = useState<string | null>(null)
  const [formValue, setFormValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
      <header className='p-6 flex items-center gap-4'>
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

      <div className='p-6 space-y-10 pb-32'>
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
            <button
              onClick={() =>
                showToast('More languages coming soon!', 'translate')
              }
              className='w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all'
            >
              <span className='font-bold text-sm'>Language</span>
              <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                chevron_right
              </span>
            </button>
          </div>
        </section>

        <section className='space-y-4'>
          <h3 className='text-[10px] font-bold text-gray-300 uppercase tracking-widest ml-4'>
            Payments
          </h3>
          <div className='bg-gray-50 rounded-[2.5rem] overflow-hidden border border-gray-100'>
            {[
              'Add Bank Account',
              'View Earnings',
              'Withdraw Earnings',
              'View Purchase History'
            ].map((opt, i) => (
              <button
                key={opt}
                onClick={() =>
                  showToast('Payment features coming soon!', 'account_balance')
                }
                className={`w-full p-6 text-left flex justify-between items-center group active:bg-white transition-all ${
                  i !== 3 ? 'border-b border-gray-100' : ''
                }`}
              >
                <span className='font-bold text-sm'>{opt}</span>
                <span className='material-icons-round text-gray-200 group-hover:text-accent transition-colors'>
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        </section>

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

        <Button variant='destructive' className='w-full' onClick={handleLogout}>
          <span className='material-icons-round'>logout</span> Log Out
        </Button>
      </div>
    </div>
  )
}
