import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import {
  COLLECTIONS,
  FIREBASE_MESSAGING,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import type { CreateNotificationDto } from './dto/create-notification.dto';

export type NotificationDoc = Record<string, unknown> & { id: string };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_MESSAGING) private readonly messaging: Messaging,
  ) {}

  private get col() {
    return this.db.collection(COLLECTIONS.notifications);
  }

  async listForRecipient(username: string): Promise<NotificationDoc[]> {
    const snap = await this.col.where('recipient', '==', username).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificationDoc);
  }

  async create(
    sender: string | undefined,
    dto: CreateNotificationDto,
  ): Promise<{ id: string }> {
    const ref = this.col.doc();
    const notif = Object.fromEntries(
      Object.entries({
        id: ref.id,
        title: dto.title,
        message: dto.message,
        icon: dto.icon,
        timestamp: new Date().toISOString(),
        recipient: dto.recipient,
        sender: dto.sender ?? sender,
        read: false,
        targetId: dto.targetId,
        targetChapterIndex: dto.targetChapterIndex,
        commentId: dto.commentId,
        category: dto.category,
      }).filter(([, v]) => v !== undefined),
    );
    await ref.set(notif);
    // Inline push fan-out (replaces sendPushOnNotification trigger). Best-effort.
    await this.pushFanout(notif).catch((err) =>
      this.logger.error('pushFanout failed', err as Error),
    );
    return { id: ref.id };
  }

  // APNs/FCM push to the recipient's devices. Honors notificationPrefs
  // (per-category + master push), skips system/self, prunes stale tokens.
  private async pushFanout(n: Record<string, unknown>): Promise<void> {
    const category = n.category as string | undefined;
    if (!category || category === 'system') return;
    const recipient = n.recipient as string;
    if (n.sender && n.sender === recipient) return;

    const unameDoc = await this.db
      .collection(COLLECTIONS.usernames)
      .doc(String(recipient).toLowerCase())
      .get();
    const uid = unameDoc.data()?.uid as string | undefined;
    if (!uid) return;
    const userDoc = await this.db.collection(COLLECTIONS.users).doc(uid).get();
    const u = userDoc.data();
    if (!u) return;

    const prefs = (u.notificationPrefs as Record<string, unknown>) ?? {
      newAdmirers: true,
      bookLikes: true,
      comments: true,
      appUpdates: true,
    };
    if (prefs.push === false) return;
    if (category !== 'messages' && prefs[category] === false) return;

    const tokens: string[] = Array.isArray(u.fcmTokens)
      ? (u.fcmTokens as string[])
      : [];
    if (tokens.length === 0) return;

    const res = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: n.title as string, body: n.message as string },
      data: {
        category,
        targetId: String(n.targetId ?? ''),
        targetChapterIndex: String(n.targetChapterIndex ?? ''),
        commentId: String(n.commentId ?? ''),
        sender: String(n.sender ?? ''),
        title: String(n.title ?? ''),
      },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        !r.success &&
        (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token')
      ) {
        stale.push(tokens[i]);
      }
    });
    if (stale.length) {
      await this.db
        .collection(COLLECTIONS.users)
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...stale) });
    }
  }

  async markAllRead(username: string): Promise<void> {
    const snap = await this.col.where('recipient', '==', username).get();
    const batch = this.db.batch();
    let n = 0;
    for (const d of snap.docs) {
      if (!d.data().read) {
        batch.update(d.ref, { read: true });
        n++;
      }
    }
    if (n) await batch.commit();
  }

  async markRead(id: string): Promise<void> {
    try {
      await this.col.doc(id).update({ read: true });
    } catch {
      // Non-fatal — mirrors the client's swallow-on-missing behavior.
    }
  }
}
