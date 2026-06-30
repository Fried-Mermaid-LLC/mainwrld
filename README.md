# mainwrld

`mainwrld` is a social book reading/writing iOS app: users write and publish serialized books, read others' work, and inhabit a shared 3D avatar "world" (react-three-fiber + virtual joystick) where their presence and "Currently Reading" status are live. Authors monetize completed books via **Stripe Connect** (70/30 split, web) and **Apple In-App Purchase** (iOS), with a points economy, daily rewards, a yearly "MainWRLD+" membership, social follows/DMs, comments, notifications, and full UGC moderation.

> **Audience note:** this README is optimized for a future Claude Code session orienting in the repo. It is a navigable map, not marketing. Paths are clickable relative links. [CLAUDE.md](CLAUDE.md) is a short pointer to this file, so new Claude Code sessions land here automatically. The two deep per-workspace guides are [apps/app/README.md](apps/app/README.md) and [apps/api/README.md](apps/api/README.md).

---

## Repository layout

```
mainwrld/                         pnpm workspaces + Turborepo, Node 24, pnpm 11.8
├── apps/
│   ├── app/                      Client: React 19 + Vite + Capacitor (iOS). 3D world, Firebase Auth/RTDB,
│   │                             TanStack Query, SSE, IAP, Tailwind v4. Builds to apps/app/dist (Firebase Hosting).
│   └── api/                      Backend: NestJS 11 on Cloud Run. Owns auth/moderation/points/monetization.
│                                 Firebase Admin, Stripe Connect, Apple App Store lib, React Email, Pino, Swagger.
├── functions/                    Firebase Cloud Functions (Node 24, firebase-functions v7). Privileged triggers,
│                                 scheduled jobs, callables, ogBook HTTP (OG cards). Admin-SDK trust boundary.
├── packages/
│   └── types/                    @mainwrld/types — shared interfaces (index.ts) + pricing rules (pricing.ts).
├── firebase.json                 Hosting, Firestore, RTDB, Storage, Functions, emulators wiring.
├── firestore.rules / .indexes.json   Firestore security + composite indexes.
├── database.rules.json           RTDB security (/status, /connections, /world).
├── storage.rules                 Storage security (book-covers/**).
├── turbo.json                    Task graph (build/dev/typecheck/lint).
├── pnpm-workspace.yaml           Workspaces: apps/*, packages/*, functions.
├── .firebaserc                   Default project: mainwrld-f7acf.
└── .github/workflows/            CI: api-cloudrun.yml, firebase-hosting.yml, ios-testflight.yml.
```

Firebase project: **`mainwrld-f7acf`**. Storage bucket: `mainwrld-f7acf.firebasestorage.app`. Functions region: `us-central1`.

---

## Tech stack

- **apps/app** — React 19, Vite, TypeScript, Tailwind v4 (CSS-first, no config file), Capacitor 8 (iOS, `com.mainwrld`), react-three-fiber / drei / three, Firebase web SDK (Auth + RTDB only), TanStack Query, `@microsoft/fetch-event-source` (SSE), `cordova-plugin-purchase` (StoreKit IAP), `@capacitor-firebase/messaging` (FCM), `@capacitor-community/native-audio`, `obscenity`.
- **apps/api** — NestJS 11, Node 24, Express adapter, Firebase Admin, Stripe (Connect, `stripe@22.2.3`), `@apple/app-store-server-library`, React Email (`@react-email/components`) + Resend, `nestjs-pino`, Swagger, `zod` (config), `class-validator` (DTOs), `obscenity`, OpenAI Moderation. Deployed to **Cloud Run** via [Dockerfile](apps/api/Dockerfile).
- **functions** — `firebase-admin@13`, `firebase-functions@7`, `stripe@22`, `obscenity`, `@apple/app-store-server-library` (present; Apple verification now lives in the API). ESM, `tsc` → `lib/`.
- **packages/types** — pure TypeScript, no runtime deps. Compiles to `dist/` (must build first; see Conventions).
- **root** — `turbo@2.9.18`, `pnpm@11.8.0`, `engines.node: 24`.

---

## Architecture at a glance

The client talks to **one REST/SSE backend** (the NestJS API on Cloud Run) for nearly everything. It touches Firebase **directly** only for **Auth** (login/session/token) and **RTDB** (the realtime 3D `/world` + `/status` presence). The API uses Firebase Admin as its datastore + auth verifier. Cloud Functions are a separate privileged layer (triggers/cron/OG). Payments fan out to Stripe (web) and Apple (iOS); fulfilment is server-authoritative (webhook / receipt verify), never client-trusted.

