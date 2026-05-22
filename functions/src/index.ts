// MainWRLD Cloud Functions entry point.
//
// More handlers (moderateContent) land in subsequent commits
// (Stage 2d).

import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { deleteAccount } from './deleteAccount.js'
export { setUsernameClaim, setAdmin } from './userClaims.js'
