import { useState, useEffect } from 'react'
import { auth } from '@/lib/firebase'
import type { User } from '@/types'

// Pristine form shapes — the single source of truth for both seeding the inputs
// and wiping them after a successful submit, so typed credentials don't linger
// in memory or repopulate the form on the next visit to login/signup.
export const BLANK_LOGIN_FORM = { username: '', password: '' }
export const BLANK_SIGNUP_FORM = {
  email: '',
  birthDate: '',
  displayName: '',
  username: '',
  password: ''
}

// Auth identity/session domain (Phase B). Owns the current user, session flags
// (authLoading / firebaseUid / userDataLoaded), the login/signup forms + error,
// and the admin claim (hasAdminClaim / isAdmin) with its onIdTokenChanged
// listener. Extracted verbatim — placed right after useUI so the token listener
// registers in the same effect order as before. Auth *actions* (login/signup/
// logout + onAuthStateChanged) remain in the body for now (→ useAuthActions).
export function useAuth() {
  const BLANK_USER: User = {
    username: '',
    displayName: '',
    isOnline: false,
    activity: 'Idle',
    position: [0, 0, 0],
    isMutual: false,
    points: 0,
    admirersCount: 0,
    mutualsCount: 0,
    strikes: 0
  }
  const [user, setUser] = useState<User>(BLANK_USER)
  const [authLoading, setAuthLoading] = useState(true)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null)
  const [userDataLoaded, setUserDataLoaded] = useState(false) // Guard for persist effects
  const [signUpForm, setSignUpForm] = useState(BLANK_SIGNUP_FORM)
  const [loginForm, setLoginForm] = useState(BLANK_LOGIN_FORM)
  const [authError, setAuthError] = useState<string | null>(null)
  // In-flight flag for the login/signup actions (NOT the initial session
  // restore, which is authLoading). Drives the spinner + disabled submit button
  // on LoginView / SignupView so the form can't be double-submitted.
  const [authBusy, setAuthBusy] = useState(false)
  // Admin authority lives ONLY in the Firebase Auth custom claim `admin`,
  // set by the setAdmin Cloud Function (Stage 2c) and enforced server-side by
  // Firestore Rules + the admin-gated callables. This client state mirrors the
  // claim for UI visibility only. (The legacy username-list fallback was
  // removed — admin access now requires the real claim.)
  const [hasAdminClaim, setHasAdminClaim] = useState(false)
  useEffect(() => {
    let cancelled = false
    const unsubscribe = auth.onIdTokenChanged(async (fbUser) => {
      if (!fbUser) {
        if (!cancelled) setHasAdminClaim(false)
        return
      }
      try {
        const tokenResult = await fbUser.getIdTokenResult()
        if (!cancelled) setHasAdminClaim(tokenResult.claims.admin === true)
      } catch {
        if (!cancelled) setHasAdminClaim(false)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  const isAdmin = hasAdminClaim
  return {
    BLANK_USER,
    user,
    setUser,
    authLoading,
    setAuthLoading,
    firebaseUid,
    setFirebaseUid,
    userDataLoaded,
    setUserDataLoaded,
    signUpForm,
    setSignUpForm,
    loginForm,
    setLoginForm,
    authError,
    setAuthError,
    authBusy,
    setAuthBusy,
    hasAdminClaim,
    setHasAdminClaim,
    isAdmin
  }
}
