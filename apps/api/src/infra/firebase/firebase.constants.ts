// DI tokens for the firebase-admin services. Inject with `@Inject(FIRESTORE)`.
export const FIREBASE_APP = Symbol('FIREBASE_APP');
export const FIRESTORE = Symbol('FIRESTORE');
export const FIREBASE_AUTH = Symbol('FIREBASE_AUTH');
export const FIREBASE_STORAGE = Symbol('FIREBASE_STORAGE');
export const FIREBASE_MESSAGING = Symbol('FIREBASE_MESSAGING');
export const FIREBASE_DB = Symbol('FIREBASE_DB');

// Firestore collection names — single source of truth, mirrors the names used
// by the client SDK and the legacy Cloud Functions so data stays compatible.
export const COLLECTIONS = {
  users: 'users',
  usernames: 'usernames',
  books: 'books',
  chapters: 'chapters', // subcollection of books/{id}
  bookPurchases: 'bookPurchases',
  relationships: 'relationships',
  chatMessages: 'chatMessages',
  notifications: 'notifications',
  comments: 'comments',
  reports: 'reports',
  appConfig: 'appConfig',
  stripeEvents: 'stripeEvents',
  iapTransactions: 'iapTransactions',
} as const;
