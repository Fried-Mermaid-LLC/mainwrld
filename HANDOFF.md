# HANDOFF — App.tsx decomposition (Phase B DONE → Phase C next)

> For the next fresh Claude Code session. Read this fully before touching `src/state/` or `src/views/`.
> Working dir: `/Users/iamursky/mainwlrd`. Language with the user: **Russian**.

## 1. The overall goal

The app was one 9861-line `App.tsx`. Three refactors:

- **Round 1 (DONE, on prod):** moved all frontend into `src/` (config/types/lib/services/data/utils/components/views), extracted 14 view screens, switched to `@/` alias, build output `docs → dist`.
- **Round 2 / Phase B (DONE, NOT yet pushed):** deep decomposition of the monolithic `useAppValue` into **16 domain hooks**. `App` is `<AppProvider><AppShell/></AppProvider>`; `AppProvider` composes the hooks; `AppShell` consumes everything via `useApp()`.
- **Phase C (NEXT):** extract the remaining inline-JSX screens out of `AppShell.renderView()` into `src/views/` components that consume `useApp()` directly.

**Hard rule (still applies to Phase C): every extraction is BEHAVIOR-PRESERVING** — a verbatim code move. Bodies, `useEffect` dependency arrays, and JSX are byte-identical; values are read from the same context fields.

## 2. Architecture now in place (Phase A + B DONE)

- `src/App.tsx` — thin: `<AppProvider><AppShell/></AppProvider>`.
- `src/state/AppContext.ts` — `createContext` + `useApp()`; `AppContextValue = ReturnType<typeof useAppValue>` (inferred — do not hand-type it).
- `src/state/AppProvider.tsx` — **now 465 lines** (was 9861). `useAppValue()` is a thin composition of 16 hooks + the two late-bound bridges + the giant context-value `return {...}` (untouched). `AppProvider` wraps it.
- `src/views/AppShell.tsx` — `useApp()` destructure + `renderView()` + shell return. **This is what Phase C decomposes.**
- `src/state/hooks/` — 16 domain hooks (see §3).

## 3. Phase B result (verify with `git log` / `tsc`)

