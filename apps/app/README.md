# apps/app — Client (React 19 + Vite + Capacitor iOS)

> Part of the **mainwrld** monorepo. For the architecture overview, data model, end-to-end
> flows, local development, and CI/CD see the [root README](../../README.md). This file is the
> in-depth reference for this workspace.

Single-page React 19 app bundled by Vite, shipped as a web build (Firebase Hosting) and wrapped by Capacitor 8 into the iOS app (`com.mainwrld`). 3D avatar world via react-three-fiber, virtual joystick, IAP, push, SSE. **No react-router** — navigation is a `view` string in React state synced to the URL via the History API.

### Boot sequence
1. [src/main.tsx](src/main.tsx) — entry. **First line is `import './bootGuard'`** (error handlers + a 10s native-splash backstop, registered *before* anything that can throw at import time). Then registers the native `appUrlOpen` deep-link listener (Universal Links `https://mainwrld.com/book/<id>`), mounts `<App/>`, fires `playLaunchChime()`, sets the iOS status-bar style.
2. [src/bootGuard.ts](src/bootGuard.ts) — import-time side-effects only. Turns an import-time crash (e.g. a missing `VITE_*` making [firebase.ts](src/lib/firebase.ts) `requireEnv` throw) into a visible error + Crashlytics report. **Gotcha:** native splash is `launchAutoHide:false`, so if React never mounts, only bootGuard's 10s timer dismisses the splash.
3. [src/App.tsx](src/App.tsx) — provider tree: `QueryClientProvider` → `AppProvider` → `MatureRevealProvider` → `AppShell`. Wires the iOS screenshot listener ([privacyScreen.ts](src/lib/privacyScreen.ts)).
4. [src/views/AppShell.tsx](src/views/AppShell.tsx) — presentation shell. `renderView()` is a big `switch (view)`; renders the bottom tab bar (Home/Explore/Library/Write/Me), toast + confirm modal, [OnboardingGate](src/components/OnboardingGate.tsx)/[WelcomePopup](src/components/WelcomePopup.tsx) overlays. Owns native-splash dismissal (hides on auth navigating off `splash`, plus an 8s failsafe `splash → landing`).
5. [src/launchChime.ts](src/launchChime.ts) — plays `sky-piano-jingle.wav` over the splash via native audio (bypasses WKWebView autoplay blocking); web degrades to HTML5 Audio on first gesture.

### Navigation (NOT react-router)
Source of truth = the **`view` state string** (`View` union in [src/types/index.ts](src/types/index.ts)) + selection state (`selectedBook`/`selectedProfileUser`/`selectedChatUser`). Switching views = `setView('explore')`.
- [src/navigation/routes.ts](src/navigation/routes.ts) — pure URL↔view translation (`routeToPath`, `parsePath`) + classification predicates (`isPublicInitialView`, `isPublicView`, `needsClientApply`). URL scheme: `/explore`, `/library`, `/write/<id>`, `/publish/<id>`, `/monetize/<id>`, `/me`, `/me/mutuals|admirers|admiring`, `/u/<username>`, `/chat/<username>`, `/book/<id>` (shareable; also the `ogBook` rewrite target), `/read/<id>`, `/comments/<id>`, `/customize`, `/rewards`, `/settings[/notifications|/blocked]`, `/admin`.
- [src/state/hooks/useUrlSync.ts](src/state/hooks/useUrlSync.ts) — History-API engine. Outbound: pushes a readable path on nav change. Inbound: `applyRoute` resolves cold deep-loads (gated on auth) + `popstate`. **Native (`capacitor://`) is a no-op** — deep links there flow through `main.tsx`'s `appUrlOpen`.
- Initial paint: [useUI.ts](src/state/hooks/useUI.ts) `resolveInitialView()` paints `login`/`signup`/legal/`public-book` immediately; everything else starts on `splash` until auth resolves.

### State model — one giant context composed from domain hooks
- [src/state/AppContext.ts](src/state/AppContext.ts) — `AppContext` + `useApp()` accessor (throws outside provider). **Every view reads everything via `useApp()`.**
- [src/state/AppProvider.tsx](src/state/AppProvider.tsx) — `useAppValue()` composes ~20 domain hooks into one ~150-field object. **Hook-call order and effect dep arrays are load-bearing** (extracted verbatim from a former monolith; comments say "Phase B"). Two **late-bound bridges** (`addNotificationLB`, `setReadingActivityLB`) let early hooks call owners declared later via refs. Hosts the shared-book deep-link effects.

Hooks in [src/state/hooks/](src/state/hooks/):

