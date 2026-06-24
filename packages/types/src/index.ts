// Shared domain types for MainWRLD, consumed by both the React client
// (`apps/app`) and the NestJS API (`apps/api`). UI-only types (e.g. the `View`
// router union) intentionally stay in `apps/app/src/types`.
//
// Timestamp convention: wire/transport carries ISO strings or epoch numbers.
// The one exception is `NotificationItem.timestamp` which is a `Date` — that is
// the client-side shape *after* conversion; the API serializes it as an ISO
// string and the client hydrates it back to a Date.

export * from './pricing';

// Allow-listed public preview of a book (F09). Returned by the public book
// endpoint (Admin SDK, bypasses Firestore rules) so an UNauthenticated visitor
// can render a shared `/book/<id>` page. Never carries chapter bodies,
// authorUid, or monetization internals — only what the preview card needs.
export interface PublicBookPreview {
  id: string;
  title: string;
  authorDisplayName: string;
  authorUsername: string;
  coverColor: string;
  coverImage?: string;        // absolute URL when present (used for OG image)
  tagline: string;
  genres: string[];
  hashtags: string[];
  chaptersCount: number;
  totalLikes: number;         // server-summed from the likes number[]
  isMature: boolean;          // renamed from isExplicit; legacy docs read via isMature ?? isExplicit
  isCompleted: boolean;
  publishedDate: string;
  // Pricing surfaced so the public preview can show a "Buy" CTA to a signed-out
  // visitor (the action itself gates to sign-in). Not sensitive — this is the
  // public sale price; the monetization split / sellerUid stay server-only.
  price: number;              // sale price in USD (0 when not for sale)
  isMonetized: boolean;       // sold for cash
  isFree: boolean;            // explicitly free to read despite monetization
}

export interface User {
  username: string;
  displayName: string;
  email?: string;
  isOnline: boolean;
  activity: 'Reading' | 'Writing' | 'Idle';
  lastOnline?: string;                // ISO timestamp, mirrored from presence (X06)
  currentBookId?: string | null;      // book actively being read; null/absent when not reading (X06)
  notificationPrefs?: NotificationPrefs;  // per-category in-app/push prefs (X01); default all-on
  // Reader opt-in for mature content. Tri-state: true/false set explicitly by
  // the Settings toggle; `undefined` falls back to an age-based default
  // (>= MATURE_AUTO_ON_AGE → on, else off). Client-editable; not server-owned.
  showMatureContent?: boolean;
  fcmTokens?: string[];               // registered device push tokens (X01)
  position: [number, number, number];
  isMutual: boolean;
  points: number;
  admirersCount: number;
  admirersCount_unlocked?: boolean;
  mutualsCount: number;
  strikes: number;
  // ---- Moderation: strikes → auto-ban at 3 (F04) ----
  // Strikes accrue from admin moderation actions (removing a reported book/
  // comment/profile, or a manual "Strike"). At 3 the account is banned: the
  // `banned` Auth custom claim is set + the Auth user is disabled. isBanned is
  // the profile mirror enforced at the session edge (useAuthActions + logIn).
  // Reversible via the admin Unban action — content is retained, not scrubbed.
  isBanned?: boolean;                 // true once the account is banned
  bannedAt?: string;                  // ISO timestamp of the ban
  banReason?: string;                 // e.g. "3 strikes"
  lastStrikeAt?: string;              // ISO timestamp of most recent strike (audit)
  struckByReportIds?: string[];       // report ids already converted to a strike (idempotency)
  admiringCount?: number;
  avatar?: AvatarConfig;
  avatarConfig?: AvatarConfig;
  isPremium?: boolean;
  premiumSince?: string;
  dailyEarnedPoints?: number;
  lastPointsReset?: number;
  membershipStartDate?: number;
  lastMembershipRewardDate?: number;
  dailyChaptersPublished?: number;
  lastChapterPublishReset?: number;
  /** Per-conversation outgoing-message daily counters (F08), keyed by convoId
   *  (`[from, to].sort().join('__')`). Reset when `resetAt` is >24h old. */
  chatDailyCounts?: Record<string, { count: number; resetAt: number }>;
  // Mirrored from the Firebase Auth custom claim by the setAdmin
  // Cloud Function (Stage 2c). UI-only — the security source of truth
  // is the token's `admin` claim, enforced by firestore.rules.
  isAdmin?: boolean;
  // ---- Stripe Connect (seller payouts, F02) ----
  // Mirror of the connected account's state, refreshed by the
  // syncStripeAccountStatus callable + the account.updated webhook.
  // NEVER store raw bank/SSN/tax data here — Stripe holds it. We only
  // cache booleans + the account id. Written by Cloud Functions only
  // (client writes to these are rejected by firestore.rules).
  stripeAccountId?: string;          // acct_xxx, set on first onboarding-link create
  payoutsEnabled?: boolean;          // Stripe account.payouts_enabled
  chargesEnabled?: boolean;          // Stripe account.charges_enabled
  detailsSubmitted?: boolean;        // account.details_submitted (KYC + tax form done)
  stripeAccountUpdatedAt?: number;   // Date.now() of last sync, for staleness checks
  // ---- Premium membership lifecycle (F05 renewal reminder, F06 cancel) ----
  // Written by Cloud Functions only (stripeWebhook / verifyAppleReceipt /
  // cancelMembership); client writes to these are rejected by firestore.rules.
  premiumProvider?: 'stripe' | 'apple';   // where the premium subscription lives
  premiumRenewalAt?: number;               // epoch ms of next renewal; drives the 7-day reminder (F05)
  premiumCancelAtPeriodEnd?: boolean;      // set when the user cancels but keeps access until period end
  renewalReminderSentForAt?: number;       // dedupe: premiumRenewalAt the reminder was last sent for
  membershipAutoRenew?: boolean;           // false after a cancel-membership request (F06)
  membershipCancelledAt?: string;          // ISO timestamp of the cancel request (F06)
  stripeCustomerId?: string;               // cus_xxx, buyer-side customer for premium subscription
  stripeSubscriptionId?: string;           // sub_xxx, premium subscription (used by cancelMembership)
  // ---- Onboarding (F10) ----
  onboardingTutorialDismissed?: boolean;   // true once the welcome popup's "do not show again" is checked
}