```
                       Firebase ID token (Bearer)
  ┌─────────────┐   REST /api/v1/* + SSE /stream/*   ┌──────────────────────┐
  │  apps/app   │ ─────────────────────────────────► │  apps/api (NestJS)   │
  │ React/Vite  │ ◄───────────────────────────────── │   on Cloud Run       │
  │  Capacitor  │      JSON / Server-Sent Events      │  Firebase Admin SDK  │
  └─────────────┘                                     └──────────┬───────────┘
        │  direct (web SDK)                                       │ Admin SDK
        │  • Firebase Auth (login/token)                          ▼
        │  • RTDB /world (3D avatars), /status (presence)   ┌──────────────────┐
        ▼                                                   │  Firebase        │
  ┌──────────────┐                                          │  Auth / Firestore│
  │  Firebase    │ ◄──── triggers / onSnapshot ──────────── │  RTDB / Storage  │
  │  RTDB,Auth   │                                          └────────┬─────────┘
  └──────────────┘                                                   │ triggers,
                                                                     │ schedules,
                                              ┌──────────────────────▼──────────┐
   Stripe Connect (web)  ◄──── webhook ──────►│  functions (Cloud Functions)    │
   Apple IAP (iOS) ◄── verify-apple (API) ──► │  ogBook (HTTP), stripeConnect,  │
                                              │  moderation, ban, presence, cron│
                                              └─────────────────────────────────┘
```