| Hook | Owns |
|---|---|
| [useUI](src/state/hooks/useUI.ts) | `view`/navigation, toast + confirm primitives, selection, reader settings, 3D `moveDir` vector, write-mode, comment-scroll coords. Foundation (no cross-domain deps). |
| [useAuth](src/state/hooks/useAuth.ts) | `user`, session flags, login/signup forms, admin claim (`hasAdminClaim`/`isAdmin`) via `onIdTokenChanged`. Admin authority = Firebase `admin` custom claim only. |
| [useAuthActions](src/state/hooks/useAuthActions.ts) | `handleLogin`/`handleSignup`/`handleLogout` + `onAuthStateChanged` auto-login (registered LAST). COPPA age check (`MIN_SIGNUP_AGE`=13), username profanity, post-login routing. |
| [useBooks](src/state/hooks/useBooks.ts) | `books` list + subscription, spotlight, liked/favorite sets, like/favorite/publish handlers, share. |
| [useReading](src/state/hooks/useReading.ts) | (~1300 lines) reading activity, per-user ownership+progress (`userBookDataRef` mirror), WriteView publish temp state, publish/draft/chapter/library/progress handlers. |
| [useChat](src/state/hooks/useChat.ts) | `chatMessages` + subscription (SSE), mark-read-on-view, `handleSendMessage`. |
| [useSocial](src/state/hooks/useSocial.ts) | `registeredUsers` + `relationships` + subs, derived `MUTUALS`/`canSeeMature`, blocked set, admire/block handlers. |
| [useComments](src/state/hooks/useComments.ts) | `allComments` + subscription, `postComment`, `handleLikeComment`. |
| [useNotifications](src/state/hooks/useNotifications.ts) | `notifications` + subscription, `addNotification`, `handleNotificationClick`/`routeFromPushData` deep-link routers, per-category prefs gating. |
| [useCart](src/state/hooks/useCart.ts) | trivial `cart` array + `handleAddToCart`. |
| [usePayments](src/state/hooks/usePayments.ts) | Post-redirect handling. **No client-side crediting** — polls the user doc until the Stripe webhook lands (forged `?points_success` grants nothing). iOS IAP routes through `verifyAppleReceipt`. |
| [useRewards](src/state/hooks/useRewards.ts) | `lastClaimedPoints`, `coupons`, claim/spin handlers. **Points are server-owned** (atomic increments in the API); this hook syncs the returned balance. |
| [useAvatar](src/state/hooks/useAvatar.ts) | avatar configs + unlocked items keyed by username, derived current-user avatar, lazy-load of another user's avatar on profile open. |
| [usePersist](src/state/hooks/usePersist.ts) | (LAST extraction) debounced batch profile write (24-dep effect), page-leave flush, presence open/close. Owns no state. |
| [useUserDataLoader](src/state/hooks/useUserDataLoader.ts) | Post-login `getUserProfile` cascade hydrating every slice, then flips `userDataLoaded` true (ungates persist). |
| [useWorldPresence](src/state/hooks/useWorldPresence.ts) | RTDB `/world` presence. **Splits high-freq transforms from React render** (per-user `storeRef` read each frame; React state only on join/leave). Self-presence armed all session; subscription to others gated to `view==='home'`. |
| [useProfilePresence](src/state/hooks/useProfilePresence.ts) | Live presence for ONE profile straight from RTDB `/world` (can't go stale like the Firestore mirror). Used by profile views, not in AppProvider. |
| [useAppLifecycle](src/state/hooks/useAppLifecycle.ts) | Native-only. Flips presence on `@capacitor/app` `appStateChange`. |
| [useAdmin](src/state/hooks/useAdmin.ts) | `reports` + admin-gated subscription, item price overrides, moderation handlers (report/remove/strike/ban/dismiss/monetization review). |

### Views — [src/views/](src/views/) (all consume `useApp()`)
- **Auth / public:** [LandingView](src/views/LandingView.tsx), [LoginView](src/views/LoginView.tsx), [SignupView](src/views/SignupView.tsx), [ForgotPasswordView](src/views/ForgotPasswordView.tsx), [ResetPasswordView](src/views/ResetPasswordView.tsx), [LegalView](src/views/LegalView.tsx) (static `terms/privacy/guidelines.html` from `public/`).
- **World / home:** [HomeView](src/views/HomeView.tsx) — hosts the `<Canvas>` 3D world, joystick, emote picker, HUD, [WorldLoadingOverlay](src/components/WorldLoadingOverlay.tsx).
- **Reading / writing:** [ExploreView](src/views/ExploreView.tsx), [LibraryView](src/views/LibraryView.tsx), [ReadingView](src/views/ReadingView.tsx) (~1200-line reader), [WriteView](src/views/WriteView.tsx) (~1360-line Write Studio; `writeMode` `list`↔`editor`), [PublishingView](src/views/PublishingView.tsx), [MonetizationRequestView](src/views/MonetizationRequestView.tsx) (gated by `canMonetize`).
- **Social / profile:** [SelfProfileView](src/views/SelfProfileView.tsx), [OtherProfileView](src/views/OtherProfileView.tsx), [SocialListView](src/views/SocialListView.tsx), [CustomizationView](src/views/CustomizationView.tsx) (avatar editor — older props style), [BlockedUsersView](src/views/BlockedUsersView.tsx).
- **Chat:** [ChatListView](src/views/ChatListView.tsx), [ChatConversationView](src/views/ChatConversationView.tsx).
- **Notifications / settings:** [NotificationsView](src/views/NotificationsView.tsx), [NotificationSettingsView](src/views/NotificationSettingsView.tsx), [SettingsView](src/views/SettingsView.tsx) (+ [PayoutsSection](src/views/PayoutsSection.tsx) — Stripe Connect onboarding/earnings/withdraw).
- **Monetization:** [DailyRewardsView](src/views/DailyRewardsView.tsx) (points claim, spin wheel, MainWRLD+ membership, packs), [CommentsView](src/views/CommentsView.tsx).
- **Public / OG:** [PublicBookDetailPage](src/views/PublicBookDetailPage.tsx) (authed), [PublicBookLandingPage](src/views/PublicBookLandingPage.tsx) (**auth-OPTIONAL**; fetches preview from `ogBook` via [publicBookService](src/services/publicBookService.ts)).
- **Admin:** [AdminDashboard](src/views/AdminDashboard.tsx) (reports/moderation/price overrides/spotlight).

### Services & data layer
- [lib/apiClient.ts](src/lib/apiClient.ts) — REST. `API_BASE = ${VITE_API_URL}/api/v1`. **Only place the ID token is read** (`auth.currentUser.getIdToken()`). Retries once on 401 with a force-refreshed token. Maps HTTP status → legacy callable codes (`permission-denied`, …) via `ApiError`.
- [lib/sseClient.ts](src/lib/sseClient.ts) — SSE via `@microsoft/fetch-event-source`; custom reconnect refreshes the token on drop. Endpoints `/stream/chat`, `/stream/notifications`.
- Per-domain API modules under [src/services/api/](src/services/api/): [usersApi](src/services/api/usersApi.ts), [booksApi](src/services/api/booksApi.ts), [socialApi](src/services/api/socialApi.ts), [chatApi](src/services/api/chatApi.ts), [notificationsApi](src/services/api/notificationsApi.ts), [commentsApi](src/services/api/commentsApi.ts), [adminApi](src/services/api/adminApi.ts), [paymentsApi](src/services/api/paymentsApi.ts), [presenceApi](src/services/api/presenceApi.ts).
- **The facade hooks/views import** is [services/firebaseService.ts](src/services/firebaseService.ts) — despite the name, routes every call to the NestJS API. Preserves the legacy `subscribeTo*` contract: **chat/notifications use SSE; everything else polls** (generic `poll()` helper).
- Other services: [authService.ts](src/services/authService.ts) (real Firebase Auth; login resolves username→email via API then `signInWithEmailAndPassword`), [presenceService.ts](src/services/presenceService.ts) (REST heartbeat mirror), [worldService.ts](src/services/worldService.ts) (RTDB `/world`), [iap.ts](src/services/iap.ts) (StoreKit via `cordova-plugin-purchase`, lazy-loaded so web never loads the shim), [stripeConnect.ts](src/services/stripeConnect.ts) (Connect seller flow via `@capacitor/browser`), [pushService.ts](src/services/pushService.ts) (native FCM; registers token onto `users/{uid}.fcmTokens`), [publicBookService.ts](src/services/publicBookService.ts) (F09 no-auth preview).
- **Direct Firebase usage** is confined to [lib/firebase.ts](src/lib/firebase.ts): `auth` (uses `initializeAuth` not `getAuth` — skips the iframe that hangs `onAuthStateChanged` in WKWebView) and `rtdb` (**null when `VITE_FIREBASE_DATABASE_URL` unset ⇒ world layer self-disables**). TanStack Query: [queryClient.ts](src/lib/queryClient.ts) (`staleTime 30s`, no refetch-on-focus), [queryKeys.ts](src/lib/queryKeys.ts).

### 3D world — [src/components/three/](src/components/three/)
[HomeView](src/views/HomeView.tsx) mounts a single `<Canvas shadows>` (lights, sphere boundary `WORLD_RADIUS`=50, grid, avatars), wrapped in [ModelErrorBoundary](src/components/three/ModelErrorBoundary.tsx). HDR `Environment` is **web-only** (skipped on iOS — too memory-heavy in WKWebView).
- [threeComponents.tsx](src/components/three/threeComponents.tsx) — `AvatarModel` (GLB + layered customization + emote burst), `MovingAvatar` (peer; live RTDB transform via `getWorldEntry`, else `scatterPosition` wander), `Player` (local avatar; keyboard/wheel/pinch/orbit camera, reads `moveDir` live in `useFrame`, writes to `worldService`). Models from `public/characters_animated/` via `useGLTF`; `SkeletonUtils` clones for instancing.
- [VirtualJoystick.tsx](src/components/VirtualJoystick.tsx) — analog pad → normalized `(x,z)`. **Perf gotcha:** HomeView mutates the shared `moveDir` THREE.Vector3 **in place** (`moveDir.set(...)`), NOT `setMoveDir`, so 60fps movement never re-renders HomeView.
- [avatar.tsx](src/components/avatar.tsx) — `AVATAR_ITEMS` catalog (hair/face/outfit/skin), `getAvatarItemPath`, `AvatarLayers` (the 2D DOM avatar used outside the canvas).
- worldService write pattern: `/world/{uid}` = `{username, position, rotY, activity, currentBookId, emote, updatedAt}`; ~9Hz throttled with trailing flush; `onDisconnect().remove()` re-armed on every `.info/connected`.

### Config — [src/config/](src/config/)
- [config.ts](src/config/config.ts) — Stripe **Payment Links are LIVE everywhere** (no test toggle): `STRIPE_PAYMENT_LINKS`, `STRIPE_PREMIUM_PAYMENT_LINK`, `COUPON_PRODUCTS`.
- [constants.ts](src/config/constants.ts) — `ACCENT_COLOR` `#eb6871`, `SHARE_BASE`/`buildBookShareUrl`, age gates (`MIN_SIGNUP_AGE`=13, `MATURE_AUTO_ON_AGE`=17), word/message/chapter limits, `GENRE_LIST`, `PRICE_TIERS`/`allowedPriceTiers`/`canMonetize`/`minLikesPerPublishedChapter`, `PLATFORM_FEE_RATE` 0.3, `POINTS_PER_DOLLAR` 100, `TUTORIAL_BOOK_ID`.
- [emotes.ts](src/config/emotes.ts) — fixed emote set (wave/love/laugh/fire/like). [profanity.ts](src/config/profanity.ts) — `containsProfanity` via `obscenity` (client gate for usernames/comments/chat).

### Env vars (`VITE_*`, from [.env.example](.env.example))
`VITE_API_URL` (NestJS base **without** `/api/v1`; required — apiClient throws otherwise), `VITE_FIREBASE_*` (apiKey/appId/authDomain/projectId/storageBucket/messagingSenderId/measurementId — required by `requireEnv`), `VITE_FIREBASE_DATABASE_URL` (**optional**; unset ⇒ no world layer), `VITE_USE_FIREBASE_EMULATORS` (dev/web only ⇒ RTDB at `127.0.0.1:9000`), optional App Check tokens, `HOST` (LAN IP for `cap run -l`). `vite.config.ts` aliases `@`→`src`. **Gotcha:** `vite.config.ts` `server.port` is 3000 but the `dev` script forces `--port 5173`; the example `VITE_API_URL` is `http://localhost:3000` and the local API also defaults to 3000 — run them on different ports.

### Capacitor / iOS
- [capacitor.config.ts](capacitor.config.ts) — `appId: com.mainwrld`, `webDir: dist`, iOS `contentInset:never` + `scrollEnabled:false` (CSS handles safe-area/`100dvh`), `SplashScreen.launchAutoHide:false`.
- [ios/](ios/) — Xcode project, SPM-managed plugins (no Podfile) in `ios/App/CapApp-SPM/Package.swift` (native-audio, crashlytics, messaging, browser, keyboard, preferences, share, splash-screen, status-bar, + Cordova `CordovaPluginPurchase`). `AppDelegate.swift` handles screenshot notification + app-switcher blur. `App.entitlements` Associated Domains `applinks:mainwrld.com`; `public/.well-known/apple-app-site-association` enables Universal Links → `appUrlOpen`.
- Native-only source ([iap.ts](src/services/iap.ts), [pushService.ts](src/services/pushService.ts), [useAppLifecycle](src/state/hooks/useAppLifecycle.ts), [privacyScreen.ts](src/lib/privacyScreen.ts), [launchChime.ts](src/launchChime.ts)) is guarded by `Capacitor.isNativePlatform()` and no-ops on web.
