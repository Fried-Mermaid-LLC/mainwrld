// Presence via the REST API (replaces RTDB). The client posts a heartbeat on an
// interval and an explicit offline when leaving; the server writes users/{uid}.
// Same goOnline/setActivity/goOffline signatures as the RTDB version so callers
// (useAppLifecycle, usePersist, useAuthActions) are unchanged.
//
// Trade-off vs RTDB onDisconnect: no server-detected socket drop — offline lands
// on explicit signal or staleness (lastOnline), so hard kills show online until
// the next read. Accepted with the real-time removal.
import { presenceApi } from '@/services/api/presenceApi';

export type Activity = 'Reading' | 'Writing' | 'Idle';

const HEARTBEAT_MS = 30000;

interface Handle {
  interval: ReturnType<typeof setInterval> | null;
  activity: Activity;
  currentBookId: string | null;
}

// One handle per uid so foreground/background re-registration is idempotent.
const handles = new Map<string, Handle>();

export const goOnline = (uid: string): void => {
  if (!uid || handles.has(uid)) return;
  const handle: Handle = {
    interval: null,
    activity: 'Idle',
    currentBookId: null,
  };
  const beat = () => {
    void presenceApi.heartbeat(handle.activity, handle.currentBookId);
  };
  beat();
  handle.interval = setInterval(beat, HEARTBEAT_MS);
  handles.set(uid, handle);
};

export const setActivity = (
  uid: string,
  activity: Activity,
  currentBookId: string | null
): void => {
  if (!uid) return;
  const handle = handles.get(uid);
  if (handle) {
    handle.activity = activity;
    handle.currentBookId = currentBookId;
  }
  void presenceApi.heartbeat(activity, currentBookId);
};

export const goOffline = (uid: string): void => {
  if (!uid) return;
  const handle = handles.get(uid);
  if (handle) {
    if (handle.interval) clearInterval(handle.interval);
    handles.delete(uid);
  }
  void presenceApi.offline();
};
