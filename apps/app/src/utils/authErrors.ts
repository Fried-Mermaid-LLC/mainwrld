// Maps Firebase Auth error codes to short, human-readable messages so forms
// never surface raw strings like "Firebase: Error (auth/invalid-credential).".
// Falls back to a generic message rather than leaking SDK internals.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect username or password.',
  'auth/invalid-login-credentials': 'Incorrect username or password.',
  'auth/wrong-password': 'Incorrect username or password.',
  'auth/user-not-found': 'Incorrect username or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Please choose a stronger password.',
  'auth/missing-password': 'Please enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed':
    'Network error. Check your connection and try again.',
  'auth/requires-recent-login': 'Please log in again to continue.',
  'auth/operation-not-allowed': 'This sign-in method is not available.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
}

// Pull the code off whatever the catch block received. Firebase errors carry a
// `.code`; some wrappers only stamp a "(auth/...)" fragment into `.message`.
const extractCode = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' && code) return code
  const message = (err as { message?: unknown }).message
  if (typeof message === 'string') {
    const match = message.match(/\(?(auth\/[a-z-]+)\)?/i)
    if (match) return match[1].toLowerCase()
  }
  return undefined
}

export const authErrorMessage = (
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => {
  const code = extractCode(err)
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code]
  return fallback
}
