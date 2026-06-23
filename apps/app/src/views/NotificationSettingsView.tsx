import { useApp } from '@/state/AppContext'
import * as fbService from '@/services/firebaseService'
import type { NotificationPrefs } from '@/types'

// Per-category notification toggles (F06 §5.1.D). Each row maps to a
// NotificationPrefs key; the same prefs gate the in-app feed (useNotifications)
// and server-side push (sendPushOnNotification). "Messages" and "system" have no
// row — they are always delivered. Default ON when unset (?? true).
const ROWS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'newAdmirers', label: 'New Admirers' },
  { key: 'bookLikes', label: 'Book Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'appUpdates', label: 'App Updates' }
]

export const NotificationSettingsView = () => {
  const { setView, user, setUser, firebaseUid, showToast } = useApp()

  const prefs = user.notificationPrefs
  const isOn = (key: keyof NotificationPrefs) => prefs?.[key] ?? true

  const toggle = (key: keyof NotificationPrefs) => {
    const next: NotificationPrefs = {
      newAdmirers: isOn('newAdmirers'),
      bookLikes: isOn('bookLikes'),
      comments: isOn('comments'),
      appUpdates: isOn('appUpdates'),
      ...(prefs?.push !== undefined ? { push: prefs.push } : {}),
      [key]: !isOn(key)
    }
    // Optimistic local update so the switch flips instantly; roll back on a
    // failed persist. Only notificationPrefs is written (a client-editable
    // field); server-owned fields are untouched.
    setUser({ ...user, notificationPrefs: next })
    if (firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, { notificationPrefs: next })
        .catch(err => {
          console.error('[MainWRLD] notificationPrefs save failed', err)
          setUser({ ...user, notificationPrefs: prefs })
          showToast('Could not save. Please try again.', 'error')
        })
    }
  }

  return (
    <div className='fixed inset-0 bg-white p-8 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
      <header className='flex items-center gap-4 mb-10'>
        <button
          onClick={() => setView('settings')}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold'>Notifications</h1>
      </header>
      <div className='space-y-6'>
        {ROWS.map(({ key, label }) => (
          <div
            key={key}
            className='flex justify-between items-center p-6 bg-gray-50 rounded-3xl'
          >
            <span className='text-sm font-bold'>{label}</span>
            <input
              type='checkbox'
              checked={isOn(key)}
              onChange={() => toggle(key)}
              className='accent-accent w-5 h-5'
            />
          </div>
        ))}
      </div>
    </div>
  )
}
