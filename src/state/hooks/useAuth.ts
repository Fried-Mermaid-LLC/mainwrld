import { useState, useEffect } from 'react'
import { auth } from '@/lib/firebase'
import { ADMIN_USERNAMES } from '@/config/constants'
import type { User } from '@/types'

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
  const [signUpForm, setSignUpForm] = useState({
    email: '',
    birthDate: '',
    displayName: '',
    username: '',
    password: ''
  })
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [authError, setAuthError] = useState<string | null>(null)
  // Admin authority lives in the Firebase Auth custom claim `admin`,
  // set by the setAdmin Cloud Function (Stage 2c). The Firestore Rules
  // enforce this server-side; this client state is just for UI.
  // ADMIN_USERNAMES.includes(...) is kept as a TEMPORARY fallback so
  // existing admins keep working until the bootstrap setAdmin call is
  // run for them — it should be removed once all admins have the claim.
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
  const isAdmin = hasAdminClaim || ADMIN_USERNAMES.includes(user.username)
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
    hasAdminClaim,
    setHasAdminClaim,
    isAdmin
  }
}
