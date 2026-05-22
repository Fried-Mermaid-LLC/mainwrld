// MainWRLD Cloud Functions entry point.
//
// More handlers (setUsernameClaim, setAdmin, moderateContent) land in
// subsequent commits (Stage 2c/2d).

import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { deleteAccount } from './deleteAccount.js'