**Two client transports to the API:** [apiClient.ts](apps/app/src/lib/apiClient.ts) (REST, attaches `Authorization: Bearer <ID token>`) and [sseClient.ts](apps/app/src/lib/sseClient.ts) (SSE for chat + notifications, since a plain `EventSource` can't carry a Bearer header). Lists that aren't SSE are **polled**.

---

## apps/app — Client (React 19 + Vite + Capacitor iOS)

Single-page React 19 app (Vite), wrapped by Capacitor 8 into the iOS app (`com.mainwrld`); built to
`apps/app/dist` and served by Firebase Hosting. 3D avatar world (react-three-fiber), virtual joystick,
in-app purchase, push, SSE. **No react-router** — navigation is a `view` string in React state synced
to the URL. Talks to the NestJS API for almost everything; touches Firebase directly only for Auth + RTDB.

**→ Full client docs: [apps/app/README.md](apps/app/README.md)** — boot sequence, the URL-synced view
navigation, the `AppContext` + ~20-hook state model, views, the services/data layer, the 3D world,
Capacitor/iOS (IAP/push), config, and `VITE_*` env vars.

---

## apps/api — NestJS backend (Cloud Run)

REST/SSE API backing `apps/app`, fronted by Firebase Admin (NestJS 11, Node 24, deployed to Cloud Run
from [apps/api/Dockerfile](apps/api/Dockerfile)). Routes under `/api/v1/...`; health probes at the root.
The server owns auth, moderation, the points economy, and monetization — every legacy client-side write
and Firebase callable was ported here.

**→ Full backend docs: [apps/api/README.md](apps/api/README.md)** — bootstrap, infra (Firebase-token
`AuthGuard`, roles, config), the module-by-module endpoint table, Stripe/IAP/webhook/SSE/email/profanity,
the testing setup, and env vars.

---

## functions — Firebase Cloud Functions

The **privileged trust boundary**: triggers/callables that run with Admin SDK privileges and bypass `firestore.rules`. Deliberately split from the API — Apple receipt verify, the Stripe webhook, welcome/reset emails, push fan-out, and renewal-reminder *logic* now live in the API; `functions/` keeps only thin schedulers that POST the API, OG rendering, Connect onboarding callables, and moderation/ban/presence/chat triggers. **Cannot import from `apps/app/src/`, `apps/api/`, or `@mainwrld/types`** — pricing tiers, profanity, publish helpers, and the moderation category list are **duplicated here on purpose**.

Registration manifest: [functions/src/index.ts](functions/src/index.ts) (`initializeApp()` then re-exports). Node 24, ESM, region `us-central1`, `tsc` → `lib/`.

| Export(s) | File | Trigger | Purpose |
|---|---|---|---|
| `deleteAccount` | [deleteAccount.ts](functions/src/deleteAccount.ts) | callable | App Store 5.1.1 scrub — batched delete of the user's own outputs + Auth user |
| `setUsernameClaim` | [userClaims.ts](functions/src/userClaims.ts) | onCreate `users/{uid}` | Mirror `username` into the Auth token claim (rules authorize username-keyed records off it) |
| `ensureUsernameClaim` | [userClaims.ts](functions/src/userClaims.ts) | callable | Backfill the claim for pre-trigger accounts (client then `getIdToken(true)`) |
| `setAdmin` | [userClaims.ts](functions/src/userClaims.ts) | callable (admin) | Grant/revoke `admin` claim, no self-target. **First admin bootstrapped via `functions:shell`** |
| `banUser`/`unbanUser` | [banUser.ts](functions/src/banUser.ts) | callable (admin) | `performBan`: `banned` claim + revoke tokens + disable Auth + resolve open reports (reversible; retains content) |
| `strikeWatch` | [banUser.ts](functions/src/banUser.ts) | onUpdate `users/{uid}` | Auto-ban backstop at `STRIKE_LIMIT=3` |
| `moderate{Comment,Book,Chapter,ChatMessage}*`, `moderateUsername` | [moderate.ts](functions/src/moderate.ts) | FS triggers + 1 callable | **Post-moderation** backstop: profanity ([profanity.ts](functions/src/profanity.ts)) + OpenAI. Comment/chat → delete + audit report; book/chapter → revert to draft. `moderateUsername` is unauthenticated (pre-signup) |
| `getChapterContent` | [chapters.ts](functions/src/chapters.ts) | callable | Legacy paywall gateway (mirror of the API's `getContent`) — keys access off **`purchasedBookIds`** only |
| **`ogBook`** | [publicBook.ts](functions/src/publicBook.ts) | **HTTP** (Hosting rewrite `/book/**`) | Allow-listed `PublicBookPreview`; OG HTML for crawlers or JSON (`?format=json`); generic no-leak 404 for drafts. Edge-cached 300/600s |
| `createStripeAccountLink`, `syncStripeAccountStatus`, `createStripeDashboardLink`, `getSellerBalance`, `submitMonetizationRequest`, `reviewMonetization`, `createBookCheckoutSession` | [stripeConnect.ts](functions/src/stripeConnect.ts) | callables | Connect seller flow + monetization request/review + 70/30 checkout (webhook fulfilment is in the API) |
| `cancelMembership` | [cancelMembership.ts](functions/src/cancelMembership.ts) | callable | Stripe `cancel_at_period_end`; Apple subs rejected |
| `mirrorPresence` | [presence.ts](functions/src/presence.ts) | RTDB onValueWritten `/status/{uid}` | Authoritative writer of presence mirror onto `users/{uid}`. **Region must match the RTDB instance** |
| `rotateSpotlight`/`rotateSpotlightNow` | [spotlight.ts](functions/src/spotlight.ts) | scheduled (Mon 09:00 ET) / callable | **Sole writer** of `appConfig/spotlight`; score = chapter likes + `favoritesTotal` |
| `enforceChatRateLimit` | [chatRateLimit.ts](functions/src/chatRateLimit.ts) | onCreate `chatMessages/{id}` | Backstop 25 msg/conversation/24h; needs index `chatMessages(from,to,timestamp)` |
| `pruneExpiredMessages` | [pruneMessages.ts](functions/src/pruneMessages.ts) | scheduled (24h) | Delete non-premium DMs >1yr; needs index `chatMessages(senderIsPremium,timestamp)` |
| `sendRenewalReminders` | [renewalReminders.ts](functions/src/renewalReminders.ts) | scheduled (24h) | Thin scheduler → POSTs API `/internal/cron/renewal-reminders` with `x-cron-secret` |
| `blockUnderageSignup` | [blockUnderageSignup.ts](functions/src/blockUnderageSignup.ts) | onCreate `users/{uid}` | COPPA hard block: tears down account if age < 13 or no birthDate |

**Gotcha:** the old `sendPushOnNotification` onCreate trigger was **removed** — push fan-out now runs inline in the API to stop double-pushing on iOS.

**Secrets** (Secret Manager): `STRIPE_SECRET_KEY`, `STRIPE_TEST_SECRET_KEY`, `OPENAI_API_KEY`, `INTERNAL_CRON_SECRET`. **`.env` param** ([functions/.env.example](functions/.env.example)): only `RENEWAL_API_ORIGIN` (non-secret API origin, no `/api/v1`; empty default prevents non-interactive deploy hard-fail).

**Migration scripts** — [functions/scripts/](functions/scripts/) (Admin creds, honor `DRY_RUN=1`): `backfillMatureFlag.mjs` (`isExplicit`→`isMature`), `restoreMonetization.mjs`, `setChapterLikes.mjs` (satisfies the 100-likes gate), `setPublishedDate.mjs` (backdates to satisfy the 21-day gate).

---

## packages/types — `@mainwrld/types`

Shared interfaces ([index.ts](packages/types/src/index.ts), `export * from './pricing'`) + pricing rules ([pricing.ts](packages/types/src/pricing.ts)). Pure TS, compiles to `dist/` — **must build before** the API and app typecheck (see Conventions).

### Pricing — [pricing.ts](packages/types/src/pricing.ts)
- `PRICE_TIERS = [9.99, 14.99, 19.99, 24.99, 29.99]`
- `PLATFORM_FEE_RATE = 0.3` (30% platform / 70% seller)
- `allowedPriceTiers(chaptersCount)` — tiers unlocked by published-chapter count: ≥5→1, ≥8→2, ≥12→3, ≥20→4, ≥25→all 5. (Re-duplicated in `functions/` and `apps/app`.)

### Domain types — [index.ts](packages/types/src/index.ts)
- **`User`** — profile + presence (`isOnline/activity/lastOnline/currentBookId`), social, `notificationPrefs`, `showMatureContent` (tri-state), `fcmTokens`, `readerSettings`. **Server-only mirror fields** (client-unwritable per rules): moderation (`isBanned/strikes/isAdmin/…`), Stripe Connect (`stripeAccountId/payoutsEnabled/…`), premium lifecycle (`isPremium/premiumProvider/stripeSubscriptionId/…`), points economy (`points/dailyEarnedPoints/…`), and `purchasedBookIds` (paywall entitlement). `chatDailyCounts` keyed by `[from,to].sort().join('__')`.
- **`Book`** (large; monetization lifecycle `monetizationStatus/requested Price/permanentlyDemonetized/sellerUid/…`, `chapterMeta`, `likes:number[]`, `isMature` with legacy `isExplicit` fallback), **`ChapterMeta`**, **`ChapterDoc`**, **`BookProgress`**, **`PublicBookPreview`**.
- **`ChatMessage`**, **`Relationship`**, **`Comment`**, **`Coupon`**, **`Report`**/`ReportReason`, **`UserRecord`**, **`ReaderSettings`**, **`NotificationPrefs`**/`NotificationCategory`/`NotificationItem`, **`AvatarGender`/`AvatarCategory`/`AvatarConfig`/`AvatarItem`**.
- **Shared publish helpers** (single source of truth, API + app): `isChapterPublished(meta, order, chaptersCount)`, `publishedCount`, `firstPublishedOrder` — per-chapter `published` flag with legacy `order < chaptersCount` prefix fallback.

---

## Data model & security

**Access model:** Firestore default-deny ([firestore.rules](firestore.rules)). Auth via custom claims `admin`, `banned`, and **`username`** (because `chatMessages.from/to`, `relationships.admirer/target`, `notifications.recipient` are keyed by username, not uid). Helpers: `isSignedIn()`, `isUser(uid)`, `isAdmin()`, `isBanned()` (blocks all writes). **Mid-signup gotcha:** a user without the `username` claim is rejected on their own username-keyed reads/writes — client retries after `getIdToken(true)` / `ensureUsernameClaim`.

### Firestore collections (inferred from rules + types)

| Collection | Read | Write | Notes |
|---|---|---|---|
| **users/{uid}** | any signed-in | owner create/update (admin any); delete admin-only | `affectedKeys().hasAny([...])` denylist blocks **all** server-only mirror fields (Stripe, subscription, privilege, points, `purchasedBookIds`). `ownedBookIds` stays client-writable (library only) |
| **usernames/{username}** | **public** (resolve username→email before sign-in) | owner create/delete; immutable update | `{uid, email}`, keyed by lowercase username |
| **books/{bookId}** | published → any signed-in; drafts → author/admin | author create; update author/admin with monetization/take-down guards; delete author/admin | author may un-monetize; server-only lifecycle + permanence flags denied |
| **books/{bookId}/chapters/{chapterId}** | author/admin **only** | author/admin | bodies live here (out of the book doc); everyone else → `getChapterContent` |
| **comments/{id}** | any signed-in | author create; author/admin update+delete | `authorUid`, `authorUsername` |
| **chatMessages/{id}** | participants or admin | sender create (≠self, 1–500 chars); recipient may set `read`; participants/admin delete | username-keyed |
| **relationships/{id}** | any signed-in | admirer create; no update; admirer/admin delete | `admirer/target` usernames |
| **notifications/{id}** | recipient or admin | any signed-in create; recipient may set `read`; recipient/admin delete | `recipient` username |
| **reports/{id}** | **admin only** | reporter create (`reportedBy==token.username`); admin update/delete | auto-mod writes `reportedBy:'system'` via Admin SDK |
| **iapTransactions/{transactionId}** | owner/admin | **no client writes** | Apple IAP audit (txId = replay protection) |
| **bookPurchases/{id}** | buyer/seller/admin | **no client writes** | cash + points sale ledger; drives Purchase History + permanent ownership |
| **appConfig/{docId}** | **public** | **no client writes** | `appConfig/spotlight` written only by `rotateSpotlight` |

Composite indexes ([firestore.indexes.json](firestore.indexes.json)): `relationships(admirer,target)`, `chatMessages(from,to)`, `chatMessages(from,to,timestamp)` (rate limit), `chatMessages(senderIsPremium,timestamp)` (prune).

### RTDB — [database.rules.json](database.rules.json)
- **`/status/{uid}`** — read any auth'd, write owner. Presence source of truth (client + `onDisconnect`); mirrored to Firestore by `mirrorPresence`. Shape `{state, activity, currentBookId}`.
- **`/connections/{uid}`** — presence bookkeeping.
- **`/world`** — read any auth'd; `/world/{uid}` owner-write, **strictly validated** (`username`≤40, `position{x,y,z}` numbers within ±5000/±50, `updatedAt`; optional `rotY/activity/currentBookId/emote`; `$other:false` rejects unknown keys). This is the 3D avatar world state.

### Storage — [storage.rules](storage.rules)
- **`book-covers/{uid}/{bookId}/{fileName}`** — **world-readable** (public listings); write only by `request.auth.uid == uid`, `< 1 MB`, `image/*`. Path-embedded ownership avoids a cross-service Firestore read. Everything else denied.

---

## Key end-to-end flows

### 1. Auth & onboarding
Signup collects email/password **+ birthDate** ([authService](apps/app/src/services/authService.ts) → `createUserWithEmailAndPassword`, then [firebaseService.signUp](apps/app/src/services/firebaseService.ts) writes `users/{uid}` + `getIdToken(true)`). `blockUnderageSignup` (COPPA) tears down accounts under 13. `setUsernameClaim` mirrors `username` into the token (`ensureUsernameClaim` backfills). Every API request hits the global [AuthGuard](apps/api/src/infra/auth/auth.guard.ts) (`verifyIdToken(token, /*checkRevoked*/ true)`).

### 2. Write → publish → read
`POST/PATCH /books` ([BooksService](apps/api/src/modules/books/books.service.ts)) — `authorUid` server-stamped, metadata pre-moderated, `isDraft:false` = published. **Completion lock:** once `isCompleted:true`, edits are rejected except reopen, which triggers a **terminal un-monetize**. Chapters via `PUT/DELETE /books/:bookId/chapters/:id` ([ChaptersService](apps/api/src/modules/chapters/chapters.service.ts), `BOOK_PROTECTED` denylist). Reading: `GET .../content` (`getContent` paywall) — takedown → visibility → free/unmonetized OR first-published preview OR ownership via **`purchasedBookIds`** (server-granted, never client-writable `ownedBookIds`) else 403.

### 3. Monetization
Onboarding `POST /payments/stripe/account-link` (Express, `transfers`). Request `POST /payments/monetization/requests` ([MonetizationService.submit](apps/api/src/modules/payments/monetization.service.ts)) gates: **`isCompleted:true`** + `canMonetize` + not `takenDown` + ≥5 published chapters (capped by real Firestore count) + ≥100 likes/chapter + ≥21 days + ≤2 attempts + allowed tier + `payoutsEnabled`. Admin `POST /payments/monetization/:bookId/review` (reviewer ≠ author/seller). Reader cash: `POST /payments/stripe/book-checkout` (70/30 destination charge) → fulfilment in the **webhook** ([handleCheckout](apps/api/src/modules/webhooks/stripe-webhook.service.ts), idempotent via `stripeEvents/{id}`, grants `purchasedBookIds`, writes `bookPurchases`). iOS: [iap.ts](apps/app/src/services/iap.ts) → `POST /iap/verify-apple` ([IapService](apps/api/src/modules/iap/iap.service.ts), idempotent via `iapTransactions/{id}`). Membership cancel via `POST /membership/cancel` (Stripe rail; Apple subs in App Store).

### 4. Social / chat / notifications / presence
Follows `POST/DELETE /relationships` ([SocialService](apps/api/src/modules/social/social.service.ts)). Chat `POST /chat/messages` ([ChatService](apps/api/src/modules/chat/chat.service.ts), ≤25/conversation/24h, OpenAI pre-mod, `senderIsPremium`) + backstop `enforceChatRateLimit` + retention `pruneExpiredMessages`. Notifications + inline push fan-out ([NotificationsService](apps/api/src/modules/notifications/notifications.service.ts)). Real-time via SSE `/stream/chat` + `/stream/notifications`. Presence: client writes RTDB `/status/{uid}` + `onDisconnect`; `mirrorPresence` mirrors to `users/{uid}` (the API also has `PUT /presence/heartbeat`). Spotlight: sole writer `rotateSpotlight`. Daily rewards: `POST /users/me/claim-daily` + `me/spin` (capped 25/day by RewardsService).

### 5. Moderation / ban / age
Two layers (kept in sync between API and functions): curated profanity (`obscenity`) + OpenAI Moderation. `ALWAYS_BLOCKED` categories rejected even for Mature works. **Pre-moderation** runs inline in API services; **post-moderation** backstops live in [moderate.ts](functions/src/moderate.ts). Reports via `/reports`. Ban/strikes owned by [banUser.ts](functions/src/banUser.ts) (`performBan` revokes tokens; AuthGuard `checkRevoked` closes the window; auto-ban at 3 strikes). Ban retains content; [deleteAccount.ts](functions/src/deleteAccount.ts) scrubs. Age: COPPA at signup; `isMature`/`isExplicit` drive moderation strictness.

---

## Local development

### Prerequisites
Node **24**, pnpm **11.8** (`packageManager` pins `pnpm@11.8.0`), Firebase CLI (`npx -y firebase-tools@latest`), Xcode (for iOS). Stripe/OpenAI/Resend/Apple keys for the full API surface (most are optional in dev — the API boots without them).

### Install
```bash
pnpm install        # installs all workspaces
```

### Dev commands
```bash
pnpm dev            # turbo run dev — all persistent dev tasks at once

# Per workspace:
pnpm -C apps/app dev          # vite --port 5173 --strictPort
pnpm -C apps/app dev:ios      # cap run ios -l --host $HOST --port 5173  (needs HOST in .env.local)
pnpm -C apps/api dev          # nest start --watch  (PORT, default 3000; Swagger at /api/docs non-prod)
pnpm -C functions serve       # build + firebase emulators:start --only functions
pnpm -C functions shell       # functions REPL (used to bootstrap the first admin via setAdmin)
```

### Firebase emulators ([firebase.json](firebase.json))
auth **9099**, firestore **8080**, RTDB **9000**, functions **5001**, storage **9199**, UI **4000**, `singleProjectMode`. The client opts into the **RTDB** emulator only, via `VITE_USE_FIREBASE_EMULATORS=true` (see [firebase.ts](apps/app/src/lib/firebase.ts)).

### Env files (all gitignored except `.example`s)
- Client [apps/app/.env.local](apps/app/.env.example) — `VITE_FIREBASE_*`, `VITE_FIREBASE_DATABASE_URL` (empty ⇒ no world), `VITE_API_URL` (no `/api/v1`), `HOST`.
- API [apps/api/.env](apps/api/.env.example) — see API env table. `FIREBASE_SERVICE_ACCOUNT_PATH` **local only** (unset on Cloud Run ⇒ ADC).
- Functions [functions/.env](functions/.env.example) — only `RENEWAL_API_ORIGIN`; secrets via `firebase functions:secrets:set`.
- **[local/](local)** (gitignored) — iOS signing material (`AppleDistribution.p12`, `MainWRLD.mobileprovision`, `AuthKey_*.p8`) + a React-Email reference snapshot.

### Seeding
API: [seed-public-domain-books.cjs](apps/api/scripts/seed-public-domain-books.cjs), [seed-family-books.cjs](apps/api/scripts/seed-family-books.cjs) (run from `apps/api`). Functions migrations in [functions/scripts/](functions/scripts/) (honor `DRY_RUN=1`).

---

## Build & deploy / CI

### Turbo graph — [turbo.json](turbo.json)
- `build` → `dependsOn: ["^build"]` (so `@mainwrld/types` compiles first), outputs `lib/**`,`dist/**`.
- `build:web` → `^build`, outputs `dist/**`, env `VITE_*`, inputs include `.env*` (the Vite app build — only `apps/app` implements it).
- `build:ios` → `dependsOn: ["build:web"]`, `cache:false`.
- `typecheck` → `^build` (needs the compiled types `dist`). `dev` → `^build`, `persistent`, `cache:false`. `lint` → no deps.

### GitHub workflows
- **[api-cloudrun.yml](.github/workflows/api-cloudrun.yml)** — push to `main` touching `apps/api/**` or `packages/types/**` (+ dispatch). `verify` (install, build types, api typecheck+test) then `deploy`: `docker build -f apps/api/Dockerfile .` (**context = repo root**) → Artifact Registry `us-central1/mainwrld/mainwrld-api:<sha>` → `gcloud run deploy` (`--allow-unauthenticated --port 8080 --min-instances 1 --timeout 3600`), env + `--set-secrets` from Secret Manager. [Dockerfile](apps/api/Dockerfile) is multi-stage (deps → build types+api → `pnpm deploy --prod --legacy /app` → slim `node dist/main.js`).
- **[firebase-hosting.yml](.github/workflows/firebase-hosting.yml)** — push to `main` touching `apps/app/**`. Builds Vite (injects all `VITE_*` from secrets), deploys hosting, **then** `--only firestore:rules,database,storage,functions` in the same run (rules/functions can't drift behind the front-end). **Gotchas:** Node pinned **exactly 24.16.0**, firebase-tools pinned **15.22.0** (newer break CI service-account OAuth); `RENEWAL_API_ORIGIN` written into `functions/.env` at deploy time.
- **[ios-testflight.yml](.github/workflows/ios-testflight.yml)** — push to `main` touching `apps/app/**`, on `macos-26`. Build web → `cap sync ios` → import fixed dist cert + provisioning profile from secrets → `agvtool` build number = `date +%Y%m%d%H%M` → `xcodebuild archive`/`-exportArchive` (manual signing) → `altool --upload-app` (TestFlight) → synchronous Crashlytics dSYM upload. Bundle `com.mainwrld`, team `2C7AJQ5G4C`, scheme `App`.

[firebase.json](firebase.json) Functions predeploy runs `pnpm -C functions run lint || true` then `build`. [.dockerignore](.dockerignore) lives at repo root (Docker build context **is** the repo root) and keeps `.env*`/`service-account.json`/`apps/app/ios` out of the image — **never bake the SA key into the image**.

---

## Conventions & gotchas

- **Build order is load-bearing:** `@mainwrld/types` **must compile first**. `^build` in turbo enforces it; `typecheck` depends on `^build` because the API/app import the types' compiled `dist`. A stale `*.tsbuildinfo` makes `nest build` silently skip files (`.dockerignore` strips them).
- **Spec test convention:** API tests are `*.spec.ts` **next to** the file under test (`testRegex: .*\.spec\.ts$`). Use the in-memory [fake-firestore.ts](apps/api/src/testing/fake-firestore.ts) double, not a real emulator, in unit tests.
- **[CLAUDE.md](CLAUDE.md)** is a short pointer to this README (auto-loaded into every session); the deep per-workspace docs are [apps/app/README.md](apps/app/README.md) and [apps/api/README.md](apps/api/README.md).
- **Profanity/obscenity is duplicated across all three packages** ([app/profanity.ts](apps/app/src/config/profanity.ts), [api/profanity.service.ts](apps/api/src/shared/profanity/profanity.service.ts), [functions/profanity.ts](functions/src/profanity.ts)) because `functions/` can't import `@mainwrld/types` or app/api source. Same for `PRICE_TIERS`/`allowedPriceTiers` and the publish helpers — **keep them in sync.**
- **SKU → reward maps are duplicated** across [stripe-webhook.service.ts](apps/api/src/modules/webhooks/stripe-webhook.service.ts), [iap.service.ts](apps/api/src/modules/iap/iap.service.ts), and [app/iap.ts](apps/app/src/services/iap.ts) — candidate to consolidate into `@mainwrld/types`.
- **`ValidationPipe` is NOT `forbidNonWhitelisted`** — unknown fields are dropped, not rejected; server-managed fields are protected by **per-domain denylists** (`BOOK_PROTECTED`, the users-doc `hasAny` rule), not the pipe.
- **Guard order** in [app.module.ts](apps/api/src/app.module.ts) must be `AuthGuard` → `RolesGuard`.
- **Monetization keys off completion** (`isCompleted`), not mere publication — a published book is still editable.
- **Paid access keys off `purchasedBookIds`** (Admin-SDK-written) only — **never** the client-writable `ownedBookIds` (library membership). Pre-monetization library holders are grandfathered by `MonetizationEffectsService.onApproved`.
- **Stripe `mode`** (`live`/`test`) is client-supplied and threads through nearly every payments call; an account mismatch surfaces as `isAccountGone` (re-onboard), never a raw 500.
- **`functions/` ↔ API split:** email/Resend, Apple-receipt verify, Stripe webhook, and push fan-out moved **into the API**; the old `sendPushOnNotification` trigger was removed. Functions keep only thin schedulers (which POST `/internal/cron/*` with `x-cron-secret`), `ogBook`, Connect callables, and moderation/ban/presence triggers.
- **The 3D world self-disables** when `VITE_FIREBASE_DATABASE_URL` is unset (`rtdb=null`). Movement transforms mutate a shared `THREE.Vector3`/`storeRef` instead of React state — don't "fix" this into `setState` or you'll re-render at 60fps.

---

## Where to look for X

| Task | Start here |
|---|---|
| Add a client view / route | [routes.ts](apps/app/src/navigation/routes.ts), [AppShell.tsx](apps/app/src/views/AppShell.tsx) `renderView()`, [types/index.ts](apps/app/src/types/index.ts) `View` union |
| Add client state/handlers | the right hook in [src/state/hooks/](apps/app/src/state/hooks/), then wire into [AppProvider.tsx](apps/app/src/state/AppProvider.tsx) |
| Call the backend from the client | [services/firebaseService.ts](apps/app/src/services/firebaseService.ts) facade + a [services/api/](apps/app/src/services/api/) module + [apiClient.ts](apps/app/src/lib/apiClient.ts) |
| Add an API endpoint | the module under [apps/api/src/modules/](apps/api/src/modules/) (controller + service + DTO + `*.spec.ts`), register in [app.module.ts](apps/api/src/app.module.ts) |
| Change auth / roles | [auth.guard.ts](apps/api/src/infra/auth/auth.guard.ts), [roles.guard.ts](apps/api/src/infra/auth/roles.guard.ts), [auth.decorators.ts](apps/api/src/infra/auth/auth.decorators.ts) |
| Stripe / payments / payouts | [payments.service.ts](apps/api/src/modules/payments/payments.service.ts), [stripe.service.ts](apps/api/src/modules/payments/stripe.service.ts), [stripe-webhook.service.ts](apps/api/src/modules/webhooks/stripe-webhook.service.ts) |
| Monetization gating | [monetization.service.ts](apps/api/src/modules/payments/monetization.service.ts), `canMonetize`/`allowedPriceTiers` in [pricing.ts](packages/types/src/pricing.ts) + [constants.ts](apps/app/src/config/constants.ts) |
| Apple IAP | [app/iap.ts](apps/app/src/services/iap.ts), [iap.service.ts](apps/api/src/modules/iap/iap.service.ts) |
| Paywall / chapter access | [chapters.service.ts](apps/api/src/modules/chapters/chapters.service.ts) `getContent`, [functions/chapters.ts](functions/src/chapters.ts) |
| Points / rewards | [rewards.service.ts](apps/api/src/modules/rewards/rewards.service.ts) |
| Email templates | [email.templates.tsx](apps/api/src/shared/email/email.templates.tsx), [email.service.ts](apps/api/src/shared/email/email.service.ts) |
| SSE / realtime | [stream.service.ts](apps/api/src/modules/stream/stream.service.ts), client [sseClient.ts](apps/app/src/lib/sseClient.ts) |
| Cron / scheduled jobs | [scheduler-jobs.service.ts](apps/api/src/modules/scheduler/scheduler-jobs.service.ts) + the schedulers in [functions/src/](functions/src/) |
| Moderation / profanity | [moderation.service.ts](apps/api/src/modules/moderation/moderation.service.ts), [profanity.service.ts](apps/api/src/shared/profanity/profanity.service.ts), [functions/moderate.ts](functions/src/moderate.ts) |
| Ban / strikes / delete account | [functions/banUser.ts](functions/src/banUser.ts), [functions/deleteAccount.ts](functions/src/deleteAccount.ts), [admin.service.ts](apps/api/src/modules/admin/admin.service.ts) |
| Public OG / share links | [functions/publicBook.ts](functions/src/publicBook.ts) (`ogBook`), [public.service.ts](apps/api/src/modules/public/public.service.ts), `/book/**` rewrite in [firebase.json](firebase.json) |
| 3D world / avatars | [components/three/](apps/app/src/components/three/), [worldService.ts](apps/app/src/services/worldService.ts), [useWorldPresence](apps/app/src/state/hooks/useWorldPresence.ts) |
| Presence | RTDB [database.rules.json](database.rules.json), [functions/presence.ts](functions/src/presence.ts), [presence.service.ts](apps/api/src/modules/presence/presence.service.ts) |
| Security rules | [firestore.rules](firestore.rules), [database.rules.json](database.rules.json), [storage.rules](storage.rules), [firestore.indexes.json](firestore.indexes.json) |
| Shared types / pricing | [packages/types/src/index.ts](packages/types/src/index.ts), [pricing.ts](packages/types/src/pricing.ts) |
| Firebase wiring / emulators | [firebase.json](firebase.json), [.firebaserc](.firebaserc) |
| CI / deploy | [.github/workflows/](.github/workflows/), [apps/api/Dockerfile](apps/api/Dockerfile), [turbo.json](turbo.json) |
| iOS native | [capacitor.config.ts](apps/app/capacitor.config.ts), [apps/app/ios/](apps/app/ios/), [pushService.ts](apps/app/src/services/pushService.ts) |
