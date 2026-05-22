// MainWRLD Cloud Functions entry point.
//
// Concrete handlers (deleteAccount, setUsernameClaim, setAdmin,
// moderateContent) land in subsequent commits (Stage 2b/2c/2d). This
// file exists so the project structure is in place and `firebase
// deploy --only functions` does not fail with "no exports found" once
// access is granted.

import { initializeApp } from 'firebase-admin/app'

initializeApp()

// Placeholder export so `firebase deploy` sees at least one function
// and the deploy pipeline is well-formed. Real exports replace this
// in Stage 2b.
export const healthcheck = () => ({ ok: true })
