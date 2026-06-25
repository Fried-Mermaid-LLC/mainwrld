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
// Apple receipt verification, the Stripe webhook, and welcome/password-reset
// emails all moved to the NestJS API (apps/api). Their Cloud Functions + the
// shared email.ts were removed once the client and Stripe Dashboard webhook URL
// were pointed at the API. The renewal-reminder LOGIC also lives in the API, but
// its scheduler is back here as a thin daily trigger (renewalReminders.ts) that
// POSTs the API's protected /internal/cron/renewal-reminders endpoint — so the
// schedule is provisioned by `firebase deploy` instead of a hand-configured
// Cloud Scheduler job.
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
export { sendRenewalReminders } from './renewalReminders.js'
export { blockUnderageSignup } from './blockUnderageSignup.js'
// NOTE: push fan-out now runs inline in the API (NotificationsService.pushFanout).
// The old sendPushOnNotification onCreate trigger was removed to stop every
// notification firing TWO pushes (inline + trigger) on iOS.
