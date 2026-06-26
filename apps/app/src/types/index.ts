// Shared domain types now live in the workspace package `@mainwrld/types` and
// are consumed by both this client and the NestJS API. This barrel re-exports
// them so existing `@/types` imports across the app keep working unchanged.
// UI-only types (the `View` router union) stay local below.
export * from '@mainwrld/types';

export type View =
  | 'splash' | 'landing' | 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'terms' | 'privacy' | 'guidelines'
  | 'home' | 'explore' | 'library' | 'write' | 'publishing'
  | 'monetization-request' | 'self-profile' | 'customization'
  | 'profile' | 'book-detail' | 'reading' | 'notifications'
  | 'notification-settings' | 'settings' | 'comments' | 'blocked-users' | 'admin-dashboard' | 'daily-rewards' | 'cart'
  | 'chat' | 'chat-conversation' | 'public-book';

// A one-shot emote bumped through RTDB. `id` increments on every send so the same
// `type` fired twice still triggers readers (id-change detection). `activity` here
// is the realtime world state, a superset of the persisted User.activity that also
// allows 'Exploring' — it lives only in RTDB and is never written to Firestore.
export interface WorldEmote {
  type: string;
  id: number;
}
export interface WorldEntry {
  uid: string;          // Firebase Auth uid (RTDB key / rules owner)
  username: string;     // join key to the username-keyed social graph (mutuals/blocked)
  position: [number, number, number];
  rotY: number;
  activity: string;
  currentBookId: string | null; // book actively being read; null when not reading (X06)
  emote?: WorldEmote;
}

export default {};