export interface UserRecord extends User {
  password: string;
  email?: string;
  birthDate?: string;
}

// Notification preference categories (X01, shared with F06 settings).
// Label -> category mapping:
//   newAdmirers -> "New Admirer", "Mutual Connection!"
//   bookLikes   -> "Chapter Liked"
//   comments    -> "New Comment", "Comment Liked"
//   appUpdates  -> "New Book", "New Chapter" (author broadcasts)
export interface NotificationPrefs {
  newAdmirers: boolean;
  bookLikes: boolean;
  comments: boolean;
  appUpdates: boolean;
  push?: boolean;          // master push toggle; false/undefined = push off
}

export type NotificationCategory =
  | 'newAdmirers'
  | 'bookLikes'
  | 'comments'
  | 'appUpdates'
  | 'messages'
  | 'system';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  icon: string;
  timestamp: Date;
  recipient: string;
  sender?: string;
  read?: boolean;
  targetId?: string;
  targetChapterIndex?: number;
  commentId?: string;
  category?: NotificationCategory;
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  read: boolean;
  // Snapshot of sender.isPremium at send time (F08). Drives membership-aware
  // retention: the pruneExpiredMessages scheduled function deletes non-member
  // messages ~1 year after `timestamp`; member messages are kept forever.
  senderIsPremium?: boolean;
}

export interface Relationship {
  admirer: string;
  target: string;
  timestamp: string;
}

export interface Comment {
  id: string;
  bookId: string;
  chapterIndex?: number;
  author: string;
  authorUsername?: string;   // username of the commenter (on the doc; used for moderation strikes)
  text: string;
  likes: number;
  likedBy?: string[];
  timestamp: string;
}

export interface Coupon {
  id: string;
  value: number;
  used: boolean;
}

// Optional category a reporter can attach so admins can triage faster. A
// "sexual" report on a book routes a mature-content complaint into the same
// strike/take-down pipeline. Legacy reports have no reason (kept optional).
export type ReportReason =
  | 'sexual'
  | 'harassment'
  | 'spam'
  | 'hate'
  | 'violence'
  | 'other';

export interface Report {
  id: string;
  type: 'Book' | 'Comment' | 'User';
  targetId: string;
  reportedBy: string;
  timestamp: string;
  status: 'pending' | 'resolved' | 'dismissed';
  reason?: ReportReason;
}

