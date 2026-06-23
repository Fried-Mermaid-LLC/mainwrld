# Migration cutover: Firebase → NestJS API

Status: code complete. `apps/api` (NestJS + firebase-admin) reimplements the
entire backend; `apps/app` now talks only to that API (Firebase Auth is the only
Firebase SDK left on the client). This file is the runtime cutover checklist —
the destructive teardown steps are intentionally NOT done in code because they
break the currently-live prod (old client still reads Firestore + calls
functions) until the new client is shipped.

## 0. One-time GCP setup
- Create an Artifact Registry **docker** repo `mainwrld` in `us-central1`.
- Create a **runtime** service account for Cloud Run with: Firestore User,
  Firebase Auth Admin, Storage Object Admin, FCM (Firebase Cloud Messaging API),
  Secret Manager Secret Accessor.
- Create a **deployer** service account (Artifact Registry Writer, Cloud Run
  Admin, Service Account User) → its JSON key becomes the `GCP_SA_KEY` repo secret.
  Set `CLOUD_RUN_SA` repo secret to the runtime SA email.
- Ensure Secret Manager holds: `RESEND_API_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_TEST_SECRET_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET`,
  `STRIPE_TEST_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `APPLE_ISSUER_ID`,
  `APPLE_KEY_ID`, `APPLE_BUNDLE_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ENV`,
  `INTERNAL_CRON_SECRET` (the same names firebase functions:secrets used —
  most already exist; add `INTERNAL_CRON_SECRET`).

## 1. Deploy the API
- Push to `main` touching `apps/api/**` → `.github/workflows/api-cloudrun.yml`
  builds + deploys, OR run `gcloud run deploy` from the workflow manually.
- Verify: `GET https://<service-url>/healthz` → `{"status":"ok"}` and
  `GET /readyz` → `{"status":"ready"}` (confirms ADC + Firestore reachable).

## 2. Point the client at the API
- Set repo secret `VITE_API_URL` to the Cloud Run URL (or `https://api.mainwrld.com`).
- Local: `apps/app/.env.local` already has `VITE_API_URL=http://localhost:3000`.

## 3. Cloud Scheduler (replaces the scheduled functions)
Create 3 jobs hitting the protected cron endpoints with the
`x-cron-secret: $INTERNAL_CRON_SECRET` header, timezone `America/New_York`:
- `rotate-spotlight`  — `every monday 09:00` → `POST /api/v1/internal/cron/rotate-spotlight`
- `prune-messages`    — `every 24 hours`     → `POST /api/v1/internal/cron/prune-messages`
- `renewal-reminders` — `every day 14:00`    → `POST /api/v1/internal/cron/renewal-reminders`

```
gcloud scheduler jobs create http rotate-spotlight \
  --schedule="0 9 * * 1" --time-zone="America/New_York" \
  --uri="https://<service-url>/api/v1/internal/cron/rotate-spotlight" \
  --http-method=POST --headers="x-cron-secret=<INTERNAL_CRON_SECRET>"
```

## 4. Stripe webhook
- In the Stripe Dashboard, repoint BOTH endpoints (live + test) to
  `https://<service-url>/api/v1/webhooks/stripe`.
- The signing secrets are already in Secret Manager
  (`STRIPE_LIVE_WEBHOOK_SECRET` / `STRIPE_TEST_WEBHOOK_SECRET`).
- Test: `stripe trigger checkout.session.completed` → 200; replay the same event
  → still 200, no double-credit (stripeEvents idempotency).

## 5. Ship the new client
- Push to `main` touching `apps/app/**` → hosting workflow builds with the new
  `VITE_API_URL` and deploys. The bundle no longer pulls Firestore/Storage/RTDB.
- Smoke: signup (profile via API, username claim in token), login, book feed,
  like (optimistic), chat send (SSE delivers to the other session), notification,
  monetization, book checkout.

## 6. OG link previews (`/book/**`)
The SPA preview already works (`publicBookService` → `GET /api/v1/public/books/:id`).
For crawler OG tags pick one:
- Keep the `ogBook` function ONLY for the `/book/**` hosting rewrite (don't tear
  it down in step 7), or
- Add a Firebase Hosting → Cloud Run rewrite and a `/book/:id` route on the API.

## 7. Teardown (ONLY after steps 1–6 verified in prod)
Destructive — do last:
- Remove `functions` + `database` blocks from `firebase.json`; drop the backend
  (functions) deploy step from `.github/workflows/firebase-hosting.yml`.
- Delete the deployed functions: `firebase functions:delete <name>` for each (or
  delete the whole codebase), then remove the `functions/` directory.
- Tighten `firestore.rules` / `storage.rules` to deny-all for clients (the Admin
  SDK ignores rules; the client no longer reads/writes Firestore directly). Keep
  any rule still relied on by a not-yet-migrated reader, otherwise deny-all.
- Remove `database.rules.json` (RTDB presence is gone).

## Known follow-ups (ported 1:1, flagged in code)
- `GET /auth/resolve-username/:username` exposes email by username (legacy public
  `usernames` read). Consider gating.
- Apple IAP: `not-found` is reported as `503 unavailable` (throw inside try);
  `appAppleId` undefined for production verification.
- `createStripeAccountLink`: concurrent first-calls can create two Stripe accounts.
- `updateUserProfile` for a non-self uid (admin handleRemoveStrike) is a no-op —
  add an admin endpoint if that action is needed.
- Old book covers aren't deleted on replace (no standalone delete endpoint).
