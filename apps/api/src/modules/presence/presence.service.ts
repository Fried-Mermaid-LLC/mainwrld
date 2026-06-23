import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

// Presence via the API (replaces the RTDB mirror). The client posts a heartbeat
// (and an explicit offline on pagehide); the server writes users/{uid}. Offline
// staleness is derived from lastOnline by readers (no onDisconnect equivalent).
@Injectable()
export class PresenceService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get users() {
    return this.db.collection(COLLECTIONS.users);
  }

  async heartbeat(
    uid: string,
    activity?: string,
    currentBookId?: string | null,
  ): Promise<void> {
    await this.users.doc(uid).set(
      {
        isOnline: true,
        activity: activity ?? 'Idle',
        currentBookId: currentBookId ?? null,
        lastOnline: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  async offline(uid: string): Promise<void> {
    await this.users.doc(uid).set(
      {
        isOnline: false,
        lastOnline: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}
