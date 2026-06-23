import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import type { Firestore, QuerySnapshot } from 'firebase-admin/firestore';
import { Observable } from 'rxjs';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

// SSE streams backed by per-connection Firestore admin listeners. Cross-instance
// on Cloud Run (Firestore is the shared source — no Pub/Sub needed). A ~25s
// heartbeat keeps idle proxies from dropping the connection; the client (and
// EventSource-equivalent fetch-event-source) auto-reconnects on drop.
@Injectable()
export class StreamService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  // Live chat messages for `username` (both sent + received), only those created
  // after connect. timestamp is filtered in-memory to avoid composite indexes.
  chatStream(username: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const connectedAt = new Date().toISOString();
      const col = this.db.collection(COLLECTIONS.chatMessages);

      const onSnap = (snap: QuerySnapshot) => {
        for (const ch of snap.docChanges()) {
          if (ch.type !== 'added') continue;
          const data = ch.doc.data();
          if (
            typeof data.timestamp === 'string' &&
            data.timestamp <= connectedAt
          ) {
            continue; // pre-existing doc from the initial snapshot
          }
          subscriber.next({ data: data as Record<string, unknown> });
        }
      };
      const onErr = (err: Error) => subscriber.error(err);

      const unsubSent = col
        .where('from', '==', username)
        .onSnapshot(onSnap, onErr);
      const unsubRecv = col
        .where('to', '==', username)
        .onSnapshot(onSnap, onErr);
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: '' }),
        25000,
      );

      return () => {
        unsubSent();
        unsubRecv();
        clearInterval(heartbeat);
      };
    });
  }

  // Live notifications for `username`, only those created after connect.
  notificationStream(username: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const connectedAt = new Date().toISOString();
      const unsub = this.db
        .collection(COLLECTIONS.notifications)
        .where('recipient', '==', username)
        .onSnapshot((snap) => {
          for (const ch of snap.docChanges()) {
            if (ch.type !== 'added') continue;
            const data = ch.doc.data();
            if (
              typeof data.timestamp === 'string' &&
              data.timestamp <= connectedAt
            ) {
              continue;
            }
            subscriber.next({ data: { id: ch.doc.id, ...data } });
          }
        }, (err) => subscriber.error(err));
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'ping', data: '' }),
        25000,
      );
      return () => {
        unsub();
        clearInterval(heartbeat);
      };
    });
  }
}
