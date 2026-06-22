import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import * as fbService from '@/services/firebaseService'
import * as presenceService from '@/services/presenceService'
import { containsBadWord, MIN_SIGNUP_AGE } from '@/config/constants'
import { ageFromBirthDate } from '@/utils/age'
import { sendWelcomeEmail } from '@/config/config'
import type { User, View } from '@/types'

interface AuthActionsDeps {
  setUser: Dispatch<SetStateAction<User>>
  setFirebaseUid: Dispatch<SetStateAction<string | null>>
  setView: Dispatch<SetStateAction<View>>
  setFavoriteBookIds: Dispatch<SetStateAction<Set<string>>>
  setAuthLoading: Dispatch<SetStateAction<boolean>>
  setUserDataLoaded: Dispatch<SetStateAction<boolean>>
  setAuthError: Dispatch<SetStateAction<string | null>>
  setRegisteredUsers: Dispatch<SetStateAction<any[]>>
  firebaseUid: string | null
  BLANK_USER: User
  loginForm: { username: string; password: string }
  signUpForm: {
    email: string
    birthDate: string
    displayName: string
    username: string
    password: string
  }
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string
  ) => void
}

// Auth actions domain (Phase B). Owns login/signup/logout and the
// onAuthStateChanged auto-login listener. Placed at the tail of useAppValue so
// the listener registers LAST (after persist/loader/payment effects, matching
// the monolith) and so setFavoriteBookIds (useBooks), setRegisteredUsers
// (useSocial) and addNotification (useNotifications) are all direct refs. Bodies
// and the effect's (empty) dependency array are verbatim.
export function useAuthActions({
  setUser,
  setFirebaseUid,
  setView,
  setFavoriteBookIds,
  setAuthLoading,
  setUserDataLoaded,
  setAuthError,
  setRegisteredUsers,
  firebaseUid,
  BLANK_USER,
  loginForm,
  signUpForm,
  addNotification
}: AuthActionsDeps) {
  // Firebase Auth state listener - handles auto-login
  useEffect(() => {
    const timer = setTimeout(() => {
      const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
        // A password-reset link opens the app unauthenticated. Without this
        // guard the listener would bounce it to 'landing' ~1.5s after load and
        // ResetPasswordView (opened by useUI on first paint) would be unmounted.
        const params = new URLSearchParams(window.location.search)
        const signedOutView: View =
          params.get('mode') === 'resetPassword' && params.get('oobCode')
            ? 'reset-password'
            : 'landing'
        if (firebaseUser) {
          try {
            const profile = await fbService.getUserProfile(firebaseUser.uid)
            if (profile) {
              setUser({
                username: (profile as any).username,
                displayName: (profile as any).displayName,
                isOnline: true,
                activity: 'Idle',
                position: [0, 0, 0],
                isMutual: false,
                points: (profile as any).points || 0,
                admirersCount: (profile as any).admirersCount || 0,
                mutualsCount: (profile as any).mutualsCount || 0,
                strikes: (profile as any).strikes || 0,
                isPremium: (profile as any).isPremium || false,
                admiringCount: (profile as any).admiringCount || 0,
                premiumSince: (profile as any).premiumSince || undefined
              })
              // Ensure the username custom claim is on the token before the
              // username-scoped subscriptions (chat, notifications) start —
              // otherwise their first listen is rejected by the rules.
              await fbService.ensureUsernameClaim()
              setFirebaseUid(firebaseUser.uid)
              setView('home')
              // Mark user online in Firestore on auth restore
              fbService
                .updateUserProfile(firebaseUser.uid, {
                  isOnline: true,
                  lastOnline: new Date().toISOString()
                })
                .catch(console.error)
            } else {
              setFavoriteBookIds(new Set())
              setView(signedOutView)
            }
          } catch {
            setFavoriteBookIds(new Set())
            setView(signedOutView)
          }
        } else {
          setFavoriteBookIds(new Set())
          setView(signedOutView)
        }
        setAuthLoading(false)
      })
      return () => unsubscribe()
    }, 1500) // Keep splash screen delay
    return () => clearTimeout(timer)
  }, [])

  const handleLogout = async () => {
    // Mark offline in Firestore before logging out
    if (firebaseUid) {
      // Tear down the RTDB presence connection (X06) so the device stops
      // counting as online; the mirror flips the Firestore doc offline too.
      presenceService.goOffline(firebaseUid)
      await fbService
        .updateUserProfile(firebaseUid, {
          isOnline: false,
          lastOnline: new Date().toISOString()
        })
        .catch(console.error)
    }
    try {
      await fbService.logOut()
    } catch {}
    setUser(BLANK_USER)
    setFirebaseUid(null)
    setFavoriteBookIds(new Set())
    setUserDataLoaded(false)
    setView('landing')
  }

  const handleLogin = async () => {
    try {
      const result = await fbService.logIn(
        loginForm.username,
        loginForm.password
      )
      setUser({
        username: (result as any).username,
        displayName: (result as any).displayName,
        isOnline: true,
        activity: 'Idle',
        position: [0, 0, 0],
        isMutual: false,
        points: (result as any).points || 0,
        admirersCount: (result as any).admirersCount || 0,
        mutualsCount: (result as any).mutualsCount || 0,
        strikes: (result as any).strikes || 0,
        isPremium: (result as any).isPremium || false,
        admiringCount: (result as any).admiringCount || 0
      })
      // Backfill the username claim + refresh token before the
      // username-scoped subscriptions start (chat, notifications).
      await fbService.ensureUsernameClaim()
      setFirebaseUid((result as any).uid)
      setFavoriteBookIds(new Set())
      setAuthError(null)
      setView('home')
      // Mark user online in Firestore
      fbService
        .updateUserProfile((result as any).uid, {
          isOnline: true,
          lastOnline: new Date().toISOString()
        })
        .catch(console.error)
    } catch (err: any) {
      setAuthError(err.message || 'Invalid username or password.')
    }
  }

  const handleSignup = async () => {
    const { username, displayName, password, email } = signUpForm

    // Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setAuthError('Please enter a valid email address.')
      return
    }
    const usernameRegex = /^[a-z0-9_]{5,25}$/
    if (!usernameRegex.test(username)) {
      setAuthError('Username must be 5-25 chars, lowercase, no spaces.')
      return
    }
    if (displayName.length < 5 || displayName.length > 25) {
      setAuthError('Display Name must be 5-25 characters.')
      return
    }
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,35}$/
    if (!passwordRegex.test(password)) {
      setAuthError(
        'Password must be 12-35 characters and include at least one uppercase letter, one number, and one symbol.'
      )
      return
    }
    if (containsBadWord(username) || containsBadWord(displayName)) {
      setAuthError('Username or display name contains inappropriate language.')
      return
    }

    // COPPA: block under-13 signups (X09). UX gate only — the real enforcement
    // is server-side in blockUnderageSignup, which tears down any account that
    // bypasses this check.
    const age = ageFromBirthDate(signUpForm.birthDate)
    if (age === null) {
      setAuthError('Please enter your birth date.')
      return
    }
    if (age < MIN_SIGNUP_AGE) {
      setAuthError('You must be at least 13 years old to create an account.')
      return
    }

    // Check username uniqueness via Firestore
    try {
      const usernameAvailable = await fbService.checkUsernameAvailable(username)
      if (!usernameAvailable) {
        setAuthError('Username already taken.')
        return
      }
    } catch {
      setAuthError('Unable to check username. Please try again.')
      return
    }

    try {
      const result = await fbService.signUp(
        email,
        password,
        username,
        displayName,
        signUpForm.birthDate
      )

      const newUser: User = {
        username,
        displayName,
        isOnline: true,
        activity: 'Idle',
        position: [0, 0, 0],
        isMutual: false,
        points: 50,
        admirersCount: 0,
        mutualsCount: 0,
        strikes: 0
      }

      setUser(newUser)
      // signUp() refreshes the token, but the setUsernameClaim onCreate
      // trigger may not have run yet. ensureUsernameClaim stamps the claim
      // deterministically before the username-scoped subscriptions start.
      await fbService.ensureUsernameClaim()
      setFirebaseUid(result.uid)
      setFavoriteBookIds(new Set())
      setAuthError(null)
      setView('home')

      // Refresh registered users list
      fbService
        .getAllUsers()
        .then((users: any[]) => setRegisteredUsers(users))
        .catch(console.error)

      // Send welcome email asynchronously (non-blocking)
      if (email) {
        sendWelcomeEmail(email, displayName, username)
      }
      addNotification(
        'Welcome to MainWRLD!',
        `Hey ${displayName}, start exploring stories and connecting with other readers!`,
        'celebration',
        username
      )
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists.')
      } else {
        setAuthError(err.message || 'Signup failed. Please try again.')
      }
    }
  }

  return { handleLogout, handleLogin, handleSignup }
}