- `npx tsc --noEmit` → **0 errors**. `npm run build` → green (`dist/`). `tsc --noUnusedLocals` → 0 unused in `AppProvider.tsx`.
- **16 hooks** in `src/state/hooks/`: `useUI`, `useAuth`, `useRewards`, `useAvatar`, `useBooks`, `useSocial`, `useNotifications`, `useComments`, `useChat`, `useCart`, `useReading`, `useAdmin`, `useAuthActions`, `useUserDataLoader`, `usePayments`, `usePersist`.
- Final hook-call order in `useAppValue`: `useUI → useAuth → [addNotification/setReadingActivity ref+LB wrappers] → useRewards → useBooks → useAvatar → useSocial → useNotifications (then `addNotificationRef.current = addNotification`) → useReading (then `setReadingActivityRef.current = setReadingActivity`) → useComments → useChat → useCart → useAdmin → usePersist → useUserDataLoader → usePayments → useAuthActions`.
- **Two late-bound bridges** break dependency cycles: `addNotificationLB` (used by useBooks/useSocial, which run before useNotifications) and `setReadingActivityLB` (used by useSocial's `subscribeToUsers`, which writes reading-activity owned by useReading). Refs are wired right after the owner hook returns; safe because no consumer calls them synchronously on mount (only event handlers / async Firestore callbacks).
- **Adversarially verified PASS** (two multi-agent workflows): byte-identical bodies, unchanged dep arrays (incl. the 24-element persist array), within-hook effect order, cross-hook effect-registration order behavior-neutral, both bridges correct, context-value return parity (same keys).

### Git / deploy (IMPORTANT)
- Working **directly on `main`** (the user chose this; the usual "branch first" rule is waived for this effort).
- Remote: `origin` → `git@github.com:Fried-Mermaid-LLC/mainwrld.git`. (Stale `mocha` remote → old `mochamattel.github.io`; **do not push there**.)
- **Push to `main` AUTO-DEPLOYS to Firebase Hosting prod** via `.github/workflows/firebase-hosting.yml`. So **only push when the user explicitly says so**.
- All Phase B commits (8/N..16/N + the dead-import prune) are **LOCAL only, unpushed**. `origin/main` is still at `0b07be1` (useChat) + whatever was pushed since. Confirm with `git log origin/main..HEAD`.

## 4. The proven extraction recipe (used for all 16; reuse for Phase C views)
1. `grep -nE` in the source to locate the pieces. **Trust grep, not old line numbers — they shift after every extraction.**
2. `Read` each piece for exact boundaries + verbatim text + real deps/JSX.
3. Build the new file with a **one-shot Node `.cjs` script** in `/tmp` that slices exact line ranges verbatim. Pattern: `const sl=(a,b)=>L.slice(a-1,b).join('\n')`; a `chk(line, substr)` helper that aborts on any anchor mismatch; capture slices BEFORE editing; delete pieces **bottom-up** (high line → low) via `splice`; inject the call/destructure via `findIndex` anchors (robust to shifts); do import edits + a `out.replace(/\n{4,}/g,'\n\n\n')` blank-collapse as string ops at the end. `node` it, `rm` it.
4. Gate: `npx tsc --noEmit` (must stay 0) → `npm run build`. Then prune now-unused imports (`tsc --noEmit --noUnusedLocals 2>&1 | grep <file>` lists them exactly). Commit locally.
5. After a batch: run an **adversarial-verification Workflow** (one agent per hook/view + one integration agent) diffing `git show <preRef>:<file>` vs current. See the two `verify-phaseb-*` workflow scripts under the session's `workflows/scripts/` for the schema/shape.

## 5. Phase B blueprint — FULLY EXECUTED
The plan in `/Users/iamursky/.claude/plans/groovy-cuddling-quill.md` and the original §5 here are done. Every hook listed was extracted in the order/placement described, with only the two predicted wrappers (`addNotificationLB`, `setReadingActivityLB`). No third wrapper was needed.

## 6. Critical gotchas (carried forward)
- Dep arrays / effect bodies / JSX are byte-identical on a move. Copy verbatim.
- `userBookDataRef.current = userBookData` (now in `useReading`) is a **top-level render-phase statement, every render — NOT in an effect**. Keep that shape if you ever touch it.
- Firestore subscriptions are **gated on `firebaseUid`** (reports also on `isAdmin`). Preserve guards + deps.
- Don't "fix" pre-existing oddities while moving: the `;-delete next[user.username]` no-op (useAvatar), the `console.log('[Notification Click]', n)` (useNotifications), the commented-out flush listeners (usePersist — the effect is kept to preserve effect count). All verbatim on purpose.

## 7. Known pre-existing issues (separate from the refactor; don't conflate)
- `subscribeToNotifications`/`subscribeToChatMessages` query whole collections **unfiltered** → per-user Firestore rules only allow this for **admins**; non-admin users get post-login errors for those two. Fix later by filtering by username. Flagged, not done.
- Animated avatar models are **58MB+11MB** (`public/characters_animated/animated_models/*.glb`). Optional Draco/meshopt compression. The `.blend` source has broken texture links after the snake_case rename (runtime uses baked `.glb`).
- Cloud Functions: `sendWelcomeEmail` IS deployed (Resend, `RESEND_API_KEY` set). `moderate` (needs `OPENAI_API_KEY`) and `verifyAppleReceipt` (needs 5 `APPLE_*` secrets) are **not deployed** — set secrets + `firebase deploy --only functions` when needed.

## 8. Verification you can / can't do
- **Can:** `npx tsc --noEmit`, `npm run build`, `npm run dev` (:3000), the adversarial-verification Workflow.
- **Can't headless:** real browser smoke (login cascade, persist debounce in Firestore, navigation, 3D world). The user runtime-tests, or it's verified once on prod after a push.

## 9. Phase C — the remaining work (NEXT)
Extract the ~11 remaining inline-JSX screens from `src/views/AppShell.tsx` `renderView()` into `src/views/` components that consume `useApp()` directly: home / 3D-world, daily-rewards (~478 lines), self-profile, library, notifications, notification-settings, blocked-users, and the auth screens (splash / landing / login / signup). Verbatim JSX; data from the same `useApp()` fields. Same recipe (§4), same verbatim/verify discipline. Start by reading `AppShell.tsx` and grepping `renderView` for the `case`/branch boundaries.

## 10. Don'ts
- Don't push to `main` without the user's explicit OK (it deploys to prod).
- Don't change behavior, dep arrays, effect bodies, or JSX during a move.
- Don't re-add the 219MB assets to git (already committed; the user accepted the size).
- Don't gitignore `assets/characters_animated/` or `assets/*_assets/` (user wants them tracked).
