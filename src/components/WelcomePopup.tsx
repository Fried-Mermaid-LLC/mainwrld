import { useState } from 'react'
import { useApp } from '@/state/AppContext'
import * as fbService from '@/services/firebaseService'
import { convertFirestoreBook } from '@/utils/bookConverter'
import { TUTORIAL_BOOK_ID } from '@/config/constants'

// First-launch onboarding popup (F10). Shown once per session to a signed-in
// user whose profile has not yet set `onboardingTutorialDismissed`. It links to
// the MainWRLD tutorial book and offers a "Do not show this again" checkbox that
// persists the dismissal so it never shows for that account again. With no
// TUTORIAL_BOOK_ID configured yet, the popup still appears but hides the "Open
// tutorial book" CTA.
export const WelcomePopup = () => {
  const { user, userDataLoaded, avatarConfig, setSelectedBook, setView, setUser, firebaseUid } =
    useApp()
  const [closedThisSession, setClosedThisSession] = useState(false)
  const [dismissForever, setDismissForever] = useState(false)
  const [opening, setOpening] = useState(false)

  const shouldShow =
    userDataLoaded &&
    !!user?.username &&
    // Hold the tutorial popup back until the appearance onboarding is done — the
    // OnboardingGate (avatarConfig still null) sits below this popup's z-index,
    // so showing both at once would stack the popup on top of character setup.
    !!avatarConfig &&
    user.onboardingTutorialDismissed !== true &&
    !closedThisSession

  if (!shouldShow) return null

  // Persist the forever-dismissal only when the box is checked. Optimistic local
  // update + best-effort Firestore write (server-owned fields stay untouched).
  const persistDismissIfChecked = () => {
    if (dismissForever && firebaseUid) {
      setUser({ ...user, onboardingTutorialDismissed: true })
      fbService
        .updateUserProfile(firebaseUid, { onboardingTutorialDismissed: true })
        .catch(console.error)
    }
  }

  const handleClose = () => {
    persistDismissIfChecked()
    setClosedThisSession(true)
  }

  const handleOpenTutorial = async () => {
    if (!TUTORIAL_BOOK_ID) return
    setOpening(true)
    try {
      const fb = await fbService.getBook(TUTORIAL_BOOK_ID)
      if (fb) {
        setSelectedBook(convertFirestoreBook(fb))
        persistDismissIfChecked()
        setClosedThisSession(true)
        setView('book-detail')
      }
    } catch (e) {
      console.error('[MainWRLD] tutorial book open failed', e)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[9997] flex items-center justify-center p-6 animate-in fade-in duration-200'>
      <div className='bg-white rounded-[2rem] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300'>
        <div className='text-center space-y-3'>
          <div className='w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto'>
            <span className='material-icons-round text-accent text-3xl'>
              auto_stories
            </span>
          </div>
          <h2 className='text-lg font-bold'>Welcome to MainWRLD</h2>
          <p className='text-sm text-gray-400 leading-relaxed'>
            A cozy world for reading and writing stories. New here? Start with our
            quick tutorial book to learn the ropes.
          </p>
        </div>

        <div className='space-y-3'>
          {TUTORIAL_BOOK_ID && (
            <button
              onClick={handleOpenTutorial}
              disabled={opening}
              className='w-full py-4 rounded-2xl bg-accent text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-60'
            >
              {opening ? 'Opening…' : 'Open tutorial book'}
            </button>
          )}
          <button
            onClick={handleClose}
            className='w-full py-4 rounded-2xl bg-gray-100 text-sm font-bold transition-all active:scale-95'
          >
            {TUTORIAL_BOOK_ID ? 'Maybe later' : 'Got it'}
          </button>
        </div>

        <label className='flex items-center justify-center gap-2 cursor-pointer select-none'>
          <input
            type='checkbox'
            checked={dismissForever}
            onChange={e => setDismissForever(e.target.checked)}
            className='w-4 h-4 accent-accent'
          />
          <span className='text-xs font-bold text-gray-400'>
            Do not show this again
          </span>
        </label>
      </div>
    </div>
  )
}
