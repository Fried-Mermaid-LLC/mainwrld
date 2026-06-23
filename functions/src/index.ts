// MainWRLD Cloud Functions entry point.

import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { deleteAccount } from './deleteAccount.js'
export { setUsernameClaim, setAdmin, ensureUsernameClaim } from './userClaims.js'
export { banUser, unbanUser, strikeWatch } from './banUser.js'
export {
  moderateCommentOnCreate,
  moderateBookOnWrite,
  moderateChapterOnWrite,
  moderateChatMessageOnCreate,
  moderateUsername,
} from './moderate.js'
export { getChapterContent } from './chapters.js'
export { verifyAppleReceipt } from './verifyAppleReceipt.js'
export { sendWelcomeEmail } from './sendWelcomeEmail.js'
export { sendPasswordReset } from './sendPasswordReset.js'
export { sendRenewalReminders } from './sendRenewalReminders.js'
export { stripeWebhook } from './stripeWebhook.js'
export { ogBook } from './publicBook.js'
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
export { cancelMembership } from './cancelMembership.js'
export { mirrorPresence } from './presence.js'
export { rotateSpotlight, rotateSpotlightNow } from './spotlight.js'
export { enforceChatRateLimit } from './chatRateLimit.js'
export { pruneExpiredMessages } from './pruneMessages.js'
export { blockUnderageSignup } from './blockUnderageSignup.js'
export { sendPushOnNotification } from './sendPushOnNotification.js'
