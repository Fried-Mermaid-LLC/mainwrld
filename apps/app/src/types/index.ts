// Shared domain types now live in the workspace package `@mainwrld/types` and
// are consumed by both this client and the NestJS API. This barrel re-exports
// them so existing `@/types` imports across the app keep working unchanged.
// UI-only types (the `View` router union) stay local below.
export * from '@mainwrld/types';

export type View =
  | 'splash' | 'landing' | 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'terms' | 'privacy'
  | 'home' | 'explore' | 'library' | 'write' | 'publishing'
  | 'monetization-request' | 'self-profile' | 'customization'
  | 'profile' | 'book-detail' | 'reading' | 'notifications'
  | 'notification-settings' | 'settings' | 'comments' | 'blocked-users' | 'admin-dashboard' | 'daily-rewards' | 'cart'
  | 'chat' | 'chat-conversation' | 'public-book';

export default {};
