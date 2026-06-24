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
// Apple receipt verification, the Stripe webhook, welcome/password-reset
// emails, and the renewal-reminder cron all moved to the NestJS API
// (apps/api). Their Cloud Functions + the shared email.ts were removed once
// the client, Stripe Dashboard webhook URL, and Cloud Scheduler were pointed
// at the API.
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
export { cancelMembership } from './cancelMembership.js'
export { mirrorPresence } from './presence.js'
export { rotateSpotlight, rotateSpotlightNow } from './spotlight.js'
export { enforceChatRateLimit } from './chatRateLimit.js'
export { pruneExpiredMessages } from './pruneMessages.js'
export { blockUnderageSignup } from './blockUnderageSignup.js'
// NOTE: push fan-out now runs inline in the API (NotificationsService.pushFanout).
// The old sendPushOnNotification onCreate trigger was removed to stop every
// notification firing TWO pushes (inline + trigger) on iOS.
