export type View =
  | 'splash' | 'landing' | 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'terms' | 'privacy'
  | 'home' | 'explore' | 'library' | 'write' | 'publishing'
  | 'monetization-request' | 'self-profile' | 'customization'
  | 'profile' | 'book-detail' | 'reading' | 'notifications'
  | 'notification-settings' | 'settings' | 'comments' | 'blocked-users' | 'admin-dashboard' | 'daily-rewards' | 'cart'
  | 'chat' | 'chat-conversation';

export interface User {
  username: string;
  displayName: string;
  email?: string;
  isOnline: boolean;
  activity: 'Reading' | 'Writing' | 'Idle';
  lastOnline?: string;                // ISO timestamp, mirrored from presence (X06)
  currentBookId?: string | null;      // book actively being read; null/absent when not reading (X06)
  notificationPrefs?: NotificationPrefs;  // per-category in-app/push prefs (X01); default all-on
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

export interface Report {
  id: string;
  type: 'Book' | 'Comment' | 'User';
  targetId: string;
  reportedBy: string;
  timestamp: string;
  status: 'pending' | 'resolved' | 'dismissed';
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
  isExplicit: boolean;
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
  sellerStripeAccountId?: string;     // acct_xxx the 80% is transferred to
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

export default {};
