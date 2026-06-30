# CLAUDE.md

**Read [README.md](README.md) first.** It is the project orientation doc — repo layout, per-workspace
architecture, a module-by-module API reference, the Firestore/RTDB data model, end-to-end flows,
local-dev/CI commands, and a "Where to look for X" table. Start there instead of re-exploring.
Deep per-workspace guides: [apps/app/README.md](apps/app/README.md) (client) and [apps/api/README.md](apps/api/README.md) (backend).

`mainwrld` = social book reading/writing iOS app (React 19 + Capacitor) with a 3D avatar world,
a NestJS API on Cloud Run, Firebase (Auth/Firestore/RTDB/Storage) + Cloud Functions, and
monetization via Stripe Connect (web) + Apple IAP (iOS). Monorepo: pnpm workspaces + Turborepo.

Critical gotchas (full list in README "Conventions & gotchas"):
- `@mainwrld/types` must build first (`^build` in [turbo.json](turbo.json)); `typecheck` depends on its compiled `dist`.
- Navigation is **not** react-router — a `view` state string synced to the URL ([routes.ts](apps/app/src/navigation/routes.ts)).
- The client hits the NestJS API for almost everything; it touches Firebase directly only for Auth + RTDB (`/world`, `/status`).
- Profanity/`obscenity` and `PRICE_TIERS`/publish helpers are duplicated in app + api + functions on purpose (functions can't import `@mainwrld/types`) — keep them in sync.
- API tests are `*.spec.ts` next to the file under test; unit tests use the in-memory [fake-firestore.ts](apps/api/src/testing/fake-firestore.ts), not the emulator.