export type AvatarGender = 'female' | 'male';
export type AvatarCategory = 'body' | 'face' | 'hair' | 'outfit';

export interface AvatarConfig {
  gender: AvatarGender;
  bodyId: string;
  faceId: string;
  hairId: string;
  outfitId: string;
}

export interface AvatarItem {
  id: string;
  label: string;
  path: string;
  category: AvatarCategory;
  gender: AvatarGender | 'any';
  cost: number;
}

// Lightweight per-chapter metadata kept on the book document so dropdowns,
// chapter lists and lazy-load can work without reading any chapter bodies.
// `id` is the stable docId of the chapter in the books/{id}/chapters subcollection.
export interface ChapterMeta {
  id: string;
  title: string;
}

// Body of a single chapter, stored in books/{bookId}/chapters/{chapterId}.
// `order` is the position in the book; authorUsername/isDraft are denormalized
// so server-side moderation can act without re-reading the parent book doc.
export interface ChapterDoc {
  id: string;
  content: string;
  order: number;
  title: string;
  authorUsername?: string;
  isDraft?: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: User;
  coverColor: string;
  // schemaVersion >= 2: download URL pointing at Firebase Storage.
  // Legacy (schemaVersion unset/1): base64 data URL inlined in the doc.
  coverImage?: string;
  // Storage path of the cover (for deletion/replacement); only set for schema 2+.
  coverPath?: string;
  tagline: string;
  genres: string[];
  hashtags: string[];
  likes: number[];
  commentsCount: number;
  publishedDate: string;
  isCompleted: boolean;
  wasCompleted?: boolean;
  // Mature-content flag (renamed from `isExplicit`). On read, legacy docs are
  // normalized via `isMature ?? isExplicit ?? false`; new writes set `isMature`.
  isMature: boolean;
  chaptersCount: number;
  category?: 'Trending' | 'Recently Read' | 'Recommended' | 'Library';
  progress?: number;
  isFavorite?: boolean;
  isDraft?: boolean;
  price?: number;
  isOwned?: boolean;
  minLikesPerChapter?: number;
  // Chapter bodies live in the books/{id}/chapters subcollection, not on the
  // book doc. `chapterMeta` carries order + titles for the UI; chaptersCount is
  // the published-prefix length.
  chapterMeta?: ChapterMeta[];
  schemaVersion?: number;
  favoritesLastWeek?: number;       // legacy/mock-only; superseded by favoritesTotal (X04)
  favoritesTotal?: number;          // running per-book favorites count; spotlight ranking signal (X04)
  monetizationAttempts?: number;
  isMonetized?: boolean;
  wasMonetizedBefore?: boolean;
  commentsEnabled?: boolean;
  isFree?: boolean;
  // ---- Monetization request lifecycle (F01, stored on the book doc) ----
  // The admin queue is `books.filter(b => b.monetizationStatus === 'pending')`
  // — no separate collection. Written server-side (submitMonetizationRequest /
  // reviewMonetization callables); client writes to these are rejected by rules.
  monetizationStatus?: 'none' | 'pending' | 'approved' | 'denied';
  requestedPrice?: number;            // USD tier the author asked for (9.99…29.99)
  monetizationRequestedAt?: string;   // ISO; when the request was submitted
  monetizationDenialReason?: string;  // set by reviewMonetization on denial (F03)
  monetizationReviewedAt?: string;    // ISO; when the admin accepted/denied (F03)
  monetizationReviewedBy?: string;    // admin username (F03)
  // Permanence: once true the book can NEVER be monetized again. Set by the
  // onBookMonetized trigger on author un-monetize / unpublish-while-monetized /
  // admin take-down. Treat `permanentlyDemonetized || wasMonetizedBefore` as
  // the terminal block (see canMonetize in src/config/constants.ts).
  permanentlyDemonetized?: boolean;
  // ---- Stripe Connect seller identity (F02) ----
  sellerUid?: string;                 // firebaseUid of the author at monetize time
  sellerStripeAccountId?: string;     // acct_xxx the 70% is transferred to
}

export interface BookProgress {
  scrollProgress: number;
  chapterIndex: number;
  scrollTopPx?: number;
  scrollHeightPx?: number;
  clientHeightPx?: number;
  scrollLeftPx?: number;
  scrollWidthPx?: number;
  clientWidthPx?: number;
  savedAt?: number;
}
