import type { View } from '@/types'

// Web URL <-> app-view mapping for the History-API navigation sync (useUrlSync).
// The app's single source of truth stays the `view` state + the selection state
// (selectedBook / selectedProfileUser / selectedChatUser); this module only
// translates that pair to/from a readable URL so the address bar reflects
// navigation and the browser Back/Forward buttons work. Native (capacitor://)
// never uses these — deep links there go through main.tsx's appUrlOpen.

export interface Route {
  view: View
  bookId?: string // book-detail / public-book / reading / comments / write / publishing
  username?: string // profile (another user)
  chatUsername?: string // chat-conversation
  chapterIndex?: number // reading
}

// Views the SPA can render before auth settles (so a cold-loaded /login or
// /terms paints immediately instead of flashing the splash → landing path).
const PUBLIC_INITIAL_VIEWS: ReadonlySet<View> = new Set<View>([
  'login',
  'signup',
  'forgot-password',
  'reset-password',
  'terms',
  'privacy',
  'guidelines',
])

export const isPublicInitialView = (v: View): boolean =>
  PUBLIC_INITIAL_VIEWS.has(v)

// Views renderable without a session: the no-auth initial views plus `landing`
// and the public shared-book preview. Used to keep Back/Forward from dropping a
// signed-out visitor into an auth-only screen.
export const isPublicView = (v: View): boolean =>
  v === 'landing' || v === 'public-book' || PUBLIC_INITIAL_VIEWS.has(v)

// Authed views that useUrlSync must re-apply on a cold deep-load: the auth
// listener routes every signed-in launch to `home`, so without this a
// deep-linked /explore or /u/<name> would be overwritten. The shared-book
// routes (book-detail / public-book) are intentionally excluded — they are
// owned by the F09 flow (resolveInitialView stashes the id, useAuthActions /
// PublicBookLandingPage open the book).
const CLIENT_APPLY_VIEWS: ReadonlySet<View> = new Set<View>([
  'explore',
  'library',
  'write',
  'publishing',
  'monetization-request',
  'self-profile',
  'customization',
  'notifications',
  'notification-settings',
  'settings',
  'blocked-users',
  'admin-dashboard',
  'daily-rewards',
  'chat',
  'chat-conversation',
  'profile',
  'reading',
  'comments',
])

export const needsClientApply = (v: View): boolean => CLIENT_APPLY_VIEWS.has(v)

// Map the current view + selection to a URL path (no query string). Returns
// null for transient/un-addressable views (splash, cart) and for param views
// missing their param — the caller then leaves the address bar untouched.
export function routeToPath(r: Route): string | null {
  switch (r.view) {
    case 'home':
    case 'landing':
      return '/'
    case 'login':
      return '/login'
    case 'signup':
      return '/signup'
    case 'forgot-password':
      return '/forgot-password'
    case 'terms':
      return '/terms'
    case 'privacy':
      return '/privacy'
    case 'guidelines':
      return '/guidelines'
    case 'explore':
      return '/explore'
    case 'library':
      return '/library'
    case 'write':
      // Editing a specific book carries its id; the works grid (no book open)
      // stays on the bare /write.
      return r.bookId ? `/write/${r.bookId}` : '/write'
    case 'publishing':
      // Book Details for an existing book carries its id; the New Book setup
      // screen (no id yet) stays on the bare /publish.
      return r.bookId ? `/publish/${r.bookId}` : '/publish'
    case 'monetization-request':
      return '/monetization'
    case 'self-profile':
      return '/me'
    case 'customization':
      return '/customize'
    case 'notifications':
      return '/notifications'
    case 'settings':
      return '/settings'
    case 'notification-settings':
      return '/settings/notifications'
    case 'blocked-users':
      return '/settings/blocked'
    case 'admin-dashboard':
      return '/admin'
    case 'daily-rewards':
      return '/rewards'
    case 'chat':
      return '/chat'
    case 'chat-conversation':
      return r.chatUsername
        ? `/chat/${encodeURIComponent(r.chatUsername)}`
        : '/chat'
    case 'profile':
      return r.username ? `/u/${encodeURIComponent(r.username)}` : null
    case 'book-detail':
    case 'public-book':
      // Canonical, shareable book URL — matches buildBookShareUrl + the
      // `/book/**` → ogBook Hosting rewrite that unfurls link previews.
      return r.bookId ? `/book/${r.bookId}` : null
    case 'reading':
      // Top-level prefix (not /book/**) so a hard refresh is served the SPA by
      // the `**` catch-all instead of being intercepted by ogBook.
      return r.bookId ? `/read/${r.bookId}` : null
    case 'comments':
      return r.bookId ? `/comments/${r.bookId}` : null
    // splash, cart, reset-password (keeps its Firebase oobCode query): no path.
    default:
      return null
  }
}

// Parse a location into a Route, or null when the path maps to no known view
// (the caller falls back to its default). Accepts both the canonical
// `/book/<id>` path and the `?book=<id>` query the ogBook function redirects
// real humans to, plus the Firebase password-reset query.
export function parsePath(pathname: string, search: string): Route | null {
  const params = new URLSearchParams(search)
  if (params.get('mode') === 'resetPassword' && params.get('oobCode')) {
    return { view: 'reset-password' }
  }
  const qBook = params.get('book')
  if (qBook && /^[A-Za-z0-9_-]+$/.test(qBook)) {
    return { view: 'public-book', bookId: qBook }
  }

  const segs = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  if (segs.length === 0) return { view: 'home' }

  const id = (s: string | undefined) =>
    s && /^[A-Za-z0-9_-]+$/.test(s) ? s : undefined

  switch (segs[0]) {
    case 'login':
      return { view: 'login' }
    case 'signup':
      return { view: 'signup' }
    case 'forgot-password':
      return { view: 'forgot-password' }
    case 'terms':
      return { view: 'terms' }
    case 'privacy':
      return { view: 'privacy' }
    case 'guidelines':
      return { view: 'guidelines' }
    case 'explore':
      return { view: 'explore' }
    case 'library':
      return { view: 'library' }
    case 'write':
      return { view: 'write', bookId: id(segs[1]) }
    // `/publish/<id>` is the current path; `/publishing` is kept as a legacy
    // alias so old bookmarks still resolve.
    case 'publish':
    case 'publishing':
      return { view: 'publishing', bookId: id(segs[1]) }
    case 'monetization':
      return { view: 'monetization-request' }
    case 'me':
      return { view: 'self-profile' }
    case 'customize':
      return { view: 'customization' }
    case 'notifications':
      return { view: 'notifications' }
    case 'rewards':
      return { view: 'daily-rewards' }
    case 'admin':
      return { view: 'admin-dashboard' }
    case 'settings':
      if (segs[1] === 'notifications') return { view: 'notification-settings' }
      if (segs[1] === 'blocked') return { view: 'blocked-users' }
      return { view: 'settings' }
    case 'chat':
      return segs[1]
        ? { view: 'chat-conversation', chatUsername: decodeURIComponent(segs[1]) }
        : { view: 'chat' }
    case 'u':
      return segs[1]
        ? { view: 'profile', username: decodeURIComponent(segs[1]) }
        : null
    case 'book': {
      const bookId = id(segs[1])
      return bookId ? { view: 'public-book', bookId } : null
    }
    case 'read': {
      const bookId = id(segs[1])
      return bookId ? { view: 'reading', bookId } : null
    }
    case 'comments': {
      const bookId = id(segs[1])
      return bookId ? { view: 'comments', bookId } : null
    }
    default:
      return null
  }
}
