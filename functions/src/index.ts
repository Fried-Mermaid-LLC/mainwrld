// MainWRLD Cloud Functions entry point.

import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { deleteAccount } from './deleteAccount.js'
export { setUsernameClaim, setAdmin, ensureUsernameClaim } from './userClaims.js'
export {
  moderateCommentOnCreate,
  moderateBookOnWrite,
  moderateChapterOnWrite,
} from './moderate.js'
export { getChapterContent } from './chapters.js'
export { verifyAppleReceipt } from './verifyAppleReceipt.js'
export { sendWelcomeEmail } from './sendWelcomeEmail.js'
export { stripeWebhook } from './stripeWebhook.js'
export {
  createStripeAccountLink,
  syncStripeAccountStatus,
  createStripeDashboardLink,
  getSellerBalance,
  submitMonetizationRequest,
  reviewMonetization,
  createBookCheckoutSession,
} from './stripeConnect.js'
export { onBookMonetized } from './monetization.js'
export { mirrorPresence } from './presence.js'
export { rotateSpotlight, rotateSpotlightNow } from './spotlight.js'
export { blockUnderageSignup } from './blockUnderageSignup.js'
