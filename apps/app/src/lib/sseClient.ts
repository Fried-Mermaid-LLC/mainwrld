import { fetchEventSource } from '@microsoft/fetch-event-source';
import { auth } from '@/lib/firebase';
import { API_BASE } from '@/lib/apiClient';

// SSE client over fetch-event-source (EventSource can't carry the Bearer header,
// and works in WKWebView via ReadableStream). Custom reconnect loop so a dropped
// connection / expired token reconnects with a freshly refreshed ID token.

export interface SseHandle {
  close: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function subscribe(
  path: string,
  onMessage: (data: unknown) => void
): SseHandle {
  const ctrl = new AbortController();
  let closed = false;

  const loop = async () => {
    while (!closed) {
      const u = auth.currentUser;
      if (!u) {
        await sleep(2000);
        continue;
      }
      let token: string;
      try {
        token = await u.getIdToken();
      } catch {
        await sleep(2000);
        continue;
      }
      try {
        await fetchEventSource(`${API_BASE}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
          openWhenHidden: true,
          onmessage(ev) {
            if (!ev.data || ev.event === 'ping') return;
            try {
              onMessage(JSON.parse(ev.data));
            } catch {
              // ignore malformed frame
            }
          },
          onerror(err) {
            // Bubble to the loop so we reconnect with a fresh token.
            throw err;
          },
        });
        // Returned normally (server closed the stream) — reconnect.
        if (closed) return;
        await sleep(1000);
      } catch {
        if (closed || ctrl.signal.aborted) return;
        // Force-refresh the token for the next attempt (covers 401).
        try {
          await u.getIdToken(true);
        } catch {
          /* ignore */
        }
        await sleep(3000);
      }
    }
  };

  void loop();
  return {
    close: () => {
      closed = true;
      ctrl.abort();
    },
  };
}

export const sseClient = {
  subscribeChat: (onMessage: (data: unknown) => void) =>
    subscribe('/stream/chat', onMessage),
  subscribeNotifications: (onMessage: (data: unknown) => void) =>
    subscribe('/stream/notifications', onMessage),
};
