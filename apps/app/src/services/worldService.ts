// Realtime 3D-world layer over Firebase RTDB. The client writes its own avatar
// state to /world/{uid} and subscribes to /world to render everyone else. RTDB's
// onDisconnect removes the node server-side when the socket drops, so a hard kill
// / background / network loss reliably clears the avatar for all peers even when
// no client JS runs — the reason this beats the REST presence heartbeat.
//
// Mirrors presenceService.ts: one handle per uid (idempotent join), all writes
// imperative (no React state) so the per-frame transform writes never trigger a
// re-render. Every function no-ops when rtdb is null (VITE_FIREBASE_DATABASE_URL
// unset) so the world layer can be disabled without touching the rest of the app.
import {
  ref,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  type DatabaseReference,
} from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import type { WorldEntry } from '@/types';

// ~9 Hz while moving. Client interpolation hides the gaps at 60fps; idle stops
// writing entirely (trailing flush still lands the resting pose — see below).
const WORLD_WRITE_MS = 110;

interface Handle {
  uid: string;
  username: string;
  ref: DatabaseReference;
  connectedUnsub: (() => void) | null;
  activity: string;
  rotY: number;
  position: { x: number; y: number; z: number };
  emoteId: number;
  lastWriteAt: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const handles = new Map<string, Handle>();

const worldRef = (uid: string): DatabaseReference => ref(rtdb!, `world/${uid}`);

const doWrite = (handle: Handle, now: number): void => {
  handle.lastWriteAt = now;
  // Include username so the node satisfies the rules' hasChildren(['username',
  // 'position','updatedAt']) validation even if a transform write lands before the
  // .info/connected join set (e.g. the user moves within ~50ms of entering).
  void update(handle.ref, {
    username: handle.username,
    position: handle.position,
    rotY: handle.rotY,
    updatedAt: now,
  });
};

// Trailing-edge throttle: the latest position always lands within one window,
// even the final frame when movement stops (so the resting pose is correct
// despite writes pausing while idle).
const flushOrSchedule = (handle: Handle): void => {
  const now = Date.now();
  const elapsed = now - handle.lastWriteAt;
  if (elapsed >= WORLD_WRITE_MS) {
    if (handle.flushTimer) {
      clearTimeout(handle.flushTimer);
      handle.flushTimer = null;
    }
    doWrite(handle, now);
  } else if (handle.flushTimer == null) {
    handle.flushTimer = setTimeout(() => {
      handle.flushTimer = null;
      doWrite(handle, Date.now());
    }, WORLD_WRITE_MS - elapsed);
  }
};

export const joinWorld = (uid: string, username: string): void => {
  if (!rtdb || !uid || !username || handles.has(uid)) return;
  const r = worldRef(uid);
  const handle: Handle = {
    uid,
    username,
    ref: r,
    connectedUnsub: null,
    activity: 'Exploring',
    rotY: 0,
    position: { x: 0, y: 0, z: 0 },
    emoteId: 0,
    lastWriteAt: 0,
    flushTimer: null,
  };
  handles.set(uid, handle);

  // Re-establish presence on every (re)connect. RTDB clears an onDisconnect after
  // it fires, so a foreground/reconnect must re-arm it and re-write the node, or
  // the next socket drop won't remove the avatar. This is the canonical RTDB
  // presence pattern (subscribe to /.info/connected).
  const connectedRef = ref(rtdb, '.info/connected');
  handle.connectedUnsub = onValue(connectedRef, snap => {
    if (snap.val() !== true) return;
    void onDisconnect(r).remove();
    // Date.now() (not serverTimestamp): the rules validate updatedAt as a plain
    // number, and every other write here already uses client epoch ms, so this
    // keeps the field uniformly numeric and avoids any server-sentinel ambiguity.
    void set(r, {
      username: handle.username,
      position: handle.position,
      rotY: handle.rotY,
      activity: handle.activity,
      updatedAt: Date.now(),
    });
  });
};

export const writeTransform = (
  uid: string,
  x: number,
  y: number,
  z: number,
  rotY: number
): void => {
  const handle = handles.get(uid);
  if (!rtdb || !handle) return;
  handle.position = { x, y, z };
  handle.rotY = rotY;
  flushOrSchedule(handle);
};

export const setWorldActivity = (uid: string, activity: string): void => {
  const handle = handles.get(uid);
  if (!rtdb || !handle || handle.activity === activity) return;
  handle.activity = activity;
  void update(handle.ref, { activity, updatedAt: Date.now() });
};

export const sendEmote = (uid: string, type: string): void => {
  const handle = handles.get(uid);
  if (!rtdb || !handle) return;
  handle.emoteId += 1;
  void update(handle.ref, {
    emote: { type, id: handle.emoteId },
    updatedAt: Date.now(),
  });
};

export const leaveWorld = (uid: string): void => {
  const handle = handles.get(uid);
  if (!handle) return;
  if (handle.flushTimer) clearTimeout(handle.flushTimer);
  handle.connectedUnsub?.();
  // Cancel the armed onDisconnect (we're leaving cleanly) then remove the node.
  void onDisconnect(handle.ref).cancel();
  void remove(handle.ref);
  handles.delete(uid);
};

export const subscribeWorld = (
  cb: (entries: WorldEntry[]) => void
): (() => void) => {
  if (!rtdb) {
    cb([]);
    return () => {};
  }
  const r = ref(rtdb, 'world');
  const unsub = onValue(r, snap => {
    const val = snap.val() as Record<string, Record<string, unknown>> | null;
    if (!val) {
      cb([]);
      return;
    }
    const entries: WorldEntry[] = [];
    for (const [uid, v] of Object.entries(val)) {
      if (!v || typeof v.username !== 'string') continue;
      const pos = (v.position ?? {}) as Record<string, number>;
      const emote = v.emote as { type?: string; id?: number } | undefined;
      entries.push({
        uid,
        username: v.username,
        position: [pos.x ?? 0, pos.y ?? 0, pos.z ?? 0],
        rotY: typeof v.rotY === 'number' ? v.rotY : 0,
        activity: typeof v.activity === 'string' ? v.activity : 'Idle',
        emote:
          emote && typeof emote.type === 'string' && typeof emote.id === 'number'
            ? { type: emote.type, id: emote.id }
            : undefined,
      });
    }
    cb(entries);
  });
  return () => unsub();
};
