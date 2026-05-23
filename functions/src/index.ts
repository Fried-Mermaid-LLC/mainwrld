// MainWRLD Cloud Functions entry point.

import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { deleteAccount } from './deleteAccount.js'
export { setUsernameClaim, setAdmin } from './userClaims.js'
export { moderateCommentOnCreate, moderateBookOnWrite } from './moderate.js'
export { verifyAppleReceipt } from './verifyAppleReceipt.js'
